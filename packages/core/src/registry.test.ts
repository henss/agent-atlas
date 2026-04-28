import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createContextPack } from './context-pack.js';
import { loadGlobalAtlasGraph } from './registry.js';

describe('loadGlobalAtlasGraph', () => {
  it('loads central and per-repo atlas roots into one graph', async () => {
    const root = await makeRegistryFixture();
    const graph = await loadGlobalAtlasGraph(root);

    expect(graph.registry.imports).toHaveLength(3);
    expect(graph.index.entitiesById.has('system:onboarding-platform')).toBe(
      true,
    );
    expect(
      graph.index.entitiesById.has('component:onboarding-api-service'),
    ).toBe(true);
    expect(graph.index.entitiesById.has('component:onboarding-web-app')).toBe(
      true,
    );
    expect(
      graph.diagnostics.filter((diagnostic) => diagnostic.level === 'error'),
    ).toEqual([]);

    const apiEdges =
      graph.index.outgoingById.get('component:onboarding-api-service') ?? [];
    expect(apiEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'part-of',
          target: 'repository:onboarding-api',
        }),
        expect.objectContaining({
          type: 'exposes',
          target: 'interface:onboarding-http-api',
        }),
      ]),
    );
  });

  it('creates context packs across imported repo atlases', async () => {
    const root = await makeRegistryFixture();
    const graph = await loadGlobalAtlasGraph(root);
    const pack = createContextPack(graph, {
      task: 'change onboarding api http interface and web client',
      budget: 1600,
      profile: 'company',
    });

    expect(pack.entities.map((candidate) => candidate.entity.id)).toEqual(
      expect.arrayContaining([
        'interface:onboarding-http-api',
        'component:onboarding-api-service',
        'component:onboarding-web-app',
      ]),
    );
  });
});

async function makeRegistryFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-registry-'));

  await mkdir(path.join(root, 'registry'), { recursive: true });
  await mkdir(
    path.join(
      root,
      'repos',
      'onboarding-api',
      '.agent-atlas',
      'public',
      'components',
    ),
    {
      recursive: true,
    },
  );
  await mkdir(
    path.join(
      root,
      'repos',
      'onboarding-web',
      '.agent-atlas',
      'public',
      'components',
    ),
    {
      recursive: true,
    },
  );

  await writeFile(
    path.join(root, 'agent-atlas.registry.yaml'),
    `version: 1
name: Fixture Registry
imports:
  - id: central
    path: registry
    role: registry
  - id: onboarding-api
    path: repos/onboarding-api
    role: repository
    repository: repository:onboarding-api
  - id: onboarding-web
    path: repos/onboarding-web
    role: repository
    repository: repository:onboarding-web
`,
  );

  await writeFile(
    path.join(root, 'registry', 'system.yaml'),
    `id: system:onboarding-platform
kind: system
title: Onboarding Platform
summary: Cross-repo onboarding platform.
visibility: internal
relations:
  - type: contains
    target: repository:onboarding-api
  - type: contains
    target: repository:onboarding-web
`,
  );

  await writeFile(
    path.join(root, 'registry', 'onboarding-api.yaml'),
    `id: repository:onboarding-api
kind: repository
title: Onboarding API
summary: API repository.
visibility: internal
relations:
  - type: part-of
    target: system:onboarding-platform
`,
  );

  await writeFile(
    path.join(root, 'registry', 'onboarding-web.yaml'),
    `id: repository:onboarding-web
kind: repository
title: Onboarding Web
summary: Web repository.
visibility: internal
relations:
  - type: part-of
    target: system:onboarding-platform
`,
  );

  await writeFile(
    path.join(root, 'registry', 'http-api.yaml'),
    `id: interface:onboarding-http-api
kind: interface
title: Onboarding HTTP API
summary: Cross-repo HTTP interface.
visibility: internal
relations:
  - type: part-of
    target: system:onboarding-platform
`,
  );

  await writeFile(
    path.join(
      root,
      'repos',
      'onboarding-api',
      '.agent-atlas',
      'public',
      'components',
      'api.yaml',
    ),
    `id: component:onboarding-api-service
kind: component
title: Onboarding API Service
summary: Serves onboarding HTTP workflows.
visibility: internal
relations:
  - type: exposes
    target: interface:onboarding-http-api
code:
  paths:
    - packages/api/**
`,
  );

  await writeFile(
    path.join(
      root,
      'repos',
      'onboarding-web',
      '.agent-atlas',
      'public',
      'components',
      'web.yaml',
    ),
    `id: component:onboarding-web-app
kind: component
title: Onboarding Web App
summary: Calls onboarding APIs from the UI.
visibility: internal
relations:
  - type: uses
    target: interface:onboarding-http-api
code:
  paths:
    - apps/web/**
`,
  );

  return root;
}
