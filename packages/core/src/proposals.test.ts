import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  applyAtlasProposal,
  discoverAtlasGaps,
  proposeAtlasCards,
  validateAtlasProposal,
  writeAtlasCardProposal,
} from './proposals.js';

describe('atlas proposals', () => {
  it('discovers repeated usage gaps and creates proposal drafts without touching atlas cards', async () => {
    const root = await makeProposalFixture();
    await writeUsageReceipt(root, 'one.yaml', {
      task: 'Change billing sync route ownership',
      selected_files: ['src/billing/sync.ts'],
      missing_cards: ['billing sync has no owner card'],
      broad_search_fallback: true,
    });
    await writeUsageReceipt(root, 'two.yaml', {
      task: 'Fix billing sync validation',
      selected_files: ['src/billing/validate.ts'],
      missing_cards: ['billing sync has no owner card'],
      broad_search_fallback: true,
    });

    const report = await discoverAtlasGaps(root, {
      receiptsPath: '.runtime/agent-atlas/usage',
      now: new Date('2026-04-30T10:00:00Z'),
    });
    const proposal = proposeAtlasCards(report, {
      now: new Date('2026-04-30T10:00:00Z'),
    });

    expect(report.gaps.some((gap) => gap.recommendedAction === 'propose-card')).toBe(true);
    expect(proposal.proposedEntities[0]?.id).toBe('component:src-billing');
    expect(proposal.proposedEntities[0]?.yaml).toContain('src/billing/**');
  });

  it('validates and explicitly applies selected proposal entities', async () => {
    const root = await makeProposalFixture();
    const report = await discoverAtlasGaps(root, {
      receiptsPath: '.runtime/agent-atlas/usage',
      resolvePathMisses: ['src/new-seam/index.ts'],
    });
    const proposal = proposeAtlasCards(report);
    const proposalPath = await writeAtlasCardProposal(
      proposal,
      path.join(root, '.runtime', 'agent-atlas', 'proposals'),
    );

    const validation = await validateAtlasProposal(proposalPath);
    expect(validation.status).toBe('passed');

    const result = await applyAtlasProposal(proposalPath, {
      selectEntityIds: [proposal.proposedEntities[0]!.id],
    });

    expect(result.appliedFiles).toHaveLength(1);
    await expect(readFile(result.appliedFiles[0]!, 'utf8')).resolves.toContain(
      proposal.proposedEntities[0]!.id,
    );
  });

  it('does not propose document cards for documents covered by generated sources', async () => {
    const root = await makeProposalFixture();
    await mkdir(path.join(root, 'docs', 'guides'), { recursive: true });
    await writeFile(path.join(root, 'docs', 'guides', 'foo.md'), '# Foo\n');

    const report = await discoverAtlasGaps(root, {
      receiptsPath: '.runtime/agent-atlas/usage',
    });
    const gap = report.gaps.find((candidate) => candidate.type === 'untracked-document');
    const proposal = proposeAtlasCards(report);

    expect(gap).toBeUndefined();
    expect(proposal.proposedEntities.some((entity) => entity.kind === 'document')).toBe(false);
  });

  it('discovers stale milestone summaries on document cards', async () => {
    const root = await makeProposalFixture();
    await mkdir(path.join(root, '.agent-atlas', 'public', 'documents'), { recursive: true });
    await writeFile(path.join(root, 'ROADMAP.md'), 'Status: M0-M17 are complete.\n');
    await writeFile(
      path.join(root, '.agent-atlas', 'public', 'documents', 'roadmap.yaml'),
      `id: document:roadmap
kind: document
title: Roadmap
summary: Roadmap showing completed M0-M16 implementation.
visibility: public
uri: ROADMAP.md
relations:
  - type: documents
    target: component:existing
`,
    );

    const report = await discoverAtlasGaps(root, {
      receiptsPath: '.runtime/agent-atlas/usage',
    });

    expect(report.gaps.map((gap) => gap.type)).toContain('stale-summary');
  });

  it('discovers document cards with weak relation coverage', async () => {
    const root = await makeProposalFixture();
    await mkdir(path.join(root, '.agent-atlas', 'public', 'documents'), { recursive: true });
    await writeFile(path.join(root, 'README.md'), '# Example\n');
    await writeFile(
      path.join(root, '.agent-atlas', 'public', 'documents', 'readme.yaml'),
      `id: document:readme
kind: document
title: Readme
summary: Readme.
visibility: public
uri: README.md
relations: []
`,
    );

    const report = await discoverAtlasGaps(root, {
      receiptsPath: '.runtime/agent-atlas/usage',
    });

    expect(report.gaps.map((gap) => gap.type)).toContain('weak-relation-coverage');
  });

  it('does not report static gaps for this repository atlas', async () => {
    const repoRoot = path.resolve(process.cwd(), '../..');
    const emptyReceiptDir = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-empty-receipts-'));
    const report = await discoverAtlasGaps(repoRoot, {
      receiptsPath: emptyReceiptDir,
    });

    expect(report.gaps).toHaveLength(0);
  }, 15000);

  it('rejects public proposals with private markers', async () => {
    const root = await makeProposalFixture();
    const proposalPath = path.join(root, 'proposal.yaml');
    await writeFile(
      proposalPath,
      `version: 1
generatedAt: "2026-04-30T10:00:00.000Z"
repo: ${JSON.stringify(root)}
profile: public
gapSources: []
proposedEntities:
  - id: component:bad
    kind: component
    filePath: components/bad.yaml
    sourceGapIds: []
    yaml: |
      id: component:bad
      kind: component
      title: Bad
      summary: BAD-123 leaked issue.
      visibility: public
sourceEvidence:
  gapIds: []
  taskLabels: []
  affectedPaths: []
confidence: 1
blockedReasons: []
validationCommands: []
boundaryCheckRequired: true
`,
    );

    const validation = await validateAtlasProposal(proposalPath);
    expect(validation.status).toBe('failed');
    expect(validation.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'PROPOSAL_PUBLIC_ISSUE_KEY',
    );
  });
});

