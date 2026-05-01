import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  createAtlasOverview,
  createContextPack,
  loadAtlasGraph,
  resolvePathInGraph,
} from '@agent-atlas/core';
import type {
  AtlasDiagnostic,
  AtlasGraph,
  AtlasGraphEdge,
  AtlasProfile,
} from '@agent-atlas/core';
import type { AtlasEntity, AtlasEntityId, AtlasRelationType } from '@agent-atlas/schema';
import { ATLAS_RELATION_TYPES } from '@agent-atlas/schema';
import type {
  AtlasMetadataDebug,
  AtlasUiContextPackRequest,
  AtlasUiEntityDetails,
  AtlasUiHealth,
  AtlasUiNeighborhood,
  AtlasUiOverview,
  AtlasUiPreview,
  AtlasUiResolvePathResponse,
  AtlasUiSummary,
} from '../shared.js';

export interface AtlasUiApiContext {
  rootPath: string;
  profile: AtlasProfile;
}

const DEFAULT_NEIGHBORHOOD_NODE_LIMIT = 80;
const MAX_PREVIEW_BYTES = 200_000;
const PREVIEW_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.csv',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);

export async function handleAtlasUiApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: AtlasUiApiContext,
): Promise<boolean> {
  if (!request.url) {
    return false;
  }

  const url = new URL(request.url, 'http://127.0.0.1');
  if (!url.pathname.startsWith('/api/')) {
    return false;
  }

  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      const graph = await loadAtlasGraph(context.rootPath, { profile: context.profile });
      sendJson(response, createHealth(graph, context));
      return true;
    }

    if (request.method === 'GET' && url.pathname === '/api/atlas') {
      const graph = await loadAtlasGraph(context.rootPath, { profile: context.profile });
      sendJson(response, createSummary(graph, context));
      return true;
    }

    if (request.method === 'GET' && url.pathname === '/api/overview') {
      const graph = await loadAtlasGraph(context.rootPath, { profile: context.profile });
      sendJson(response, createOverview(graph, context.profile));
      return true;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/entity/')) {
      const graph = await loadAtlasGraph(context.rootPath, { profile: context.profile });
      const entityId = decodeURIComponent(url.pathname.slice('/api/entity/'.length)) as AtlasEntityId;
      const entity = graph.index.entitiesById.get(entityId);
      if (!entity) {
        sendError(response, 404, `Atlas entity not found: ${entityId}`);
        return true;
      }
      sendJson(response, createEntityDetails(graph, entity));
      return true;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/neighborhood/')) {
      const graph = await loadAtlasGraph(context.rootPath, { profile: context.profile });
      const entityId = decodeURIComponent(url.pathname.slice('/api/neighborhood/'.length)) as AtlasEntityId;
      if (!graph.index.entitiesById.has(entityId)) {
        sendError(response, 404, `Atlas entity not found: ${entityId}`);
        return true;
      }
      const depth = parsePositiveInteger(url.searchParams.get('depth'), 1);
      const relation = parseRelationFilter(url.searchParams.get('relation'));
      sendJson(response, createNeighborhood(graph, entityId, depth, relation));
      return true;
    }

    if (request.method === 'GET' && url.pathname === '/api/resolve-path') {
      const filePath = url.searchParams.get('path');
      if (!filePath) {
        sendError(response, 400, 'Missing required query parameter: path');
        return true;
      }
      const graph = await loadAtlasGraph(context.rootPath, { profile: context.profile });
      const depth = parsePositiveInteger(url.searchParams.get('depth'), 3);
      const result: AtlasUiResolvePathResponse = {
        ...resolvePathInGraph(graph, filePath, { depth }),
        diagnostics: graph.diagnostics,
      };
      sendJson(response, result);
      return true;
    }

    if (request.method === 'GET' && url.pathname === '/api/preview') {
      const previewPath = url.searchParams.get('path');
      if (!previewPath) {
        sendError(response, 400, 'Missing required query parameter: path');
        return true;
      }
      sendJson(response, await readPreview(context.rootPath, previewPath));
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/api/context-pack') {
      const graph = await loadAtlasGraph(context.rootPath, { profile: context.profile });
      const body = await readJsonBody<AtlasUiContextPackRequest>(request);
      if (!body.task || typeof body.task !== 'string') {
        sendError(response, 400, 'Missing required JSON field: task');
        return true;
      }
      const pack = createContextPack(graph, {
        task: body.task,
        budget: body.budget,
        profile: context.profile,
        deterministic: true,
      });
      sendJson(response, { ...pack, diagnostics: graph.diagnostics });
      return true;
    }

    sendError(response, 404, `Unknown API route: ${url.pathname}`);
    return true;
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : String(error));
    return true;
  }
}

