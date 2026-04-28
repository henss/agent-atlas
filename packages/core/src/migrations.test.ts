import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { migrateAtlas } from './migrations.js';

describe('migrateAtlas', () => {
  it('plans schema_version additions without writing by default', async () => {
    const root = await makeAtlasFixture();
    const filePath = path.join(
      root,
      '.agent-atlas',
      'public',
      'components',
      'example.yaml',
    );

    const result = await migrateAtlas(root);

    expect(result.changed).toBe(1);
    expect(result.changes[0]).toMatchObject({
      path: filePath,
      action: 'add-schema-version',
      toVersion: 1,
      written: false,
    });
    await expect(readFile(filePath, 'utf8')).resolves.not.toContain(
      'schema_version',
    );
  });

  it('writes schema_version when requested', async () => {
    const root = await makeAtlasFixture();
    const filePath = path.join(
      root,
      '.agent-atlas',
      'public',
      'components',
      'example.yaml',
    );

    const result = await migrateAtlas(root, { write: true });

    expect(result.changed).toBe(1);
    expect(result.changes[0]?.written).toBe(true);
    await expect(readFile(filePath, 'utf8')).resolves.toMatch(
      /^schema_version: 1\n/,
    );
  });
});

async function makeAtlasFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-migrate-'));
  const directory = path.join(root, '.agent-atlas', 'public', 'components');
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'example.yaml'),
    `id: component:example
kind: component
title: Example
summary: Example component.
`,
  );
  return root;
}
