import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import {
  createContextPack,
  findNeighbors,
  loadAtlasGraph,
  parseAtlasProfile,
  renderContextPackMarkdown,
  resolvePathInGraph,
} from '@agent-atlas/core';
import type {
  AtlasGraph,
  AtlasGraphEdge,
  AtlasProfile,
  NeighborResult,
} from '@agent-atlas/core';
import type { AtlasEntity, AtlasEntityId, AtlasEntityKind, AtlasRelationType } from '@agent-atlas/schema';

export interface AtlasMcpServerOptions {
  atlasRoot: string;
  profile?: AtlasProfile;
}

export interface ListEntitiesArgs {
  kind?: AtlasEntityKind;
  query?: string;
  profile?: AtlasProfile;
}

export interface DescribeEntityArgs {
  id: AtlasEntityId;
  depth?: number;
  profile?: AtlasProfile;
  budget?: number;
}

export interface ResolvePathArgs {
  path: string;
  profile?: AtlasProfile;
  depth?: number;
}

export interface FindRelatedArgs {
  id: AtlasEntityId;
  relation?: AtlasRelationType;
  depth?: number;
  profile?: AtlasProfile;
}

export interface ContextPackArgs {
  task: string;
  budget?: number;
  profile?: AtlasProfile;
}

export interface AtlasMcpHandlers {
  listEntities(args?: ListEntitiesArgs): Promise<string>;
  describeEntity(args: DescribeEntityArgs): Promise<string>;
  resolvePath(args: ResolvePathArgs): Promise<string>;
  findRelated(args: FindRelatedArgs): Promise<string>;
  contextPack(args: ContextPackArgs): Promise<string>;
  readResource(uri: string): Promise<string>;
}

export function createAtlasMcpHandlers(options: AtlasMcpServerOptions): AtlasMcpHandlers {
  const atlasRoot = options.atlasRoot;
  const defaultProfile = options.profile ?? 'public';

  async function graphFor(profile?: AtlasProfile): Promise<AtlasGraph> {
    return loadAtlasGraph(atlasRoot, { profile: profile ?? defaultProfile });
  }

  return {
    async listEntities(args = {}) {
      const graph = await graphFor(args.profile);
      const query = args.query?.toLowerCase();
      const entities = graph.entities
        .filter((entity) => (args.kind ? entity.kind === args.kind : true))
        .filter((entity) => (query ? entitySearchText(entity).includes(query) : true))
        .sort(compareEntities);

      return renderEntityListMarkdown(entities, args.profile ?? defaultProfile);
    },

    async describeEntity(args) {
      const graph = await graphFor(args.profile);
      const entity = graph.index.entitiesById.get(args.id);
      if (!entity) {
        return `# Entity not found\n\n\`${args.id}\` is not present in profile \`${args.profile ?? defaultProfile}\`.\n`;
      }

      const neighbors = findNeighbors(graph.index, args.id, { depth: args.depth ?? 1 });
      return renderEntityDescriptionMarkdown(
        graph,
        entity,
        neighbors,
        args.profile ?? defaultProfile,
        args.budget,
      );
    },

    async resolvePath(args) {
      const graph = await graphFor(args.profile);
      const result = resolvePathInGraph(graph, args.path, { depth: args.depth ?? 3 });
      return renderPathResolutionMarkdown(args.path, result.normalizedPath, result);
    },

    async findRelated(args) {
      const graph = await graphFor(args.profile);
      if (!graph.index.entitiesById.has(args.id)) {
        return `# Entity not found\n\n\`${args.id}\` is not present in profile \`${args.profile ?? defaultProfile}\`.\n`;
      }

      const neighbors = findNeighbors(graph.index, args.id, {
        depth: args.depth ?? 1,
        relationTypes: args.relation ? [args.relation] : undefined,
      });
      return renderRelatedMarkdown(args.id, neighbors, args.relation, args.depth ?? 1);
    },

    async contextPack(args) {
      const graph = await graphFor(args.profile);
      const pack = createContextPack(graph, {
        task: args.task,
        budget: args.budget,
        profile: args.profile ?? defaultProfile,
        deterministic: true,
      });
      return renderContextPackMarkdown(pack);
    },

    async readResource(uri) {
      return readAtlasResource(uri, {
        defaultProfile,
        listEntities: this.listEntities,
        describeEntity: this.describeEntity,
        resolvePath: this.resolvePath,
        contextPack: this.contextPack,
      });
    },
  };
}

