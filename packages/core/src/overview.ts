import type { AtlasEntity, AtlasEntityId, AtlasEntityKind } from '@agent-atlas/schema';
import type { AtlasGraph, AtlasGraphEdge } from './graph.js';
import type { AtlasProfile } from './profile.js';

export interface AtlasOverviewEntityRef {
  id: AtlasEntityId;
  kind: AtlasEntityKind;
  title: string;
  summary: string;
  relation?: string;
  provenance?: AtlasGraphEdge['provenance'];
}

export interface AtlasOverviewWorkflow {
  entity: AtlasOverviewEntityRef;
  components: AtlasOverviewEntityRef[];
  documents: AtlasOverviewEntityRef[];
  tests: AtlasOverviewEntityRef[];
}

export interface AtlasOverviewDomain {
  entity: AtlasOverviewEntityRef;
  workflows: AtlasOverviewWorkflow[];
  components: AtlasOverviewEntityRef[];
  documents: AtlasOverviewEntityRef[];
  tests: AtlasOverviewEntityRef[];
}

export interface AtlasOverview {
  rootPath: string;
  profile: AtlasProfile;
  counts: {
    domains: number;
    workflows: number;
    components: number;
    documents: number;
    tests: number;
    entities: number;
    relations: number;
  };
  domains: AtlasOverviewDomain[];
  otherEntities: AtlasOverviewEntityRef[];
}

export function createAtlasOverview(
  graph: AtlasGraph,
  profile: AtlasProfile = 'public',
): AtlasOverview {
  const entities = filterEntitiesByProfile(graph.entities, profile);
  const entityIds = new Set(entities.map((entity) => entity.id));
  const edges = dedupeEdges(
    graph.edges.filter((edge) => entityIds.has(edge.source) && entityIds.has(edge.target)),
  );
  const included = new Set<AtlasEntityId>();
  const domains = entities.filter((entity) => entity.kind === 'domain');

  const overviewDomains = domains
    .map((domain) => createDomainOverview(domain, entities, edges, included))
    .sort(compareDomains);

  const otherEntities = entities
    .filter((entity) => !included.has(entity.id))
    .map((entity) => toEntityRef(entity))
    .sort(compareRefs);

  return {
    rootPath: graph.rootPath,
    profile,
    counts: {
      domains: domains.length,
      workflows: entities.filter((entity) => entity.kind === 'workflow').length,
      components: entities.filter((entity) => entity.kind === 'component').length,
      documents: entities.filter((entity) => entity.kind === 'document').length,
      tests: entities.filter((entity) => entity.kind === 'test-scope').length,
      entities: entities.length,
      relations: edges.length,
    },
    domains: overviewDomains,
    otherEntities,
  };
}

