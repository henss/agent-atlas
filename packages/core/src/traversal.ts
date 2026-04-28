import type { AtlasEntity, AtlasEntityId, AtlasRelationType } from '@agent-atlas/schema';
import type { AtlasGraphIndex } from './graph.js';

export interface NeighborOptions {
  depth?: number;
  relationTypes?: AtlasRelationType[];
}

export interface NeighborResult {
  entity: AtlasEntity;
  distance: number;
  via?: AtlasRelationType;
}

export function findNeighbors(
  graph: AtlasGraphIndex,
  startId: AtlasEntityId,
  options: NeighborOptions = {},
): NeighborResult[] {
  const maxDepth = options.depth ?? 1;
  const allowed = options.relationTypes ? new Set(options.relationTypes) : undefined;
  const results: NeighborResult[] = [];
  const seen = new Set<AtlasEntityId>([startId]);
  const queue: Array<{ id: AtlasEntityId; distance: number; via?: AtlasRelationType }> = [
    { id: startId, distance: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.distance >= maxDepth) continue;

    for (const relation of graph.outgoingById.get(current.id) ?? []) {
      if (allowed && !allowed.has(relation.type)) continue;
      if (seen.has(relation.target)) continue;
      const entity = graph.entitiesById.get(relation.target);
      if (!entity) continue;
      seen.add(relation.target);
      const next = { id: relation.target, distance: current.distance + 1, via: relation.type };
      queue.push(next);
      results.push({ entity, distance: next.distance, via: relation.type });
    }
  }

  return results;
}