export function createAtlasMcpServer(options: AtlasMcpServerOptions): McpServer {
  const handlers = createAtlasMcpHandlers(options);
  const server = new McpServer(
    {
      name: 'agent-atlas',
      version: '0.12.0',
    },
    {
      capabilities: {},
    },
  );

  server.registerResource(
    'atlas-root',
    'atlas://root',
    {
      title: 'Agent Atlas Root',
      description: 'Compact root summary of the selected atlas profile.',
      mimeType: 'text/markdown',
    },
    async (uri) => resourceText(uri.href, await handlers.listEntities()),
  );

  server.registerResource(
    'atlas-entity',
    new ResourceTemplate('atlas://entity/{id}', { list: undefined }),
    {
      title: 'Atlas Entity',
      description: 'Entity card plus selected graph neighborhood.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) =>
      resourceText(uri.href, await handlers.describeEntity({ id: stringVariable(variables.id) as AtlasEntityId })),
  );

  server.registerResource(
    'atlas-path',
    new ResourceTemplate('atlas://path/{+path}', { list: undefined }),
    {
      title: 'Atlas Path Context',
      description: 'Path ownership and related graph context.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) =>
      resourceText(uri.href, await handlers.resolvePath({ path: stringVariable(variables.path) })),
  );

  server.registerResource(
    'atlas-context-pack',
    new ResourceTemplate('atlas://context-pack{?task,budget,profile}', { list: undefined }),
    {
      title: 'Atlas Context Pack',
      description: 'Task-specific token-budgeted context pack.',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const task = uri.searchParams.get('task') ?? '';
      const budget = parseOptionalInteger(uri.searchParams.get('budget') ?? undefined);
      const profile = parseAtlasProfile(uri.searchParams.get('profile') ?? undefined);
      return resourceText(uri.href, await handlers.contextPack({ task, budget, profile }));
    },
  );

  server.registerTool(
    'list_entities',
    {
      title: 'List Atlas Entities',
      description: 'List compact entity summaries from the selected atlas profile.',
      inputSchema: {
        kind: z.string().optional(),
        query: z.string().optional(),
        profile: z.enum(['public', 'private', 'company']).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => toolText(await handlers.listEntities(args as ListEntitiesArgs)),
  );

  server.registerTool(
    'describe_entity',
    {
      title: 'Describe Atlas Entity',
      description: 'Return one entity card plus selected graph neighbors.',
      inputSchema: {
        id: z.string(),
        depth: z.number().int().positive().optional(),
        profile: z.enum(['public', 'private', 'company']).optional(),
        budget: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => toolText(await handlers.describeEntity(args as DescribeEntityArgs)),
  );

  server.registerTool(
    'resolve_path',
    {
      title: 'Resolve Atlas Path',
      description: 'Resolve a repo-relative path to owners, workflows, documents, and tests.',
      inputSchema: {
        path: z.string(),
        profile: z.enum(['public', 'private', 'company']).optional(),
        depth: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => toolText(await handlers.resolvePath(args as ResolvePathArgs)),
  );

  server.registerTool(
    'find_related',
    {
      title: 'Find Related Atlas Entities',
      description: 'Traverse graph neighborhood around an entity.',
      inputSchema: {
        id: z.string(),
        relation: z.string().optional(),
        depth: z.number().int().positive().optional(),
        profile: z.enum(['public', 'private', 'company']).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => toolText(await handlers.findRelated(args as FindRelatedArgs)),
  );

  server.registerTool(
    'context_pack',
    {
      title: 'Create Atlas Context Pack',
      description: 'Generate a task-specific context pack from the atlas graph.',
      inputSchema: {
        task: z.string(),
        budget: z.number().int().positive().optional(),
        profile: z.enum(['public', 'private', 'company']).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => toolText(await handlers.contextPack(args as ContextPackArgs)),
  );

  return server;
}

export async function startAtlasMcpStdioServer(options: AtlasMcpServerOptions): Promise<void> {
  const server = createAtlasMcpServer(options);
  await server.connect(new StdioServerTransport());
}

interface ReadResourceHandlers {
  defaultProfile: AtlasProfile;
  listEntities(args?: ListEntitiesArgs): Promise<string>;
  describeEntity(args: DescribeEntityArgs): Promise<string>;
  resolvePath(args: ResolvePathArgs): Promise<string>;
  contextPack(args: ContextPackArgs): Promise<string>;
}

async function readAtlasResource(uri: string, handlers: ReadResourceHandlers): Promise<string> {
  const parsed = new URL(uri);
  if (parsed.protocol !== 'atlas:') {
    return `# Unsupported resource\n\nUnsupported URI: \`${uri}\`.\n`;
  }

  if (parsed.hostname === 'root') {
    return handlers.listEntities({ profile: handlers.defaultProfile });
  }

  if (parsed.hostname === 'entity') {
    const id = decodePathValue(parsed.pathname) as AtlasEntityId;
    return handlers.describeEntity({ id, profile: handlers.defaultProfile });
  }

  if (parsed.hostname === 'path') {
    const filePath = decodePathValue(parsed.pathname);
    return handlers.resolvePath({ path: filePath, profile: handlers.defaultProfile });
  }

  if (parsed.hostname === 'context-pack') {
    return handlers.contextPack({
      task: parsed.searchParams.get('task') ?? '',
      budget: parseOptionalInteger(parsed.searchParams.get('budget') ?? undefined),
      profile: parseAtlasProfile(parsed.searchParams.get('profile') ?? handlers.defaultProfile),
    });
  }

  return `# Unsupported resource\n\nUnsupported URI: \`${uri}\`.\n`;
}

function renderEntityListMarkdown(entities: AtlasEntity[], profile: AtlasProfile): string {
  const lines = ['# Atlas entities', '', `Profile: \`${profile}\``, `Count: ${entities.length}`, ''];
  for (const entity of entities) {
    lines.push(`- \`${entity.id}\` (${entity.kind}) - ${entity.title}: ${entity.summary}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderEntityDescriptionMarkdown(
  graph: AtlasGraph,
  entity: AtlasEntity,
  neighbors: NeighborResult[],
  profile: AtlasProfile,
  budget: number | undefined,
): string {
  const outgoing = graph.index.outgoingById.get(entity.id) ?? [];
  const incoming = graph.index.incomingById.get(entity.id) ?? [];
  const lines = [
    `# ${entity.title}`,
    '',
    `ID: \`${entity.id}\``,
    `Kind: \`${entity.kind}\``,
    `Profile: \`${profile}\``,
    '',
    entity.summary,
  ];

  const access = renderAccessLines(entity, profile);
  if (access.length > 0) {
    lines.push('', '## Access', '', ...access);
  }

  lines.push(
    '',
    '## Relations',
    '',
    ...renderEdgeLines('Outgoing', outgoing),
    ...renderEdgeLines('Incoming', incoming),
    '',
    '## Related',
    '',
    ...neighbors.map(
      (neighbor) =>
        `- d${neighbor.distance} \`${neighbor.entity.id}\` (${neighbor.entity.kind}): ${neighbor.entity.title}${neighbor.via ? ` via \`${neighbor.via.type}\`` : ''}`,
    ),
  );

  return fitMarkdownBudget(`${lines.join('\n')}\n`, budget);
}

function renderPathResolutionMarkdown(
  requestedPath: string,
  normalizedPath: string,
  result: ReturnType<typeof resolvePathInGraph>,
): string {
  const lines = ['# Atlas path resolution', '', `Path: \`${normalizedPath || requestedPath}\``, ''];
  lines.push('## Owners', '', ...renderPathMatches(result.owners));
  lines.push('', '## Workflows', '', ...renderPathMatches(result.workflows));
  lines.push('', '## Domains', '', ...renderPathMatches(result.domains));
  lines.push('', '## Documents', '', ...renderPathMatches(result.documents));
  lines.push('', '## Tests', '', ...renderPathMatches(result.tests));
  return `${lines.join('\n')}\n`;
}

function renderRelatedMarkdown(
  id: AtlasEntityId,
  neighbors: NeighborResult[],
  relation: AtlasRelationType | undefined,
  depth: number,
): string {
  const lines = [
    '# Atlas related entities',
    '',
    `Start: \`${id}\``,
    `Depth: ${depth}`,
    `Relation: ${relation ? `\`${relation}\`` : 'all'}`,
    `Count: ${neighbors.length}`,
    '',
  ];
  for (const neighbor of neighbors) {
    lines.push(
      `- d${neighbor.distance} \`${neighbor.entity.id}\` (${neighbor.entity.kind}): ${neighbor.entity.title}${neighbor.via ? ` via \`${neighbor.via.type}\`` : ''}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function renderPathMatches(
  matches: Array<{
    entity: AtlasEntity;
    confidence: number;
    distance?: number;
    pattern?: string;
    matchType?: string;
  }>,
): string[] {
  if (matches.length === 0) {
    return ['- None.'];
  }

  return matches.map((match) => {
    const detail = match.pattern ? ` via \`${match.pattern}\`` : '';
    return `- \`${match.entity.id}\` (${match.confidence.toFixed(2)}): ${match.entity.title}${detail}`;
  });
}

function renderEdgeLines(title: string, edges: AtlasGraphEdge[]): string[] {
  if (edges.length === 0) {
    return [`### ${title}`, '', '- None.'];
  }

  return [
    `### ${title}`,
    '',
    ...edges.map((edge) => {
      const other = title === 'Incoming' ? edge.source : edge.target;
      return `- \`${edge.type}\` \`${other}\`${edge.provenance === 'generated' ? ' _(generated)_' : ''}`;
    }),
  ];
}

function renderAccessLines(entity: AtlasEntity, profile: AtlasProfile): string[] {
  const lines: string[] = [];
  if (entity.uri) {
    lines.push(`- uri: \`${renderUri(entity.uri, profile)}\``);
  }
  if (entity.access?.method) {
    lines.push(`- method: \`${entity.access.method}\``);
  }
  if (profile !== 'public' && entity.access?.server) {
    lines.push(`- server: \`${entity.access.server}\``);
  }
  if (profile !== 'public' && entity.access?.permission) {
    lines.push(`- permission: \`${entity.access.permission}\``);
  }
  if (entity.access?.private_overlay_required || isPrivateUri(entity.uri)) {
    lines.push('- private overlay required');
  }
  return lines;
}

function renderUri(uri: string, profile: AtlasProfile): string {
  if (profile === 'public' && isPrivateUri(uri)) {
    return '[redacted: private reference]';
  }
  return uri;
}

function isPrivateUri(uri: string | undefined): boolean {
  if (!uri) {
    return false;
  }
  const lowerUri = uri.toLowerCase();
  return (
    ['notion:', 'confluence:', 'jira:', 'gdrive:', 'google-drive:', 'gcal:', 'slack:', 'mailto:'].some(
      (scheme) => lowerUri.startsWith(scheme),
    ) ||
    lowerUri.includes('localhost') ||
    /^https?:\/\/(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(lowerUri)
  );
}

function entitySearchText(entity: AtlasEntity): string {
  return [entity.id, entity.kind, entity.title, entity.summary, ...(entity.aliases ?? []), ...(entity.tags ?? [])]
    .join(' ')
    .toLowerCase();
}

function compareEntities(left: AtlasEntity, right: AtlasEntity): number {
  const kindCompare = left.kind.localeCompare(right.kind);
  if (kindCompare !== 0) return kindCompare;
  return left.id.localeCompare(right.id);
}

function toolText(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text }] };
}

function resourceText(uri: string, text: string): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
  return { contents: [{ uri, mimeType: 'text/markdown', text }] };
}

function stringVariable(value: unknown): string {
  if (Array.isArray(value)) {
    return String(value[0] ?? '');
  }
  return String(value ?? '');
}

function decodePathValue(value: string): string {
  return decodeURIComponent(value.replace(/^\/+/, ''));
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function fitMarkdownBudget(markdown: string, budget: number | undefined): string {
  if (!budget) {
    return markdown;
  }
  const maxCharacters = budget * 4;
  if (markdown.length <= maxCharacters) {
    return markdown;
  }
  return `${markdown.slice(0, Math.max(0, maxCharacters - 40)).trimEnd()}\n\n_Trimmed to budget._\n`;
}
