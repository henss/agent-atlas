import type { AtlasEntity, AtlasEntityId, AtlasRelation } from '@agent-atlas/schema';
import { getInverseRelationType } from '@agent-atlas/schema';

export interface AtlasGraphIndex {
  entitiesById: Map<AtlasEntityId, AtlasEntity>;
  outgoingById: Map<AtlasEntityId, AtlasRelation[]>;
  incomingById: Map<AtlasEntityId, AtlasRelation[]>;
}

export function createGraphIndex(entities: AtlasEntity[]): AtlasGraphIndex {
  const entitiesById = new Map<AtlasEntityId, AtlasEntity>();
  const outgoingById = new Map<AtlasEntityId, AtlasRelation[]>();
  const incomingById = new Map<AtlasEntityId, AtlasRelation[]>();

  for (const entity of entities) {
    entitiesById.set(entity.id, entity);
    outgoingById.set(entity.id, entity.relations ?? []);
  }

  for (const entity of entities) {
    for (const relation of entity.relations ?? []) {
      const incoming = incomingById.get(relation.target) ?? [];
      incoming.push({ ...relation, target: entity.id });
      incomingById.set(relation.target, incoming);

      const inverseType = getInverseRelationType(relation.type);
      if (inverseType) {
        const targetOutgoing = outgoingById.get(relation.target) ?? [];
        targetOutgoing.push({
          type: inverseType,
          target: entity.id,
          strength: relation.strength ?? 'inferred',
          source: `inverse:${relation.type}`,
        });
        outgoingById.set(relation.target, targetOutgoing);
      }
    }
  }

  return { entitiesById, outgoingById, incomingById };
}
