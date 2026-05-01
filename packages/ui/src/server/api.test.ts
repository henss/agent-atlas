import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AtlasGraph } from '@agent-atlas/core';
import type { AtlasEntity } from '@agent-atlas/schema';
import {
  createEntityDetails,
  createHealth,
  createNeighborhood,
  createOverview,
  createSummary,
  extractMetadataDebug,
  readPreview,
} from './api.js';

const component: AtlasEntity = {
  id: 'component:core',
  kind: 'component',
  title: 'Core',
  summary: 'Core package',
  metadata: {
    agent_atlas: {
      last_updated: '2026-05-01',
      provenance: 'adapter',
      confidence: 0.84,
      discovered_by: 'test-adapter',
      source: 'local',
      review_status: 'needs-review',
    },
    adapter: {
      run: 'test',
    },
  },
};

const workflow: AtlasEntity = {
  id: 'workflow:review',
  kind: 'workflow',
  title: 'Review',
  summary: 'Review atlas content',
};

const graph: AtlasGraph = {
  rootPath: '/repo',
  entities: [component, workflow],
  edges: [
    {
      type: 'used-by',
      source: 'component:core',
      target: 'workflow:review',
      provenance: 'explicit',
      strength: 'primary',
    },
    {
      type: 'uses',
      source: 'workflow:review',
      target: 'component:core',
      provenance: 'generated',
      generatedFrom: 'used-by',
      strength: 'inferred',
    },
  ],
  index: {
    entitiesById: new Map([
      [component.id, component],
      [workflow.id, workflow],
    ]),
    outgoingById: new Map([
      [component.id, []],
      [workflow.id, []],
    ]),
    incomingById: new Map([
      [component.id, []],
      [workflow.id, []],
    ]),
  },
  diagnostics: [
    {
      level: 'warning',
      code: 'TEST_WARNING',
      message: 'Review this entity.',
      entityId: 'component:core',
    },
  ],
};

graph.index.outgoingById.set(component.id, [graph.edges[0]]);
graph.index.incomingById.set(workflow.id, [graph.edges[0]]);
graph.index.outgoingById.set(workflow.id, [graph.edges[1]]);
graph.index.incomingById.set(component.id, [graph.edges[1]]);

describe('ui api serializers', () => {
  it('creates atlas summaries with edge and metadata counts', () => {
    const summary = createSummary(graph, { rootPath: '/repo', profile: 'public' });

    expect(summary.entityCount).toBe(2);
    expect(summary.explicitEdgeCount).toBe(1);
    expect(summary.generatedEdgeCount).toBe(1);
    expect(summary.diagnosticCounts.warning).toBe(1);
    expect(summary.metadataKeyCounts.agent_atlas).toBe(1);
  });

  it('creates overview data for the UI start screen', () => {
    const overview = createOverview(graph, 'public');

    expect(overview.counts.entities).toBe(2);
    expect(overview.otherEntities.map((entity) => entity.id)).toContain('component:core');
  });

  it('extracts namespaced debug metadata while preserving raw metadata', () => {
    const debug = extractMetadataDebug(component.metadata);

    expect(debug.lastUpdated).toBe('2026-05-01');
    expect(debug.provenance).toBe('adapter');
    expect(debug.confidence).toBe(0.84);
    expect(debug.discoveredBy).toBe('test-adapter');
    expect(debug.raw?.adapter).toEqual({ run: 'test' });
  });

  it('creates entity details with related diagnostics', () => {
    const details = createEntityDetails(graph, component);

    expect(details.outgoing).toHaveLength(1);
    expect(details.incoming).toHaveLength(1);
    expect(details.diagnostics).toHaveLength(1);
  });

  it('creates focused neighborhoods and reports truncation', () => {
    const neighborhood = createNeighborhood(graph, component.id, 2, 'all', 1);

    expect(neighborhood.nodes).toHaveLength(1);
    expect(neighborhood.truncated).toBe(true);
  });

  it('creates health responses', () => {
    const health = createHealth(graph, { rootPath: '/repo', profile: 'public' });

    expect(health.status).toBe('ok');
    expect(health.version).toBe(1);
    expect(health.diagnosticCounts.warning).toBe(1);
  });

  it('previews repo-contained text files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-ui-preview-'));
    await mkdir(path.join(root, 'docs'), { recursive: true });
    await writeFile(path.join(root, 'docs', 'readme.md'), '# Read me\n', 'utf8');
    await writeFile(path.join(root, 'docs', 'guide.markdown'), '# Guide\n', 'utf8');

    const preview = await readPreview(root, 'docs/readme.md');
    const markdownPreview = await readPreview(root, 'docs/guide.markdown');

    expect(preview.path).toBe('docs/readme.md');
    expect(preview.fileName).toBe('readme.md');
    expect(preview.content).toContain('# Read me');
    expect(markdownPreview.content).toContain('# Guide');
  });

  it('rejects unsafe and unsupported preview paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-ui-preview-'));
    await writeFile(path.join(root, 'binary.bin'), 'x', 'utf8');

    await expect(readPreview(root, '../outside.md')).rejects.toThrow('within the atlas root');
    await expect(readPreview(root, path.join(root, 'binary.bin'))).rejects.toThrow('repo-relative');
    await expect(readPreview(root, 'binary.bin')).rejects.toThrow('not supported');
  });

  it('rejects directory and oversized preview paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-ui-preview-'));
    await mkdir(path.join(root, 'docs.md'), { recursive: true });
    await writeFile(path.join(root, 'large.md'), 'x'.repeat(200_001), 'utf8');

    await expect(readPreview(root, 'docs.md')).rejects.toThrow('point to a file');
    await expect(readPreview(root, 'large.md')).rejects.toThrow('too large');
  });
});
