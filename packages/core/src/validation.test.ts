import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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
      path.join(atlasPath, 'zduplicate.yaml'),
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

  it('merges selected private overlays by profile', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agent-atlas-overlay-'));
    try {
      const publicPath = path.join(root, '.agent-atlas', 'public');
      const privatePath = path.join(root, '.agent-atlas', 'overlays', 'private.local');
      await mkdir(publicPath, { recursive: true });
      await mkdir(privatePath, { recursive: true });

      await writeFile(
        path.join(publicPath, 'doc.yaml'),
        [
          'id: document:release-process',
          'kind: document',
          'title: Release Process',
          'summary: Internal release process.',
          'visibility: private',
          'access:',
          '  private_overlay_required: true',
          '',
        ].join('\n'),
      );
      await writeFile(
        path.join(privatePath, 'doc.yaml'),
        [
          'id: document:release-process',
          'uri: notion://page/sanitized-release-process',
          'access:',
          '  method: mcp',
          '  server: notion',
          '  permission: read',
          '',
        ].join('\n'),
      );

      const publicResult = await validateAtlas(root);
      const privateResult = await validateAtlas(root, { profile: 'private' });

      expect(publicResult.entities[0]?.uri).toBeUndefined();
      expect(privateResult.entities[0]?.uri).toBe('notion://page/sanitized-release-process');
      expect(privateResult.entities[0]?.access?.server).toBe('notion');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports overlay conflicts and missing base entities', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agent-atlas-overlay-invalid-'));
    try {
      const publicPath = path.join(root, '.agent-atlas', 'public');
      const privatePath = path.join(root, '.agent-atlas', 'overlays', 'private.local');
      await mkdir(publicPath, { recursive: true });
      await mkdir(privatePath, { recursive: true });

      await writeFile(
        path.join(publicPath, 'component.yaml'),
        [
          'id: component:planner',
          'kind: component',
          'title: Planner',
          'summary: Planner component.',
          '',
        ].join('\n'),
      );
      await writeFile(
        path.join(privatePath, 'component.yaml'),
        [
          'id: component:planner',
          'kind: workflow',
          'title: Conflicting Planner',
          '',
        ].join('\n'),
      );
      await writeFile(
        path.join(privatePath, 'missing.yaml'),
        ['id: document:missing', 'uri: notion://page/missing', ''].join('\n'),
      );

      const result = await validateAtlas(root, { profile: 'private' });
      const codes = result.diagnostics.map((diagnostic) => diagnostic.code);

      expect(result.status).toBe('failed');
      expect(codes).toContain('OVERLAY_KIND_CONFLICT');
      expect(codes).toContain('OVERLAY_BASE_MISSING');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
