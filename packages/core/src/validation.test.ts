import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateAtlas } from './validation.js';

describe('validateAtlas', () => {
  it('passes valid example atlas files', async () => {
    const result = await validateAtlas(path.resolve('../../examples/personal-ops-sanitized'));

    expect(result.status).toBe('passed');
    expect(result.entityCount).toBeGreaterThan(0);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.level === 'error')).toEqual([]);
  });

  it('reports structural and graph validation errors', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agent-atlas-invalid-'));
    const atlasPath = path.join(root, '.agent-atlas', 'public');
    await mkdir(atlasPath, { recursive: true });

    await writeFile(
      path.join(atlasPath, 'one.yaml'),
      [
        'id: component:bad',
        'kind: workflow',
        'title: Bad',
        'summary: Bad entity.',
        'relations:',
        '  - type: made-up',
        '    target: document:missing',
        '',
      ].join('\n'),
    );
    await writeFile(
      path.join(atlasPath, 'duplicate.yaml'),
      [
        'id: component:bad',
        'kind: component',
        'title: Duplicate',
        'summary: Duplicate entity.',
        '',
      ].join('\n'),
    );

    const result = await validateAtlas(root);
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);

    expect(result.status).toBe('failed');
    expect(codes).toContain('ENTITY_KIND_MISMATCH');
    expect(codes).toContain('RELATION_TYPE_UNKNOWN');
    expect(codes).toContain('RELATION_TARGET_MISSING');
    expect(codes).toContain('DUPLICATE_ENTITY_ID');
  });

  it('warns when public atlas files contain private URI schemes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agent-atlas-public-safety-'));
    const atlasPath = path.join(root, '.agent-atlas', 'public');
    await mkdir(atlasPath, { recursive: true });

    await writeFile(
      path.join(atlasPath, 'doc.yaml'),
      [
        'id: document:weekly-planning',
        'kind: document',
        'title: Weekly Planning',
        'summary: Planning system notes.',
        'visibility: public',
        'uri: notion://page/private-id',
        '',
      ].join('\n'),
    );

    const result = await validateAtlas(root);

    expect(result.status).toBe('passed');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'PUBLIC_PROFILE_PRIVATE_URI',
    );
  });
});
