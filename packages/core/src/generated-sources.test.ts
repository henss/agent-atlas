import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadGeneratedSourceEntities,
  mergeGeneratedEntitiesWithManualOverlays,
} from './generated-sources.js';
import type { AtlasEntity } from '@agent-atlas/schema';

describe('generated source entities', () => {
  it('extracts default-on package, script, test, doc, config, route, and dependency surfaces', async () => {
    const root = await makeFixtureRepo();
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'fixture-root',
        description: 'Fixture root package.',
        scripts: { build: 'tsc -p tsconfig.json', test: 'vitest run' },
        dependencies: { '@fixture/core': 'workspace:*' },
      }),
      'utf8',
    );
    await mkdir(path.join(root, 'packages/core/src'), { recursive: true });
    await writeFile(
      path.join(root, 'packages/core/package.json'),
      JSON.stringify({
        name: '@fixture/core',
        description: 'Core package.',
        scripts: { lint: 'tsc --noEmit' },
      }),
      'utf8',
    );
    await writeFile(path.join(root, 'packages/core/src/index.test.ts'), 'describe("core", () => {});\n', 'utf8');
    await writeFile(path.join(root, 'README.md'), '# Fixture Repo\n', 'utf8');
    await writeFile(path.join(root, 'tsconfig.json'), '{}\n', 'utf8');
    await writeFile(path.join(root, 'packages/core/src/server.ts'), 'app.get("/health", () => {});\n', 'utf8');

    const result = await loadGeneratedSourceEntities(root);
    const ids = result.entities.map((entity) => entity.id);

    expect(ids).toContain('component:package.fixture-root');
    expect(ids).toContain('component:package.fixture-core');
    expect(ids).toContain('interface:package-script.fixture-root.build');
    expect(ids).toContain('test-scope:generated.packages');
    expect(ids).toContain('document:generated.readme');
    expect(ids).toContain('resource:config.tsconfig');
    expect(ids).toContain('interface:route.get.health');
    expect(ids).toContain('component:package.fixture-root.dependencies');
    expect(result.policy.enabled).toBe(true);
  });

  it('supports disabling source families by config', async () => {
    const root = await makeFixtureRepo();
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture-root', scripts: { test: 'vitest' } }), 'utf8');
    await writeFile(path.join(root, 'README.md'), '# Fixture Repo\n', 'utf8');
    await writeFile(
      path.join(root, 'agent-atlas.maintenance.yaml'),
      `version: 1
generated_sources:
  disabled:
    - package_scripts
  docs:
    enabled: false
`,
      'utf8',
    );

    const result = await loadGeneratedSourceEntities(root);
    const ids = result.entities.map((entity) => entity.id);

    expect(ids).not.toContain('interface:package-script.fixture-root.test');
    expect(ids).not.toContain('document:generated.readme');
    expect(ids).toContain('component:package.fixture-root');
  });

  it('defaults generated visibility from the maintenance profile', async () => {
    const root = await makeFixtureRepo();
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture-root', scripts: { test: 'vitest' } }), 'utf8');
    await writeFile(
      path.join(root, 'agent-atlas.maintenance.yaml'),
      `version: 1
profile: private
`,
      'utf8',
    );

    const result = await loadGeneratedSourceEntities(root);
    const script = result.entities.find((entity) => entity.id === 'interface:package-script.fixture-root.test');

    expect(script?.visibility).toBe('private');
    expect(result.policy.default_visibility).toBe('private');
  });

  it('lets manual overlays enrich generated entities without overriding generated facts', () => {
    const generated: AtlasEntity = {
      id: 'interface:package-script.root.test',
      kind: 'interface',
      title: 'root test',
      summary: 'Generated summary.',
      uri: 'pnpm test',
      metadata: { generated_source: { family: 'package_scripts' } },
    };
    const manual: AtlasEntity = {
      id: 'interface:package-script.root.test',
      kind: 'interface',
      title: 'Manual title',
      summary: 'Manual summary.',
      visibility: 'private',
      tags: ['verification'],
      agent: { risk_notes: ['Important verifier.'] },
      relations: [{ type: 'implements', target: 'workflow:test' }],
    };

    const result = mergeGeneratedEntitiesWithManualOverlays([manual], [generated]);
    const merged = result.entities[0]!;

    expect(merged.title).toBe('root test');
    expect(merged.summary).toBe('Generated summary.');
    expect(merged.visibility).toBe('private');
    expect(merged.tags).toContain('verification');
    expect(merged.agent?.risk_notes).toEqual(['Important verifier.']);
    expect(merged.relations).toEqual([{ type: 'implements', target: 'workflow:test' }]);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'GENERATED_SOURCE_OVERLAY')).toBe(true);
  });
});

async function makeFixtureRepo(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'agent-atlas-generated-sources-'));
}
