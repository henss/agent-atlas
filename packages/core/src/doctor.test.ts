import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { doctorAtlas } from './doctor.js';

describe('doctorAtlas', () => {
  it('reports supported versions, commands, and atlas input', async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-doctor-'));
    const atlasPath = path.join(rootPath, '.agent-atlas', 'public', 'domains');
    await mkdir(atlasPath, { recursive: true });
    await writeFile(
      path.join(atlasPath, 'example.yaml'),
      `id: domain:example
kind: domain
title: Example
summary: Example domain.
`,
    );

    const result = await doctorAtlas(rootPath);

    expect(result.status).toBe('passed');
    expect(result.schemaVersion).toBe(1);
    expect(result.registryVersion).toBe(1);
    expect(result.commands).toContain('doctor');
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: 'atlas input',
        status: 'passed',
      }),
    );
  });

  it('warns when a target root has no atlas inputs', async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-doctor-empty-'));

    const result = await doctorAtlas(rootPath);

    expect(result.status).toBe('warning');
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: 'atlas input',
        status: 'warning',
      }),
    );
  });
});
