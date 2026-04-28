import path from 'node:path';
import type { AtlasEntity, AtlasEntityId } from '@agent-atlas/schema';
import type { AtlasGraph, AtlasGraphEdge } from './graph.js';

export interface PathResolutionOptions {
  depth?: number;
}

export interface PathOwnerMatch {
  entity: AtlasEntity;
  pattern: string;
  matchType: 'entrypoint' | 'code-path';
  confidence: number;
}

export interface PathContextMatch {
  entity: AtlasEntity;
  distance: number;
  confidence: number;
  via: AtlasGraphEdge[];
}

export interface PathResolutionResult {
  inputPath: string;
  normalizedPath: string;
  owners: PathOwnerMatch[];
  workflows: PathContextMatch[];
  domains: PathContextMatch[];
  documents: PathContextMatch[];
  tests: PathContextMatch[];
}

const CONTEXT_KINDS = new Set(['workflow', 'domain', 'document', 'test-scope']);

export function resolvePathInGraph(
  graph: AtlasGraph,
  inputPath: string,
  options: PathResolutionOptions = {},
): PathResolutionResult {
  const normalizedPath = normalizeInputPath(graph.rootPath, inputPath);
  const owners = findPathOwners(graph.entities, normalizedPath);
  const context = findPathContext(graph, owners, options.depth ?? 3);

  return {
    inputPath,
    normalizedPath,
    owners,
    workflows: context.filter((match) => match.entity.kind === 'workflow'),
    domains: context.filter((match) => match.entity.kind === 'domain'),
    documents: context.filter((match) => match.entity.kind === 'document'),
    tests: context.filter((match) => match.entity.kind === 'test-scope'),
  };
}

export function findPathOwners(entities: AtlasEntity[], normalizedPath: string): PathOwnerMatch[] {
  const matches: PathOwnerMatch[] = [];

  for (const entity of entities) {
    if (entity.kind !== 'component' || !entity.code) {
      continue;
    }

    for (const entrypoint of entity.code.entrypoints ?? []) {
      const normalizedEntrypoint = normalizePath(entrypoint);
      if (normalizedPath === normalizedEntrypoint) {
        matches.push({
          entity,
          pattern: entrypoint,
          matchType: 'entrypoint',
          confidence: 1,
        });
      }
    }

    for (const codePath of entity.code.paths ?? []) {
      const normalizedPattern = normalizePath(codePath);
      if (!globMatches(normalizedPattern, normalizedPath)) {
        continue;
      }

      matches.push({
        entity,
        pattern: codePath,
        matchType: 'code-path',
        confidence: scoreGlobMatch(normalizedPattern),
      });
    }
  }

  return dedupeOwnerMatches(matches).sort((left, right) => {
    const confidenceCompare = right.confidence - left.confidence;
    if (confidenceCompare !== 0) return confidenceCompare;
    return left.entity.id.localeCompare(right.entity.id);
  });
}

function findPathContext(
  graph: AtlasGraph,
  owners: PathOwnerMatch[],
  maxDepth: number,
): PathContextMatch[] {
  const ownerIds = new Set(owners.map((owner) => owner.entity.id));
  const bestOwnerConfidence = new Map<AtlasEntityId, number>();
  const results = new Map<AtlasEntityId, PathContextMatch>();
  const queue: Array<{
    entityId: AtlasEntityId;
    distance: number;
    confidence: number;
    via: AtlasGraphEdge[];
  }> = [];

  for (const owner of owners) {
    bestOwnerConfidence.set(
      owner.entity.id,
      Math.max(bestOwnerConfidence.get(owner.entity.id) ?? 0, owner.confidence),
    );
  }

  for (const [entityId, confidence] of bestOwnerConfidence.entries()) {
    queue.push({ entityId, distance: 0, confidence, via: [] });
  }

  const seen = new Set<AtlasEntityId>(ownerIds);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.distance >= maxDepth) {
      continue;
    }

    for (const edge of graph.index.outgoingById.get(current.entityId) ?? []) {
      const entity = graph.index.entitiesById.get(edge.target);
      if (!entity || seen.has(entity.id)) {
        continue;
      }

      const distance = current.distance + 1;
      const confidence = Math.max(0.1, roundConfidence(current.confidence - distance * 0.1));
      const via = [...current.via, edge];
      seen.add(entity.id);
      queue.push({ entityId: entity.id, distance, confidence, via });

      if (CONTEXT_KINDS.has(entity.kind)) {
        results.set(entity.id, { entity, distance, confidence, via });
      }
    }
  }

  return [...results.values()].sort((left, right) => {
    const distanceCompare = left.distance - right.distance;
    if (distanceCompare !== 0) return distanceCompare;
    const confidenceCompare = right.confidence - left.confidence;
    if (confidenceCompare !== 0) return confidenceCompare;
    return left.entity.id.localeCompare(right.entity.id);
  });
}

function normalizeInputPath(rootPath: string, inputPath: string): string {
  const absoluteInput = path.resolve(inputPath);
  const absoluteRoot = path.resolve(rootPath);

  if (path.isAbsolute(inputPath) && isPathWithin(absoluteRoot, absoluteInput)) {
    return normalizePath(path.relative(absoluteRoot, absoluteInput));
  }

  return normalizePath(inputPath);
}

function isPathWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function dedupeOwnerMatches(matches: PathOwnerMatch[]): PathOwnerMatch[] {
  const bestByEntity = new Map<AtlasEntityId, PathOwnerMatch>();

  for (const match of matches) {
    const previous = bestByEntity.get(match.entity.id);
    if (!previous || match.confidence > previous.confidence) {
      bestByEntity.set(match.entity.id, match);
    }
  }

  return [...bestByEntity.values()];
}

function globMatches(pattern: string, targetPath: string): boolean {
  return globToRegex(pattern).test(targetPath);
}

function globToRegex(pattern: string): RegExp {
  let source = '^';

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === '*' && next === '*') {
      source += '.*';
      index += 1;
      continue;
    }

    if (char === '*') {
      source += '[^/]*';
      continue;
    }

    if (char === '?') {
      source += '[^/]';
      continue;
    }

    source += escapeRegex(char);
  }

  source += '$';
  return new RegExp(source);
}

function scoreGlobMatch(pattern: string): number {
  if (!hasGlob(pattern)) {
    return 0.95;
  }

  const literalCharacterCount = pattern.replace(/[*?]/g, '').length;
  const literalRatio = literalCharacterCount / Math.max(pattern.length, 1);
  const fixedSegmentCount = pattern
    .split('/')
    .filter((segment) => segment.length > 0 && !hasGlob(segment)).length;
  const segmentSpecificity = Math.min(fixedSegmentCount * 0.1, 0.35);
  return roundConfidence(Math.min(0.94, 0.5 + segmentSpecificity + literalRatio * 0.1));
}

function hasGlob(pattern: string): boolean {
  return pattern.includes('*') || pattern.includes('?');
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}
