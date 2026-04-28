import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { evaluateUsageEvidence, writeUsageNote } from './usage-evidence.js';

describe('usage evidence', () => {
  it('writes local usage receipts and evaluates context-pack recall', async () => {
    const rootPath = await makeUsageFixture();

    const written = await writeUsageNote({
      rootPath,
      task: 'Change CLI path handling in packages/cli/src/index.ts',
      command: 'context-pack',
      selectedEntities: ['component:cli-package', 'test-scope:workspace'],
      selectedFiles: ['packages/cli/src/index.ts'],
      selectedTests: ['pnpm -r test'],
      broadSearchFallback: false,
      missingCards: ['document downstream script behavior'],
    });

    expect(written.path).toContain(path.join('.agent-atlas', 'usage'));
    expect(written.note.version).toBe(1);

    const evaluation = await evaluateUsageEvidence(rootPath, {
      budget: 1200,
    });

    expect(evaluation.receiptCount).toBe(1);
    expect(evaluation.missingCardMentions).toBe(1);
    expect(evaluation.broadSearchFallbacks).toBe(0);
    expect(evaluation.averages.entityRecall).toBeGreaterThan(0);
    expect(evaluation.averages.fileRecall).toBe(1);
    expect(evaluation.averages.testRecall).toBe(1);
  });
});

async function makeUsageFixture(): Promise<string> {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-usage-'));
  const componentPath = path.join(rootPath, '.agent-atlas', 'public', 'components');
  const testPath = path.join(rootPath, '.agent-atlas', 'public', 'tests');
  await mkdir(componentPath, { recursive: true });
  await mkdir(testPath, { recursive: true });

  await writeFile(
    path.join(componentPath, 'cli.yaml'),
    `id: component:cli-package
kind: component
title: CLI Package
summary: Provides command-line path handling and context-pack commands.
visibility: public
code:
  paths:
    - packages/cli/**
  entrypoints:
    - packages/cli/src/index.ts
relations:
  - type: tested-by
    target: test-scope:workspace
`,
  );

  await writeFile(
    path.join(testPath, 'workspace.yaml'),
    `id: test-scope:workspace
kind: test-scope
title: Workspace Tests
summary: Workspace verification commands.
visibility: public
commands:
  - command: pnpm -r test
    purpose: run tests
relations:
  - type: verifies
    target: component:cli-package
`,
  );

  return rootPath;
}
