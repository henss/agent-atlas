import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { analyzeAtlasMaintenance, suggestAtlasCard } from './authoring.js';
import { loadAtlasGraph } from './graph.js';

const execFileAsync = promisify(execFile);

describe('authoring helpers', () => {
  it('suggests draft component cards without writing', async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-suggest-'));
    const suggestion = await suggestAtlasCard(
      rootPath,
      'packages/cli/src/example.ts',
    );

    expect(suggestion.kind).toBe('component');
    expect(suggestion.entityId).toBe('component:cli-example');
    expect(suggestion.yaml).toContain('kind: component');
    expect(suggestion.yaml).toContain('packages/cli/src/example.ts');
  });

  it('suggests test-scope cards for test paths', async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-suggest-test-'));
    const suggestion = await suggestAtlasCard(rootPath, 'src/foo.test.ts');

    expect(suggestion.kind).toBe('test-scope');
    expect(suggestion.yaml).toContain('kind: test-scope');
    expect(suggestion.yaml).toContain('commands:');
  });

  it('diagnoses stale paths, entrypoints, and package scripts', async () => {
    const rootPath = await makeMaintenanceFixture();
    const graph = await loadAtlasGraph(rootPath);

    const report = await analyzeAtlasMaintenance(graph);

    expect(report.status).toBe('failed');
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'STALE_ENTRYPOINT' }),
        expect.objectContaining({ code: 'STALE_CODE_PATH' }),
        expect.objectContaining({ code: 'STALE_PACKAGE_SCRIPT' }),
      ]),
    );
  });

  it('reports modified atlas files from git status', async () => {
    const rootPath = await makeTrackedAtlasFixture();
    const graph = await loadAtlasGraph(rootPath);

    const report = await analyzeAtlasMaintenance(graph);

    expect(report.changedAtlasFiles).toContain(
      '.agent-atlas/public/components/example.yaml',
    );
  });
});

async function makeMaintenanceFixture(): Promise<string> {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-maintenance-'));
  const componentPath = path.join(rootPath, '.agent-atlas', 'public', 'components');
  const testPath = path.join(rootPath, '.agent-atlas', 'public', 'tests');
  await mkdir(componentPath, { recursive: true });
  await mkdir(testPath, { recursive: true });
  await mkdir(path.join(rootPath, 'src'), { recursive: true });
  await writeFile(path.join(rootPath, 'src', 'exists.ts'), 'export {};\n');
  await writeFile(
    path.join(rootPath, 'package.json'),
    JSON.stringify({ scripts: { test: 'vitest run' } }, null, 2),
  );

  await writeFile(
    path.join(componentPath, 'example.yaml'),
    `id: component:example
kind: component
title: Example
summary: Example component.
code:
  paths:
    - missing/**
  entrypoints:
    - src/missing.ts
`,
  );

  await writeFile(
    path.join(testPath, 'workspace.yaml'),
    `id: test-scope:workspace
kind: test-scope
title: Workspace Tests
summary: Workspace verification.
commands:
  - command: pnpm run missing
`,
  );

  return rootPath;
}

async function makeTrackedAtlasFixture(): Promise<string> {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-git-'));
  const componentPath = path.join(rootPath, '.agent-atlas', 'public', 'components');
  await mkdir(componentPath, { recursive: true });
  const cardPath = path.join(componentPath, 'example.yaml');
  await writeFile(
    cardPath,
    `id: component:example
kind: component
title: Example
summary: Example component.
`,
  );

  await execFileAsync('git', ['init'], { cwd: rootPath });
  await execFileAsync('git', ['add', '.'], { cwd: rootPath });
  await writeFile(
    cardPath,
    `id: component:example
kind: component
title: Example
summary: Updated example component.
`,
  );
  return rootPath;
}
