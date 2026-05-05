import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAtlasGraph } from './graph.js';
import { createContextPack, renderContextPackMarkdown } from './context-pack.js';

describe('createContextPack', () => {
  it('selects entities from task text, paths, and graph context', async () => {
    const graph = await loadAtlasGraph(path.resolve('../..'));
    const pack = createContextPack(graph, {
      task: 'Change CLI path resolution in packages/cli/src/index.ts and verify workspace',
      budget: 6000,
      deterministic: true,
    });

    const entityIds = pack.entities.map((candidate) => candidate.entity.id);
    expect(entityIds).toContain('component:cli-package');
    expect(entityIds).toContain('interface:atlas-cli.resolve-path');
    expect(entityIds).toContain('workflow:operate-atlas-cli');
    expect(pack.recommendedReads.map((read) => read.value)).toContain('packages/cli/src/index.ts');
    expect(pack.verification.map((item) => item.entity.id)).toContain(
      'test-scope:workspace-build-and-test',
    );
    expect(pack.estimatedTokens).toBeLessThanOrEqual(pack.budget);
  });

  it('includes external references as references only', async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-context-pack-'));
    const atlasPath = path.join(rootPath, '.agent-atlas', 'public', 'repositories');

    try {
      await mkdir(atlasPath, { recursive: true });
      await writeFile(
        path.join(atlasPath, 'onboarding-web.yaml'),
        `id: repository:onboarding-web
kind: repository
title: Onboarding Web
summary: Web application repository for onboarding UI flows.
visibility: public
uri: github://example-org/onboarding-web
`,
        'utf8',
      );

      const graph = await loadAtlasGraph(rootPath);
      const pack = createContextPack(graph, {
        task: 'Review onboarding web repository dependencies',
        budget: 900,
      });

      expect(pack.externalReferences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reference: 'github://example-org/onboarding-web',
            reason: 'external reference for repository:onboarding-web',
          }),
        ]),
      );
    } finally {
      await rm(rootPath, { recursive: true, force: true });
    }
  });

  it('renders concise Markdown-first output with provenance', async () => {
    const graph = await loadAtlasGraph(path.resolve('../..'));
    const pack = createContextPack(graph, {
      task: 'Generate agent docs',
      budget: 900,
    });

    const markdown = renderContextPackMarkdown(pack);
    expect(markdown).toContain('# Context pack');
    expect(markdown).toContain('## Likely relevant entities');
    expect(markdown).toContain('_');
    expect(markdown).toContain('## Verification');
  });
});
