import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAtlasGraph } from './graph.js';
import { findNeighbors } from './traversal.js';

describe('loadAtlasGraph', () => {
  it('loads entities and generates inverse edges', async () => {
    const graph = await loadAtlasGraph(path.resolve('../../examples/personal-ops-sanitized'));

    const outgoing = graph.index.outgoingById.get('resource:primary-calendar') ?? [];
    expect(graph.index.entitiesById.get('workflow:plan-week')?.title).toBe('Plan Week');
    expect(outgoing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'written-by',
          source: 'resource:primary-calendar',
          target: 'component:google-calendar-adapter',
          provenance: 'generated',
          generatedFrom: 'writes-to',
        }),
      ]),
    );
  });

  it('applies profile overlays before graph normalization', async () => {
    const graph = await loadAtlasGraph(path.resolve('../../examples/personal-ops-sanitized'), {
      profile: 'private',
    });

    expect(graph.index.entitiesById.get('resource:primary-calendar')?.uri).toBe(
      'gcal://calendar/sanitized-primary',
    );
    expect(graph.index.entitiesById.get('document:weekly-planning-system')?.access?.server).toBe(
      'notion',
    );
  });

  it('traverses neighbors with relation filters', async () => {
    const graph = await loadAtlasGraph(path.resolve('../../examples/personal-ops-sanitized'));
    const neighbors = findNeighbors(graph.index, 'workflow:plan-week', {
      depth: 1,
      relationTypes: ['uses'],
    });

    expect(neighbors.map((neighbor) => neighbor.entity.id).sort()).toEqual([
      'component:google-calendar-adapter',
      'component:mealie-adapter',
      'component:planning-output-helpers',
      'component:weekly-planner',
    ]);
    expect(neighbors.every((neighbor) => neighbor.via?.type === 'uses')).toBe(true);
  });

  it('emits cycle and orphan diagnostics', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agent-atlas-graph-'));
    const atlasPath = path.join(root, '.agent-atlas', 'public');
    await mkdir(atlasPath, { recursive: true });

    await writeFile(
      path.join(atlasPath, 'a.yaml'),
      [
        'id: component:a',
        'kind: component',
        'title: A',
        'summary: A component.',
        'relations:',
        '  - type: uses',
        '    target: component:b',
        '',
      ].join('\n'),
    );
    await writeFile(
      path.join(atlasPath, 'b.yaml'),
      [
        'id: component:b',
        'kind: component',
        'title: B',
        'summary: B component.',
        'relations:',
        '  - type: uses',
        '    target: component:a',
        '',
      ].join('\n'),
    );
    await writeFile(
      path.join(atlasPath, 'orphan.yaml'),
      [
        'id: component:orphan',
        'kind: component',
        'title: Orphan',
        'summary: Isolated component.',
        '',
      ].join('\n'),
    );

    const graph = await loadAtlasGraph(root);
    const codes = graph.diagnostics.map((diagnostic) => diagnostic.code);

    expect(codes).toContain('RELATION_CYCLE');
    expect(codes).toContain('ORPHAN_ENTITY');
  });
});
