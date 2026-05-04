import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse, stringify } from 'yaml';

import type { AtlasEntityId } from '@agent-atlas/schema';
import { createContextPack } from './context-pack.js';
import type { AtlasGraph } from './graph.js';
import { loadAtlasGraph } from './graph.js';
import type { AtlasProfile } from './profile.js';

export interface AtlasUsageNoteInput {
  rootPath: string;
  task: string;
  command: string;
  profile?: AtlasProfile;
  selectedEntities?: AtlasEntityId[];
  selectedFiles?: string[];
  selectedTests?: string[];
  broadSearchFallback?: boolean;
  missingCards?: string[];
  misleadingCards?: string[];
  outcome?: string;
  outputPath?: string;
  now?: Date;
}

export interface AtlasUsageNote {
  version: 1;
  recorded_at: string;
  task: string;
  command: string;
  profile: AtlasProfile;
  selected_entities: AtlasEntityId[];
  selected_files: string[];
  selected_tests: string[];
  broad_search_fallback: boolean;
  missing_cards: string[];
  misleading_cards: string[];
  outcome?: string;
}

export interface WriteUsageNoteResult {
  path: string;
  note: AtlasUsageNote;
}

export interface EvaluateUsageEvidenceOptions {
  profile?: AtlasProfile;
  receiptsPath?: string;
  budget?: number;
  evaluationVersion?: string;
  now?: Date;
}

export interface UsageEvidenceReceiptResult {
  path: string;
  task: string;
  command: string;
  broadSearchFallback: boolean;
  missingCards: string[];
  misleadingCards: string[];
  expectedEntities: AtlasEntityId[];
  selectedEntities: AtlasEntityId[];
  entityRecall: number | null;
  expectedFiles: string[];
  selectedFiles: string[];
  fileRecall: number | null;
  expectedTests: string[];
  selectedTests: string[];
  testRecall: number | null;
}

export interface UsageEvidenceEvaluation {
  evaluationVersion?: string;
  generatedAt: string;
  atlasPackageVersion: string;
  receiptVersion: 1;
  rootPath: string;
  receiptsPath: string;
  profile: AtlasProfile;
  receiptCount: number;
  averages: {
    entityRecall: number | null;
    fileRecall: number | null;
    testRecall: number | null;
  };
  broadSearchFallbacks: number;
  missingCardMentions: number;
  misleadingCardMentions: number;
  receipts: UsageEvidenceReceiptResult[];
  notes: string[];
}

const ATLAS_PACKAGE_VERSION = '0.17.0';
const USAGE_RECEIPT_VERSION = 1;

export async function writeUsageNote(
  input: AtlasUsageNoteInput,
): Promise<WriteUsageNoteResult> {
  const rootPath = path.resolve(input.rootPath);
  const note = createUsageNote(input);
  const outputPath =
    input.outputPath ??
    path.join(
      rootPath,
      '.agent-atlas',
      'usage',
      `${note.recorded_at.replace(/[:.]/g, '-')}-${slugify(note.task)}.yaml`,
    );
  const absoluteOutputPath = path.resolve(rootPath, outputPath);

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, stringify(note), 'utf8');

  return {
    path: absoluteOutputPath,
    note,
  };
}

export function createUsageNote(input: AtlasUsageNoteInput): AtlasUsageNote {
  const now = input.now ?? new Date();
  return {
    version: 1,
    recorded_at: now.toISOString(),
    task: input.task,
    command: input.command,
    profile: input.profile ?? 'public',
    selected_entities: uniqueSorted(input.selectedEntities ?? []),
    selected_files: uniqueSorted(input.selectedFiles ?? []),
    selected_tests: uniqueSorted(input.selectedTests ?? []),
    broad_search_fallback: input.broadSearchFallback ?? false,
    missing_cards: uniqueSorted(input.missingCards ?? []),
    misleading_cards: uniqueSorted(input.misleadingCards ?? []),
    outcome: input.outcome,
  };
}

