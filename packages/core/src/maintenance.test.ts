import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  applyAtlasMaintenanceMetadataFixes,
  loadAtlasMaintenancePolicy,
} from './maintenance.js';

const execFileAsync = promisify(execFile);

describe('atlas maintenance policy', () => {
  it('defaults to review-only without a repo policy', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-maintenance-'));

    const policy = await loadAtlasMaintenancePolicy(root);

    expect(policy.mode).toBe('review-only');
    expect(policy.metadata.auto_apply).toBe(false);
    expect(policy.generated_docs.output).toBe('docs/agents');
  });

  it('loads agent-maintained policy defaults from repo config', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-maintenance-'));
    await writeFile(
      path.join(root, 'agent-atlas.maintenance.yaml'),
      `version: 1
mode: agent-maintained
profile: public
generated_docs:
  output: docs/agents
generated_readme:
  path: README.md
  auto_regenerate: true
generated_package_readmes:
  enabled: true
  auto_regenerate: true
  overwrite_existing: false
metadata:
  allow_delete: false
`,
    );

    const policy = await loadAtlasMaintenancePolicy(root);

    expect(policy.mode).toBe('agent-maintained');
    expect(policy.generated_docs.auto_regenerate).toBe(true);
    expect(policy.generated_readme).toEqual({
      path: 'README.md',
      auto_regenerate: true,
    });
    expect(policy.generated_package_readmes).toEqual({
      enabled: true,
      auto_regenerate: true,
      overwrite_existing: false,
    });
    expect(policy.metadata.auto_apply).toBe(true);
    expect(policy.metadata.allow_add).toBe(true);
    expect(policy.metadata.allow_delete).toBe(false);
  });

  it('adds missing cards for changed source files when policy allows it', async () => {
    const root = await makeMaintenanceFixture();
    await execFileAsync('git', ['init'], { cwd: root });
    await mkdir(path.join(root, 'packages', 'billing', 'src'), { recursive: true });
    await writeFile(path.join(root, 'packages', 'billing', 'src', 'sync.ts'), 'export {};\n');
    const policy = await loadAtlasMaintenancePolicy(root);

    const result = await applyAtlasMaintenanceMetadataFixes(root, policy);

    expect(result.status).toBe('passed');
    expect(result.appliedFiles).toContain(
      '.agent-atlas/public/components/billing-sync.yaml',
    );
    const card = await readFile(
      path.join(root, '.agent-atlas', 'public', 'components', 'billing-sync.yaml'),
      'utf8',
    );
    expect(card).toContain('id: component:billing-sync');
    expect(card).toContain('packages/billing/src/**');
  });

  it('repairs stale code references when policy allows updates', async () => {
    const root = await makeMaintenanceFixture();
    await mkdir(path.join(root, '.agent-atlas', 'public', 'components'), {
      recursive: true,
    });
    await mkdir(path.join(root, 'packages', 'active', 'src'), { recursive: true });
    await writeFile(path.join(root, 'packages', 'active', 'src', 'index.ts'), 'export {};\n');
    await writeFile(
      path.join(root, '.agent-atlas', 'public', 'components', 'active.yaml'),
      `id: component:active
kind: component
title: Active
summary: Active component.
code:
  paths:
    - packages/active/src/**
    - packages/missing/src/**
  entrypoints:
    - packages/active/src/index.ts
    - packages/missing/src/index.ts
`,
    );
    const policy = await loadAtlasMaintenancePolicy(root);

    const result = await applyAtlasMaintenanceMetadataFixes(root, policy);

    expect(result.appliedFiles).toContain('.agent-atlas/public/components/active.yaml');
    const card = await readFile(
      path.join(root, '.agent-atlas', 'public', 'components', 'active.yaml'),
      'utf8',
    );
    expect(card).toContain('packages/active/src/**');
    expect(card).toContain('packages/active/src/index.ts');
    expect(card).not.toContain('packages/missing');
  });
});

async function makeMaintenanceFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-maintenance-'));
  await mkdir(path.join(root, '.agent-atlas', 'public', 'domains'), {
    recursive: true,
  });
  await writeFile(
    path.join(root, '.agent-atlas', 'public', 'domains', 'example.yaml'),
    `id: domain:example
kind: domain
title: Example
summary: Example domain.
`,
  );
  await writeFile(
    path.join(root, 'agent-atlas.maintenance.yaml'),
    `version: 1
mode: agent-maintained
profile: public
generated_docs:
  output: docs/agents
  auto_regenerate: true
metadata:
  auto_apply: true
  allow_add: true
  allow_update: true
  allow_archive: true
  allow_delete: false
`,
  );
  return root;
}