export async function readPreview(
  rootPath: string,
  requestedPath: string,
): Promise<AtlasUiPreview> {
  if (path.isAbsolute(requestedPath)) {
    throw new Error('Preview paths must be repo-relative.');
  }
  if (hasGlob(requestedPath) || hasUriScheme(requestedPath)) {
    throw new Error('Preview path must be a concrete local file path.');
  }

  const absoluteRoot = path.resolve(rootPath);
  const absolutePath = path.resolve(absoluteRoot, requestedPath);
  if (!isPathWithin(absoluteRoot, absolutePath)) {
    throw new Error('Preview path must stay within the atlas root.');
  }

  const extension = path.extname(absolutePath).toLowerCase();
  if (!PREVIEW_EXTENSIONS.has(extension)) {
    throw new Error(`Preview is not supported for ${extension || 'extensionless'} files.`);
  }

  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) {
    throw new Error('Preview path must point to a file.');
  }
  if (fileStat.size > MAX_PREVIEW_BYTES) {
    throw new Error(`Preview file is too large (${fileStat.size} bytes).`);
  }

  const content = await readFile(absolutePath, 'utf8');
  return {
    path: normalizePath(path.relative(absoluteRoot, absolutePath)),
    fileName: path.basename(absolutePath),
    sizeBytes: fileStat.size,
    content,
  };
}

export function createHealth(graph: AtlasGraph, context: AtlasUiApiContext): AtlasUiHealth {
  return {
    status: 'ok',
    rootPath: context.rootPath,
    profile: context.profile,
    entityCount: graph.entities.length,
    diagnosticCounts: countDiagnostics(graph.diagnostics),
    version: 1,
  };
}

export function createSummary(graph: AtlasGraph, context: AtlasUiApiContext): AtlasUiSummary {
  return {
    rootPath: context.rootPath,
    profile: context.profile,
    entityCount: graph.entities.length,
    edgeCount: graph.edges.length,
    explicitEdgeCount: graph.edges.filter((edge) => edge.provenance === 'explicit').length,
    generatedEdgeCount: graph.edges.filter((edge) => edge.provenance === 'generated').length,
    diagnostics: graph.diagnostics,
    diagnosticCounts: countDiagnostics(graph.diagnostics),
    metadataKeyCounts: countMetadataKeys(graph.entities),
    entities: graph.entities,
    edges: graph.edges,
  };
}

export function createOverview(graph: AtlasGraph, profile: AtlasProfile): AtlasUiOverview {
  return createAtlasOverview(graph, profile);
}

export function createEntityDetails(
  graph: AtlasGraph,
  entity: AtlasEntity,
): AtlasUiEntityDetails {
  return {
    entity,
    outgoing: graph.index.outgoingById.get(entity.id) ?? [],
    incoming: graph.index.incomingById.get(entity.id) ?? [],
    diagnostics: graph.diagnostics.filter((diagnostic) => diagnostic.entityId === entity.id),
    metadataDebug: extractMetadataDebug(entity.metadata),
  };
}