export async function evaluateUsageEvidence(
  rootPath: string,
  options: EvaluateUsageEvidenceOptions = {},
): Promise<UsageEvidenceEvaluation> {
  const absoluteRoot = path.resolve(rootPath);
  const receiptsPath = path.resolve(
    absoluteRoot,
    options.receiptsPath ?? path.join('.agent-atlas', 'usage'),
  );
  const profile = options.profile ?? 'public';
  const graph = await loadAtlasGraph(absoluteRoot, { profile });
  const receiptFiles = await collectYamlFiles(receiptsPath);
  const receipts: UsageEvidenceReceiptResult[] = [];

  for (const receiptPath of receiptFiles) {
    const receipt = await readUsageNote(receiptPath);
    if (!receipt) {
      continue;
    }
    receipts.push(
      evaluateReceipt(graph, receiptPath, receipt, {
        budget: options.budget,
        profile,
      }),
    );
  }

  return {
    evaluationVersion: options.evaluationVersion,
    generatedAt: (options.now ?? new Date()).toISOString(),
    atlasPackageVersion: ATLAS_PACKAGE_VERSION,
    receiptVersion: USAGE_RECEIPT_VERSION,
    rootPath: absoluteRoot,
    receiptsPath,
    profile,
    receiptCount: receipts.length,
    averages: {
      entityRecall: average(receipts.map((receipt) => receipt.entityRecall)),
      fileRecall: average(receipts.map((receipt) => receipt.fileRecall)),
      testRecall: average(receipts.map((receipt) => receipt.testRecall)),
    },
    broadSearchFallbacks: receipts.filter((receipt) => receipt.broadSearchFallback)
      .length,
    missingCardMentions: receipts.reduce(
      (count, receipt) => count + receipt.missingCards.length,
      0,
    ),
    misleadingCardMentions: receipts.reduce(
      (count, receipt) => count + receipt.misleadingCards.length,
      0,
    ),
    receipts,
    notes: [
      'Evaluation is local-only and reads session receipts from disk.',
      'Recall compares expected receipt items with deterministic context-pack output.',
      'Null recall means the receipt did not record expected items for that category.',
    ],
  };
}

function evaluateReceipt(
  graph: AtlasGraph,
  receiptPath: string,
  receipt: AtlasUsageNote,
  options: { budget?: number; profile: AtlasProfile },
): UsageEvidenceReceiptResult {
  const pack = createContextPack(graph, {
    task: receipt.task,
    budget: options.budget,
    profile: options.profile,
    deterministic: true,
  });
  const selectedEntities = pack.entities.map((candidate) => candidate.entity.id);
  const selectedFiles = pack.recommendedReads.map((read) => read.value);
  const selectedTests = pack.verification.flatMap((item) =>
    item.commands.map((command) => command.command),
  );

  return {
    path: receiptPath,
    task: receipt.task,
    command: receipt.command,
    broadSearchFallback: receipt.broad_search_fallback,
    missingCards: receipt.missing_cards,
    misleadingCards: receipt.misleading_cards,
    expectedEntities: receipt.selected_entities,
    selectedEntities,
    entityRecall: recall(receipt.selected_entities, selectedEntities),
    expectedFiles: receipt.selected_files,
    selectedFiles,
    fileRecall: recall(receipt.selected_files, selectedFiles),
    expectedTests: receipt.selected_tests,
    selectedTests,
    testRecall: recall(receipt.selected_tests, selectedTests),
  };
}

async function readUsageNote(filePath: string): Promise<AtlasUsageNote | undefined> {
  const content = await readFile(filePath, 'utf8');
  const parsed = parse(content) as unknown;
  if (!isRecord(parsed) || parsed.version !== 1) {
    return undefined;
  }

  if (
    typeof parsed.task !== 'string' ||
    typeof parsed.command !== 'string' ||
    typeof parsed.recorded_at !== 'string'
  ) {
    return undefined;
  }

  return {
    version: 1,
    recorded_at: parsed.recorded_at,
    task: parsed.task,
    command: parsed.command,
    profile: parseProfileValue(parsed.profile),
    selected_entities: parseStringArray(parsed.selected_entities) as AtlasEntityId[],
    selected_files: parseStringArray(parsed.selected_files),
    selected_tests: parseStringArray(parsed.selected_tests),
    broad_search_fallback: parsed.broad_search_fallback === true,
    missing_cards: parseStringArray(parsed.missing_cards),
    misleading_cards: parseStringArray(parsed.misleading_cards),
    outcome: typeof parsed.outcome === 'string' ? parsed.outcome : undefined,
  };
}

async function collectYamlFiles(directory: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDirectory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentDirectory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
        files.push(entryPath);
      }
    }
  }

  await walk(directory);
  return files.sort();
}

function parseProfileValue(value: unknown): AtlasProfile {
  return value === 'private' || value === 'company' ? value : 'public';
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? uniqueSorted(value.filter((item): item is string => typeof item === 'string'))
    : [];
}

function recall(expected: string[], actual: string[]): number | null {
  if (expected.length === 0) {
    return null;
  }
  const actualSet = new Set(actual);
  return round(expected.filter((item) => actualSet.has(item)).length / expected.length);
}

function average(values: Array<number | null>): number | null {
  const presentValues = values.filter((value): value is number => value !== null);
  if (presentValues.length === 0) {
    return null;
  }
  return round(
    presentValues.reduce((total, value) => total + value, 0) / presentValues.length,
  );
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'usage-note';
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
