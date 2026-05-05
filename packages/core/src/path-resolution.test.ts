import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAtlasGraph } from './graph.js';
import { resolvePathInGraph } from './path-resolution.js';

describe('resolvePathInGraph', () => {
  it('matches component code paths and returns related context', async () => {
    const rootPath = path.resolve('../../examples/personal-ops-sanitized');
    const graph = await loadAtlasGraph(rootPath);
    const result = resolvePathInGraph(
      graph,
      path.join(rootPath, 'packages/planning/src/weeklyPlanner.ts'),
    );

    expect(result.normalizedPath).toBe('packages/planning/src/weeklyPlanner.ts');
    expect(result.owners[0]).toEqual(
      expect.objectContaining({
        matchType: 'entrypoint',
        confidence: 1,
        pattern: 'packages/planning/src/weeklyPlanner.ts',
      }),
    );
    expect(result.owners[0]?.entity.id).toBe('component:weekly-planner');
    expect(result.workflows.map((match) => match.entity.id)).toContain('workflow:plan-week');
    expect(result.documents.map((match) => match.entity.id)).toContain(
      'document:weekly-planning-system',
    );
    expect(result.tests.map((match) => match.entity.id)).toContain('test-scope:planning-tests');
  });

  it('scores more specific overlapping component paths higher', async () => {
    const graph = await loadAtlasGraph(path.resolve('../../examples/personal-ops-sanitized'));
    const result = resolvePathInGraph(graph, 'packages/planning/src/shared/format.ts');

    expect(result.owners.map((owner) => owner.entity.id)).toEqual([
      'component:planning-output-helpers',
      'component:weekly-planner',
    ]);
    expect(result.owners[0]?.confidence).toBeGreaterThan(result.owners[1]?.confidence ?? 0);
    expect(result.workflows.map((match) => match.entity.id)).toContain('workflow:plan-week');
    expect(result.domains.map((match) => match.entity.id)).toContain('domain:calendar');
  });

  it('returns no owners for unmatched paths', async () => {
    const graph = await loadAtlasGraph(path.resolve('../../examples/personal-ops-sanitized'));
    const result = resolvePathInGraph(graph, 'packages/unknown/src/index.ts');

    expect(result.owners).toEqual([]);
    expect(result.workflows).toEqual([]);
    expect(result.domains).toEqual([]);
    expect(result.capabilities).toEqual([]);
    expect(result.documents).toEqual([]);
    expect(result.tests).toEqual([]);
  });
});