export function createNeighborhood(
  graph: AtlasGraph,
  entityId: AtlasEntityId,
  depth: number,
  relation: AtlasRelationType | 'all',
  nodeLimit = DEFAULT_NEIGHBORHOOD_NODE_LIMIT,
): AtlasUiNeighborhood {
  const seen = new Set<AtlasEntityId>([entityId]);
  const queued: Array<{ entityId: AtlasEntityId; distance: number }> = [
    { entityId, distance: 0 },
  ];
  const includedEdges: AtlasGraphEdge[] = [];
  let truncated = false;

  while (queued.length > 0) {
    const current = queued.shift();
    if (!current || current.distance >= depth) {
      continue;
    }

    const adjacent = [
      ...(graph.index.outgoingById.get(current.entityId) ?? []),
      ...(graph.index.incomingById.get(current.entityId) ?? []),
    ].filter((edge) => relation === 'all' || edge.type === relation);

    for (const edge of adjacent) {
      const nextId = edge.source === current.entityId ? edge.target : edge.source;
      if (!includedEdges.some((candidate) => edgeKey(candidate) === edgeKey(edge))) {
        includedEdges.push(edge);
      }
      if (seen.has(nextId)) {
        continue;
      }
      if (seen.size >= nodeLimit) {
        truncated = true;
        continue;
      }
      seen.add(nextId);
      queued.push({ entityId: nextId, distance: current.distance + 1 });
    }
  }

  const nodes = [...seen]
    .map((id) => graph.index.entitiesById.get(id))
    .filter((entity): entity is AtlasEntity => Boolean(entity))
    .sort((left, right) => left.id.localeCompare(right.id));
  const nodeIds = new Set(nodes.map((entity) => entity.id));
  const edges = includedEdges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .sort((left, right) => edgeKey(left).localeCompare(edgeKey(right)));

  return { entityId, depth, truncated, nodeLimit, nodes, edges };
}

export function extractMetadataDebug(metadata: unknown): AtlasMetadataDebug {
  const raw = isRecord(metadata) ? metadata : undefined;
  const agentAtlas = raw && isRecord(raw.agent_atlas) ? raw.agent_atlas : undefined;

  return {
    lastUpdated: readString(agentAtlas, 'last_updated'),
    provenance: readString(agentAtlas, 'provenance'),
    confidence: readNumber(agentAtlas, 'confidence'),
    discoveredBy: readString(agentAtlas, 'discovered_by'),
    source: readString(agentAtlas, 'source'),
    reviewStatus: readString(agentAtlas, 'review_status'),
    raw,
  };
}

function countDiagnostics(
  diagnostics: AtlasDiagnostic[],
): Record<AtlasDiagnostic['level'], number> {
  return {
    error: diagnostics.filter((diagnostic) => diagnostic.level === 'error').length,
    warning: diagnostics.filter((diagnostic) => diagnostic.level === 'warning').length,
    info: diagnostics.filter((diagnostic) => diagnostic.level === 'info').length,
  };
}

function countMetadataKeys(entities: AtlasEntity[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entity of entities) {
    if (!isRecord(entity.metadata)) {
      continue;
    }
    for (const key of Object.keys(entity.metadata)) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function parseRelationFilter(value: string | null): AtlasRelationType | 'all' {
  if (!value || value === 'all') {
    return 'all';
  }
  if ((ATLAS_RELATION_TYPES as readonly string[]).includes(value)) {
    return value as AtlasRelationType;
  }
  return 'all';
}

function parsePositiveInteger(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function edgeKey(edge: Pick<AtlasGraphEdge, 'source' | 'type' | 'target' | 'provenance'>): string {
  return `${edge.source}|${edge.type}|${edge.target}|${edge.provenance}`;
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

function readNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasGlob(value: string): boolean {
  return value.includes('*') || value.includes('?') || value.includes('[') || value.includes(']');
}

function hasUriScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function isPathWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/');
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

function sendJson(response: ServerResponse, body: unknown): void {
  const payload = `${JSON.stringify(body, null, 2)}\n`;
  response.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(payload);
}

function sendError(response: ServerResponse, statusCode: number, message: string): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`${JSON.stringify({ error: message }, null, 2)}\n`);
}
