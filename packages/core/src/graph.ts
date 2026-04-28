import type { AtlasEntity, AtlasEntityId, AtlasRelation, AtlasRelationType } from '@agent-atlas/schema';
import { getInverseRelationType } from '@agent-atlas/schema';
import type { AtlasDiagnostic } from './diagnostics.js';
import type { AtlasProfile } from './profile.js';
import { validateAtlas } from './validation.js';

export interface AtlasGraphIndex {
  entitiesById: Map<AtlasEntityId, AtlasEntity>;
  outgoingById: Map<AtlasEntityId, AtlasGraphEdge[]>;
  incomingById: Map<AtlasEntityId, AtlasGraphEdge[]>;
}

export interface AtlasGraphEdge {
  type: AtlasRelationType;
  source: AtlasEntityId;
  target: AtlasEntityId;
  summary?: string;
  strength?: AtlasRelation['strength'];
  visibility?: AtlasRelation['visibility'];
  provenance: 'explicit' | 'generated';
  generatedFrom?: AtlasRelationType;
}

export interface AtlasGraph {
  rootPath: string;
  entities: AtlasEntity[];
  edges: AtlasGraphEdge[];
  index: AtlasGraphIndex;
  diagnostics: AtlasDiagnostic[];
}

export interface LoadAtlasGraphOptions {
  profile?: AtlasProfile;
}

export async function loadAtlasGraph(
  rootPath: string,
  options: LoadAtlasGraphOptions = {},
): Promise<AtlasGraph> {
  const validation = await validateAtlas(rootPath, { profile: options.profile });
  const graphEntities = keepFirstEntityById(validation.entities);
  const edges = normalizeGraphEdges(graphEntities);
  const index = createGraphIndex(graphEntities, edges);
  const diagnostics = [...validation.diagnostics, ...createGraphDiagnostics(graphEntities, edges)];

  return {
    rootPath: validation.rootPath,
    entities: graphEntities,
    edges,
    index,
    diagnostics,
  };
}

export function normalizeGraphEdges(entities: AtlasEntity[]): AtlasGraphEdge[] {
  const entityIds = new Set(entities.map((entity) => entity.id));
  const explicitEdges: AtlasGraphEdge[] = [];
  const edgeKeys = new Set<string>();

  for (const entity of entities) {
    for (const relation of entity.relations ?? []) {
      if (!entityIds.has(relation.target)) {
        continue;
      }

      const edge: AtlasGraphEdge = {
        type: relation.type,
        source: entity.id,
        target: relation.target,
        summary: relation.summary,
        strength: relation.strength,
        visibility: relation.visibility,
        provenance: 'explicit',
      };
      explicitEdges.push(edge);
      edgeKeys.add(edgeKey(edge));
    }
  }

  const generatedEdges: AtlasGraphEdge[] = [];
  for (const edge of explicitEdges) {
    const inverseType = getInverseRelationType(edge.type);
    if (!inverseType) {
      continue;
    }

    const inverseEdge: AtlasGraphEdge = {
      type: inverseType,
      source: edge.target,
      target: edge.source,
      summary: edge.summary,
      strength: edge.strength ?? 'inferred',
      visibility: edge.visibility,
      provenance: 'generated',
      generatedFrom: edge.type,
    };

    const key = edgeKey(inverseEdge);
    if (edgeKeys.has(key)) {
      continue;
    }

    edgeKeys.add(key);
    generatedEdges.push(inverseEdge);
  }

  return [...explicitEdges, ...generatedEdges].sort((left, right) => {
    const sourceCompare = left.source.localeCompare(right.source);
    if (sourceCompare !== 0) return sourceCompare;
    const typeCompare = left.type.localeCompare(right.type);
    if (typeCompare !== 0) return typeCompare;
    return left.target.localeCompare(right.target);
  });
}

export function createGraphIndex(
  entities: AtlasEntity[],
  edges = normalizeGraphEdges(entities),
): AtlasGraphIndex {
  const entitiesById = new Map<AtlasEntityId, AtlasEntity>();
  const outgoingById = new Map<AtlasEntityId, AtlasGraphEdge[]>();
  const incomingById = new Map<AtlasEntityId, AtlasGraphEdge[]>();

  for (const entity of entities) {
    entitiesById.set(entity.id, entity);
    outgoingById.set(entity.id, []);
    incomingById.set(entity.id, []);
  }

  for (const edge of edges) {
    outgoingById.get(edge.source)?.push(edge);
    incomingById.get(edge.target)?.push(edge);
  }

  return { entitiesById, outgoingById, incomingById };
}