export function renderAtlasOverviewMarkdown(overview: AtlasOverview): string {
  const lines = [
    '# Atlas overview',
    '',
    `Profile: \`${overview.profile}\``,
    '',
    '## What this atlas represents',
    '',
    ...overview.domains.map(
      (domain) => `- \`${domain.entity.id}\` - ${domain.entity.title}: ${domain.entity.summary}`,
    ),
    '',
    '## Start here',
    '',
    '- Begin with a domain to understand the broad area.',
    '- Drill into workflows to see capabilities and processes.',
    '- Follow components, documents, and tests only as needed for the task.',
    '- Use path resolution for bottom-up navigation from a source file.',
    '',
    '## Major capabilities',
    '',
  ];

  for (const domain of overview.domains) {
    lines.push(`### ${domain.entity.title}`, '');
    const workflows = domain.workflows.length > 0 ? domain.workflows : [];
    if (workflows.length === 0) {
      lines.push('- No workflows are directly attached to this domain.', '');
      continue;
    }
    for (const workflow of workflows) {
      const componentText = workflow.components
        .slice(0, 4)
        .map((component) => `\`${component.id}\``)
        .join(', ');
      lines.push(
        `- \`${workflow.entity.id}\` - ${workflow.entity.title}: ${workflow.entity.summary}`,
      );
      if (componentText) {
        lines.push(`  Components: ${componentText}`);
      }
    }
    lines.push('');
  }

  lines.push('## Implementation surfaces', '');
  for (const domain of overview.domains) {
    const components = uniqueRefs([
      ...domain.components,
      ...domain.workflows.flatMap((workflow) => workflow.components),
    ]);
    if (components.length === 0) {
      continue;
    }
    lines.push(`### ${domain.entity.title}`, '');
    for (const component of components) {
      lines.push(`- \`${component.id}\` - ${component.title}: ${component.summary}`);
    }
    lines.push('');
  }

  lines.push('## Verification', '');
  const tests = uniqueRefs(
    overview.domains.flatMap((domain) => [
      ...domain.tests,
      ...domain.workflows.flatMap((workflow) => workflow.tests),
    ]),
  );
  if (tests.length === 0) {
    lines.push('- No test scopes are attached to the overview.');
  } else {
    for (const test of tests) {
      lines.push(`- \`${test.id}\` - ${test.title}: ${test.summary}`);
    }
  }

  lines.push(
    '',
    '## How to drill down',
    '',
    '- `atlas show <entity-id>` shows one entity and its immediate relations.',
    '- `atlas neighbors <entity-id> --depth 2` traverses nearby graph context.',
    '- `atlas resolve-path <path>` maps source files to owning context.',
    '- `atlas context-pack "<task>" --budget 4000` selects task-specific reads and verification.',
  );

  if (overview.otherEntities.length > 0) {
    lines.push('', '## Other entities', '');
    for (const entity of overview.otherEntities.slice(0, 20)) {
      lines.push(`- \`${entity.id}\` (${entity.kind}) - ${entity.title}: ${entity.summary}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function createDomainOverview(
  domain: AtlasEntity,
  entities: AtlasEntity[],
  edges: AtlasGraphEdge[],
  included: Set<AtlasEntityId>,
): AtlasOverviewDomain {
  included.add(domain.id);
  const workflows = collectRelated(domain.id, 'workflow', entities, edges, ['contains'])
    .map((workflow) => createWorkflowOverview(workflow, entities, edges, included))
    .sort((left, right) => compareRefs(left.entity, right.entity));
  const components = collectRelated(domain.id, 'component', entities, edges, ['contains']);
  const documents = collectSupporting(domain.id, 'document', entities, edges);
  const tests = collectSupporting(domain.id, 'test-scope', entities, edges);

  for (const entity of [...components, ...documents, ...tests]) {
    included.add(entity.id);
  }

  return {
    entity: toEntityRef(domain),
    workflows,
    components: components.map((entity) => toEntityRef(entity)).sort(compareRefs),
    documents: documents.map((entity) => toEntityRef(entity)).sort(compareRefs),
    tests: tests.map((entity) => toEntityRef(entity)).sort(compareRefs),
  };
}

function createWorkflowOverview(
  workflow: AtlasEntity,
  entities: AtlasEntity[],
  edges: AtlasGraphEdge[],
  included: Set<AtlasEntityId>,
): AtlasOverviewWorkflow {
  included.add(workflow.id);
  const components = uniqueEntities([
    ...collectRelated(workflow.id, 'component', entities, edges, ['uses', 'implemented-by']),
    ...collectIncoming(workflow.id, 'component', entities, edges, ['implements']),
  ]);
  const documents = collectSupporting(workflow.id, 'document', entities, edges);
  const tests = collectSupporting(workflow.id, 'test-scope', entities, edges);

  for (const entity of [...components, ...documents, ...tests]) {
    included.add(entity.id);
  }

  return {
    entity: toEntityRef(workflow),
    components: components.map((entity) => toEntityRef(entity)).sort(compareRefs),
    documents: documents.map((entity) => toEntityRef(entity)).sort(compareRefs),
    tests: tests.map((entity) => toEntityRef(entity)).sort(compareRefs),
  };
}

function collectSupporting(
  sourceId: AtlasEntityId,
  kind: AtlasEntityKind,
  entities: AtlasEntity[],
  edges: AtlasGraphEdge[],
): AtlasEntity[] {
  if (kind === 'document') {
    return uniqueEntities([
      ...collectRelated(sourceId, kind, entities, edges, ['documented-in']),
      ...collectIncoming(sourceId, kind, entities, edges, ['documents']),
    ]);
  }
  if (kind === 'test-scope') {
    return uniqueEntities([
      ...collectRelated(sourceId, kind, entities, edges, ['tested-by']),
      ...collectIncoming(sourceId, kind, entities, edges, ['verifies']),
    ]);
  }
  return [];
}

function collectRelated(
  sourceId: AtlasEntityId,
  kind: AtlasEntityKind,
  entities: AtlasEntity[],
  edges: AtlasGraphEdge[],
  relationTypes: string[],
): AtlasEntity[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  return uniqueEntities(
    edges
      .filter((edge) => edge.source === sourceId && relationTypes.includes(edge.type))
      .map((edge) => byId.get(edge.target))
      .filter((entity): entity is AtlasEntity => entity !== undefined && entity.kind === kind),
  );
}

function collectIncoming(
  targetId: AtlasEntityId,
  kind: AtlasEntityKind,
  entities: AtlasEntity[],
  edges: AtlasGraphEdge[],
  relationTypes: string[],
): AtlasEntity[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  return uniqueEntities(
    edges
      .filter((edge) => edge.target === targetId && relationTypes.includes(edge.type))
      .map((edge) => byId.get(edge.source))
      .filter((entity): entity is AtlasEntity => entity !== undefined && entity.kind === kind),
  );
}

function dedupeEdges(edges: AtlasGraphEdge[]): AtlasGraphEdge[] {
  const explicitKeys = new Set(
    edges
      .filter((edge) => edge.provenance === 'explicit')
      .map((edge) => `${edge.source}|${edge.type}|${edge.target}`),
  );
  return edges.filter((edge) => {
    const key = `${edge.source}|${edge.type}|${edge.target}`;
    return edge.provenance === 'explicit' || !explicitKeys.has(key);
  });
}

function toEntityRef(entity: AtlasEntity): AtlasOverviewEntityRef {
  return {
    id: entity.id,
    kind: entity.kind,
    title: entity.title,
    summary: entity.summary,
  };
}

function uniqueEntities(entities: AtlasEntity[]): AtlasEntity[] {
  const seen = new Set<AtlasEntityId>();
  const result: AtlasEntity[] = [];
  for (const entity of entities) {
    if (seen.has(entity.id)) {
      continue;
    }
    seen.add(entity.id);
    result.push(entity);
  }
  return result.sort(compareEntities);
}

function uniqueRefs(refs: AtlasOverviewEntityRef[]): AtlasOverviewEntityRef[] {
  const seen = new Set<AtlasEntityId>();
  const result: AtlasOverviewEntityRef[] = [];
  for (const ref of refs) {
    if (seen.has(ref.id)) {
      continue;
    }
    seen.add(ref.id);
    result.push(ref);
  }
  return result.sort(compareRefs);
}

function compareDomains(left: AtlasOverviewDomain, right: AtlasOverviewDomain): number {
  const leftCount =
    left.workflows.length + left.components.length + left.documents.length + left.tests.length;
  const rightCount =
    right.workflows.length + right.components.length + right.documents.length + right.tests.length;
  const countCompare = rightCount - leftCount;
  return countCompare !== 0 ? countCompare : compareRefs(left.entity, right.entity);
}

function compareEntities(left: AtlasEntity, right: AtlasEntity): number {
  return left.id.localeCompare(right.id);
}

function compareRefs(left: AtlasOverviewEntityRef, right: AtlasOverviewEntityRef): number {
  return left.id.localeCompare(right.id);
}

function filterEntitiesByProfile(entities: AtlasEntity[], profile: AtlasProfile): AtlasEntity[] {
  if (profile !== 'public') {
    return [...entities].sort(compareEntities);
  }

  return entities
    .filter((entity) => entity.visibility === undefined || entity.visibility === 'public')
    .sort(compareEntities);
}
