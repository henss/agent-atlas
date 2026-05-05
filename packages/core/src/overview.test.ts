import { describe, expect, it } from 'vitest';
import type { AtlasEntity } from '@agent-atlas/schema';
import { createGraphIndex, normalizeGraphEdges, type AtlasGraph } from './graph.js';
import { createAtlasOverview, renderAtlasOverviewMarkdown } from './overview.js';

const entities: AtlasEntity[] = [
  {
    id: 'domain:platform',
    kind: 'domain',
    title: 'Platform',
    summary: 'Platform capabilities.',
    relations: [{ type: 'contains', target: 'workflow:ship' }],
  },
  {
    id: 'workflow:ship',
    kind: 'workflow',
    title: 'Ship',
    summary: 'Ship changes.',
    relations: [
      { type: 'uses', target: 'capability:ship-skill' },
      { type: 'uses', target: 'component:cli' },
      { type: 'documented-in', target: 'document:ship-doc' },
      { type: 'tested-by', target: 'test-scope:ship-tests' },
    ],
  },
  {
    id: 'capability:ship-skill',
    kind: 'capability',
    title: 'Ship skill',
    summary: 'Agent release support.',
  },
  {
    id: 'component:cli',
    kind: 'component',
    title: 'CLI',
    summary: 'Command line interface.',
    visibility: 'public',
  },
  {
    id: 'document:ship-doc',
    kind: 'document',
    title: 'Ship Doc',
    summary: 'Release notes.',
  },
  {
    id: 'test-scope:ship-tests',
    kind: 'test-scope',
    title: 'Ship Tests',
    summary: 'Release verification.',
  },
  {
    id: 'component:orphan',
    kind: 'component',
    title: 'Orphan',
    summary: 'Unplaced component.',
  },
  {
    id: 'component:private',
    kind: 'component',
    title: 'Private',
    summary: 'Private component.',
    visibility: 'private',
  },
];

const edges = normalizeGraphEdges(entities);
const graph: AtlasGraph = {
  rootPath: '/repo',
  entities,
  edges,
  index: createGraphIndex(entities, edges),
  diagnostics: [],
};

describe('createAtlasOverview', () => {
  it('derives domains, workflows, implementation surfaces, docs, and tests', () => {
    const overview = createAtlasOverview(graph, 'public');
    const domain = overview.domains[0];
    const workflow = domain?.workflows[0];

    expect(domain?.entity.id).toBe('domain:platform');
    expect(workflow?.entity.id).toBe('workflow:ship');
    expect(workflow?.capabilities.map((entity) => entity.id)).toEqual(['capability:ship-skill']);
    expect(workflow?.components.map((entity) => entity.id)).toEqual(['component:cli']);
    expect(workflow?.documents.map((entity) => entity.id)).toEqual(['document:ship-doc']);
    expect(workflow?.tests.map((entity) => entity.id)).toEqual(['test-scope:ship-tests']);
  });

  it('keeps unplaced entities visible and respects public filtering', () => {
    const publicOverview = createAtlasOverview(graph, 'public');
    const privateOverview = createAtlasOverview(graph, 'private');

    expect(publicOverview.otherEntities.map((entity) => entity.id)).toEqual(['component:orphan']);
    expect(privateOverview.otherEntities.map((entity) => entity.id)).toEqual([
      'component:orphan',
      'component:private',
    ]);
  });

  it('renders compact overview markdown for agent-facing roots', () => {
    const markdown = renderAtlasOverviewMarkdown(createAtlasOverview(graph, 'public'));

    expect(markdown).toContain('# Atlas overview');
    expect(markdown).toContain('## Start here');
    expect(markdown).toContain('workflow:ship');
    expect(markdown).toContain('capability:ship-skill');
    expect(markdown).toContain('component:cli');
  });
});