export function createGraphDiagnostics(
  entities: AtlasEntity[],
  edges: AtlasGraphEdge[],
): AtlasDiagnostic[] {
  const diagnostics: AtlasDiagnostic[] = [];
  const connectedEntityIds = new Set<AtlasEntityId>();

  for (const edge of edges) {
    connectedEntityIds.add(edge.source);
    connectedEntityIds.add(edge.target);
  }

  for (const entity of entities) {
    if (!connectedEntityIds.has(entity.id)) {
      diagnostics.push({
        level: 'info',
        code: 'ORPHAN_ENTITY',
        message: `Entity ${entity.id} has no graph relations.`,
        entityId: entity.id,
      });
    }
  }

  for (const cycle of findCyclicComponents(entities, edges)) {
    diagnostics.push({
      level: 'info',
      code: 'RELATION_CYCLE',
      message: `Relation cycle detected among ${cycle.join(', ')}.`,
      entityId: cycle[0],
    });
  }

  return diagnostics;
}

function keepFirstEntityById(entities: AtlasEntity[]): AtlasEntity[] {
  const seen = new Set<AtlasEntityId>();
  const uniqueEntities: AtlasEntity[] = [];

  for (const entity of entities) {
    if (seen.has(entity.id)) {
      continue;
    }
    seen.add(entity.id);
    uniqueEntities.push(entity);
  }

  return uniqueEntities;
}

function edgeKey(edge: Pick<AtlasGraphEdge, 'source' | 'type' | 'target'>): string {
  return `${edge.source}|${edge.type}|${edge.target}`;
}

function findCyclicComponents(entities: AtlasEntity[], edges: AtlasGraphEdge[]): AtlasEntityId[][] {
  const explicitEdges = edges.filter((edge) => edge.provenance === 'explicit');
  const outgoing = new Map<AtlasEntityId, AtlasEntityId[]>();
  const indexes = new Map<AtlasEntityId, number>();
  const lowLinks = new Map<AtlasEntityId, number>();
  const stack: AtlasEntityId[] = [];
  const onStack = new Set<AtlasEntityId>();
  const components: AtlasEntityId[][] = [];
  let index = 0;

  for (const entity of entities) {
    outgoing.set(entity.id, []);
  }

  for (const edge of explicitEdges) {
    outgoing.get(edge.source)?.push(edge.target);
  }

  for (const entity of entities) {
    if (!indexes.has(entity.id)) {
      connect(entity.id);
    }
  }

  return components
    .filter((component) => component.length > 1 || hasSelfLoop(component[0], outgoing))
    .map((component) => component.sort())
    .sort((left, right) => left.join('|').localeCompare(right.join('|')));

  function connect(entityId: AtlasEntityId): void {
    indexes.set(entityId, index);
    lowLinks.set(entityId, index);
    index += 1;
    stack.push(entityId);
    onStack.add(entityId);

    for (const target of outgoing.get(entityId) ?? []) {
      if (!indexes.has(target)) {
        connect(target);
        lowLinks.set(
          entityId,
          Math.min(lowLinks.get(entityId) ?? 0, lowLinks.get(target) ?? 0),
        );
      } else if (onStack.has(target)) {
        lowLinks.set(entityId, Math.min(lowLinks.get(entityId) ?? 0, indexes.get(target) ?? 0));
      }
    }

    if (lowLinks.get(entityId) !== indexes.get(entityId)) {
      return;
    }

    const component: AtlasEntityId[] = [];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        break;
      }
      onStack.delete(current);
      component.push(current);
      if (current === entityId) {
        break;
      }
    }

    components.push(component);
  }
}

function hasSelfLoop(
  entityId: AtlasEntityId | undefined,
  outgoing: Map<AtlasEntityId, AtlasEntityId[]>,
): boolean {
  return entityId ? (outgoing.get(entityId) ?? []).includes(entityId) : false;
}