async function makeProposalFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-atlas-proposal-'));
  await mkdir(path.join(root, '.agent-atlas', 'public', 'components'), { recursive: true });
  await mkdir(path.join(root, 'src', 'billing'), { recursive: true });
  await mkdir(path.join(root, 'src', 'new-seam'), { recursive: true });
  await writeFile(path.join(root, 'src', 'billing', 'sync.ts'), 'export {};\n');
  await writeFile(path.join(root, 'src', 'billing', 'validate.ts'), 'export {};\n');
  await writeFile(path.join(root, 'src', 'new-seam', 'index.ts'), 'export {};\n');
  await writeFile(
    path.join(root, '.agent-atlas', 'public', 'components', 'existing.yaml'),
    `id: component:existing
kind: component
title: Existing
summary: Existing card.
visibility: public
code:
  paths:
    - src/existing/**
`,
  );
  return root;
}

async function writeUsageReceipt(
  root: string,
  fileName: string,
  input: {
    task: string;
    selected_files: string[];
    missing_cards?: string[];
    broad_search_fallback?: boolean;
  },
): Promise<void> {
  const receiptDir = path.join(root, '.runtime', 'agent-atlas', 'usage');
  await mkdir(receiptDir, { recursive: true });
  await writeFile(
    path.join(receiptDir, fileName),
    `version: 1
recorded_at: "2026-04-30T10:00:00.000Z"
task: ${JSON.stringify(input.task)}
command: context-pack
profile: public
selected_entities: []
selected_files:
${input.selected_files.map((filePath) => `  - ${filePath}`).join('\n')}
selected_tests: []
broad_search_fallback: ${input.broad_search_fallback === true}
missing_cards:
${(input.missing_cards ?? []).map((card) => `  - ${JSON.stringify(card)}`).join('\n') || '  []'}
misleading_cards: []
`,
  );
}
