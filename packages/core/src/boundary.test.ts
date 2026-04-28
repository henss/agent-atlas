import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkAtlasBoundary } from './boundary.js';

describe('checkAtlasBoundary', () => {
  it('passes clean public atlas files', async () => {
    const rootPath = await makeBoundaryFixture();

    const result = await checkAtlasBoundary(rootPath, {
      profile: 'public',
    });

    expect(result.status).toBe('passed');
    expect(result.checkedFiles).toBeGreaterThan(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('fails public files with private URLs, issue keys, and generated leaks', async () => {
    const rootPath = await makeBoundaryFixture({
      publicLeak: true,
      generatedLeak: true,
    });

    const result = await checkAtlasBoundary(rootPath, {
      profile: 'public',
    });

    expect(result.status).toBe('failed');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'BOUNDARY_PUBLIC_INTERNAL_URL',
        'BOUNDARY_PUBLIC_ISSUE_KEY',
        'BOUNDARY_PUBLIC_PRIVATE_URI_GENERATED',
      ]),
    );
  });

  it('uses repo-local policy markers', async () => {
    const rootPath = await makeBoundaryFixture({
      policyMarker: true,
    });

    await writeFile(
      path.join(rootPath, 'agent-atlas.boundary.yaml'),
      `version: 1
public_markers:
  - ACME-INTERNAL
`,
    );

    const result = await checkAtlasBoundary(rootPath, {
      profile: 'public',
    });

    expect(result.status).toBe('failed');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'BOUNDARY_PUBLIC_MARKER',
      }),
    );
  });

  it('fails company files with credential-shaped values', async () => {
    const rootPath = await makeBoundaryFixture({
      companySecret: true,
    });

    const result = await checkAtlasBoundary(rootPath, {
      profile: 'company',
    });

    expect(result.status).toBe('failed');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'BOUNDARY_SECRET_VALUE',
      }),
    );
  });
});

async function makeBoundaryFixture(
  options: {
    publicLeak?: boolean;
    generatedLeak?: boolean;
    policyMarker?: boolean;
    companySecret?: boolean;
  } = {},
): Promise<string> {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-boundary-'));
  const publicPath = path.join(rootPath, '.agent-atlas', 'public', 'components');
  const companyPath = path.join(
    rootPath,
    '.agent-atlas',
    'overlays',
    'company',
    'components',
  );
  const generatedPath = path.join(rootPath, 'docs', 'agents', 'components');
  await mkdir(publicPath, { recursive: true });
  await mkdir(companyPath, { recursive: true });
  await mkdir(generatedPath, { recursive: true });

  await writeFile(
    path.join(publicPath, 'example.yaml'),
    `id: component:example
kind: component
title: Example
summary: ${options.publicLeak ? 'See https://intranet.internal/app and TEAM-123.' : 'Safe public summary.'}${options.policyMarker ? ' ACME-INTERNAL' : ''}
visibility: public
`,
  );

  await writeFile(
    path.join(companyPath, 'example.yaml'),
    `id: component:example
${options.companySecret ? 'summary: api_key: abcdefghijklmnop' : 'summary: Company-safe overlay.'}
`,
  );

  await writeFile(
    path.join(generatedPath, 'example.md'),
    options.generatedLeak
      ? 'Generated view with notion:private-page'
      : 'Generated view with safe public content.',
  );

  return rootPath;
}
