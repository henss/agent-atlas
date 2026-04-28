import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve('dist/index.js');

describe('atlas CLI golden output', () => {
  it('prints concise validation Markdown', async () => {
    const root = await makeAtlasFixture();
    const { stdout } = await execFileAsync('node', [
      CLI_PATH,
      'validate',
      root,
    ]);

    expect(stdout.replace(/\r\n/g, '\n')).toBe(`# Atlas validation

Status: passed
Profile: \`public\`

Entities: 2
Relations: 2
Warnings: 0
Errors: 0
`);
  });

  it('prints diagnostic hints when validation fails', async () => {
    const root = await makeAtlasFixture({
      brokenRelation: true,
    });

    await expect(
      execFileAsync('node', [CLI_PATH, 'validate', root]),
    ).rejects.toMatchObject({
      stdout: expect.stringContaining(
        'Fix: Create the target entity, fix the target ID, or move cross-repo references into a global registry.',
      ),
    });
  });

  it('prints concise doctor Markdown', async () => {
    const root = await makeAtlasFixture();
    const { stdout } = await execFileAsync('node', [
      CLI_PATH,
      'doctor',
      '--path',
      root,
    ]);

    expect(stdout.replace(/\r\n/g, '\n')).toContain(`# Atlas doctor

Status: passed
`);
    expect(stdout).toContain('Commands:');
    expect(stdout).toContain('doctor');
    expect(stdout).toContain('atlas input');
  });

  it('rejects unknown flags instead of treating them as paths', async () => {
    await expect(
      execFileAsync('node', [CLI_PATH, 'validate', '--badflag']),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('Unknown option: --badflag'),
    });
  });

  it('rejects duplicate positional and --path roots', async () => {
    const root = await makeAtlasFixture();

    await expect(
      execFileAsync('node', [
        CLI_PATH,
        'resolve-path',
        'packages/example.ts',
        root,
        '--path',
        root,
      ]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        'Use either one positional path or --path <root>, not both.',
      ),
    });
  });
});

async function makeAtlasFixture(
  options: { brokenRelation?: boolean } = {},
): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-cli-'));
  const componentDir = path.join(root, '.agent-atlas', 'public', 'components');
  const workflowDir = path.join(root, '.agent-atlas', 'public', 'workflows');
  await mkdir(componentDir, { recursive: true });
  await mkdir(workflowDir, { recursive: true });

  await writeFile(
    path.join(componentDir, 'example.yaml'),
    `id: component:example
kind: component
title: Example
summary: Example component.
relations:
  - type: part-of
    target: ${options.brokenRelation ? 'workflow:missing' : 'workflow:example'}
`,
  );

  if (!options.brokenRelation) {
    await writeFile(
      path.join(workflowDir, 'example.yaml'),
      `id: workflow:example
kind: workflow
title: Example Workflow
summary: Example workflow.
relations:
  - type: contains
    target: component:example
`,
    );
  }

  return root;
}
