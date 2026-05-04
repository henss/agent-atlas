#!/usr/bin/env node

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  analyzeAtlasMaintenance,
  createAtlasOverview,
  applyAtlasProposal,
  benchmarkAtlas,
  checkAtlasBoundary,
  createContextPack,
  discoverAtlasGaps,
  doctorAtlas,
  evaluateUsageEvidence,
  findNeighbors,
  loadGlobalAtlasGraph,
  loadAtlasGraph,
  loadAtlasMaintenancePolicy,
  migrateAtlas,
  parseAtlasProfile,
  proposeAtlasCards,
  renderContextPackMarkdown,
  renderAtlasOverviewMarkdown,
  resolvePathInGraph,
  applyAtlasMaintenanceMetadataFixes,
  suggestAtlasCard,
  validateAtlasProposal,
  validateAtlas,
  writeAtlasCardProposal,
  writeUsageNote,
} from '@agent-atlas/core';
import { generateMarkdownViews } from '@agent-atlas/markdown';
import { parseMcpProfile, runAtlasMcpSmokeTest } from '@agent-atlas/mcp-server';
import type { AtlasMcpSmokeTestResult } from '@agent-atlas/mcp-server';
import { startAtlasUiServer } from '@agent-atlas/ui';
import type {
  AtlasDiagnostic,
  AtlasGraph,
  AtlasGraphEdge,
  AtlasProfile,
  AtlasValidationResult,
  PathContextMatch,
  PathOwnerMatch,
  PathResolutionResult,
  NeighborResult,
  AtlasDoctorResult,
  AtlasMaintenanceReport,
  BoundaryCheckResult,
  ApplyAtlasProposalResult,
  AtlasCardProposal,
  GlobalAtlasGraph,
  AtlasGapReport,
  AtlasMaintenanceMetadataFixResult,
  AtlasMaintenancePolicy,
  AtlasProposalValidationResult,
  SuggestedAtlasCard,
  UsageEvidenceEvaluation,
  WriteUsageNoteResult,
} from '@agent-atlas/core';
import type {
  AtlasEntity,
  AtlasEntityId,
  AtlasRelationType,
} from '@agent-atlas/schema';
import { ATLAS_RELATION_TYPES } from '@agent-atlas/schema';

const [, , command, ...args] = process.argv;

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

function printHelp(): void {
  console.log(`# Agent Atlas CLI

Status: implemented toolkit

Implemented commands:

- atlas validate [path]
- atlas overview [path]
- atlas show <entity-id>
- atlas neighbors <entity-id> --depth 2
- atlas resolve-path <path>
- atlas context-pack "<task>" --budget 4000
- atlas generate markdown
- atlas generate markdown --check
- atlas suggest-card --path <file>
- atlas discover-gaps [path]
- atlas propose-cards --report <file>
- atlas proposal validate <proposal>
- atlas proposal apply <proposal> --select <entity-id>
- atlas maintain check|fix|agent-instructions [path]
- atlas diff
- atlas migrate [path] --to 1 [--write]
- atlas benchmark [path]
- atlas doctor [path]
- atlas boundary-check [path]
- atlas usage-note "<task>" --command <command>
- atlas evaluate [path]
- atlas mcp smoke-test [path]
- atlas ui [path]
- atlas global validate [path]
- atlas global list [path]
- atlas global context-pack "<task>" --budget 8000
- atlas global manifest [path]
- atlas global generate markdown [path]

Path rule: use one positional root path or --path <root>, not both.
Current command: ${command ?? '(none)'}
Args: ${args.join(' ')}
`);
}

function readOptionValue(
  args: string[],
  index: number,
  optionName: string,
): string {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) {
    throw new CliUsageError(`Missing value for ${optionName}.`);
  }
  return value;
}

function rejectUnknownOption(arg: string): void {
  if (arg.startsWith('-')) {
    throw new CliUsageError(`Unknown option: ${arg}`);
  }
}

function setRootPath(
  nextRootPath: string,
  rootPathWasSet: boolean,
): [string, boolean] {
  if (rootPathWasSet) {
    throw new CliUsageError('Use either one positional path or --path <root>, not both.');
  }
  return [nextRootPath, true];
}

function parseValidateArgs(args: string[]): {
  rootPath: string;
  profile: AtlasProfile;
  json: boolean;
} {
  let rootPath = process.cwd();
  let profile: AtlasProfile = 'public';
  let json = false;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return { rootPath, profile, json };
}

interface ShowArgs {
  entityId?: AtlasEntityId;
  rootPath: string;
  profile: AtlasProfile;
  json: boolean;
}

interface NeighborArgs extends ShowArgs {
  depth: number;
  relationTypes?: AtlasRelationType[];
}

interface ResolvePathArgs {
  filePath?: string;
  rootPath: string;
  profile: AtlasProfile;
  json: boolean;
  depth: number;
}

interface GenerateMarkdownArgs {
  rootPath: string;
  outputPath: string;
  profile: AtlasProfile;
  check: boolean;
  json: boolean;
}

interface ContextPackArgs {
  task?: string;
  rootPath: string;
  budget: number;
  profile: AtlasProfile;
  deterministic: boolean;
  json: boolean;
}

interface GlobalArgs {
  subcommand?: string;
  rootPath: string;
  profile: AtlasProfile;
  json: boolean;
}

interface GlobalContextPackArgs extends GlobalArgs {
  task?: string;
  budget: number;
  deterministic: boolean;
}

interface GlobalGenerateMarkdownArgs extends GlobalArgs {
  outputPath: string;
  check: boolean;
}

interface MigrateArgs {
  rootPath: string;
  toVersion: number;
  write: boolean;
  json: boolean;
}

interface BenchmarkArgs {
  rootPath: string;
  profile: AtlasProfile;
  iterations: number;
  json: boolean;
}

interface DoctorArgs {
  rootPath: string;
  profile: AtlasProfile;
  json: boolean;
}

interface BoundaryCheckArgs {
  rootPath: string;
  profile: AtlasProfile;
  policyPath?: string;
  includeGenerated: boolean;
  json: boolean;
}

interface SuggestCardArgs {
  filePath?: string;
  rootPath: string;
  json: boolean;
}

interface DiffArgs {
  rootPath: string;
  profile: AtlasProfile;
  json: boolean;
}

interface MaintainArgs {
  subcommand?: string;
  rootPath: string;
  profile?: AtlasProfile;
  policyPath?: string;
  json: boolean;
  changedOnly: boolean;
}

interface CliMaintainCheckReport {
  rootPath: string;
  policy: AtlasMaintenancePolicy;
  validation: AtlasValidationResult;
  boundary?: BoundaryCheckResult;
  diff: CliDiffReport;
  status: 'passed' | 'failed';
}

interface CliMaintainFixReport extends CliMaintainCheckReport {
  metadataFix: AtlasMaintenanceMetadataFixResult;
  regeneratedFiles: string[];
}

interface DiscoverGapsArgs {
  rootPath: string;
  profile: AtlasProfile;
  receiptsPath?: string;
  budget: number;
  recallThreshold: number;
  resolvePathMisses: string[];
  static: boolean;
  outputPath?: string;
  json: boolean;
}

interface ProposeCardsArgs {
  reportPath?: string;
  outputDirectory: string;
  llm: boolean;
  llmProvider?: string;
  json: boolean;
}

interface ProposalArgs {
  subcommand?: string;
  proposalPath?: string;
  rootPath?: string;
  selectedEntityIds: AtlasEntityId[];
  json: boolean;
}

interface CliDiffReport extends AtlasMaintenanceReport {
  generatedOutputPath: string;
  staleGeneratedFiles: string[];
  missingGeneratedFiles: string[];
  extraGeneratedFiles: string[];
}

interface UsageNoteArgs {
  task?: string;
  rootPath: string;
  profile: AtlasProfile;
  command: string;
  selectedEntities: AtlasEntityId[];
  selectedFiles: string[];
  selectedTests: string[];
  broadSearchFallback: boolean;
  missingCards: string[];
  misleadingCards: string[];
  outcome?: string;
  outputPath?: string;
  json: boolean;
}

interface EvaluateArgs {
  rootPath: string;
  profile: AtlasProfile;
  receiptsPath?: string;
  budget: number;
  evaluationVersion?: string;
  outputPath?: string;
  json: boolean;
}

interface McpSmokeTestArgs {
  rootPath: string;
  profile: AtlasProfile;
  pathToResolve: string;
  task?: string;
  budget: number;
  json: boolean;
}

interface UiArgs {
  rootPath: string;
  profile: AtlasProfile;
  host: string;
  port: number;
}

function parseShowArgs(args: string[]): ShowArgs {
  let entityId: AtlasEntityId | undefined;
  let rootPath = process.cwd();
  let profile: AtlasProfile = 'public';
  let json = false;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    if (!entityId) {
      entityId = arg as AtlasEntityId;
      continue;
    }

    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return { entityId, rootPath, profile, json };
}

function parseNeighborArgs(args: string[]): NeighborArgs {
  const relationTypes: AtlasRelationType[] = [];
  let entityId: AtlasEntityId | undefined;
  let rootPath = process.cwd();
  let profile: AtlasProfile = 'public';
  let json = false;
  let depth = 1;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    if (arg === '--depth') {
      depth = parsePositiveInteger(readOptionValue(args, index, '--depth'), 1);
      index += 1;
      continue;
    }

    if (arg === '--relation' || arg === '--relations') {
      for (const type of parseRelationTypes(readOptionValue(args, index, arg))) {
        relationTypes.push(type);
      }
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    if (!entityId) {
      entityId = arg as AtlasEntityId;
      continue;
    }

    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return {
    entityId,
    rootPath,
    profile,
    json,
    depth,
    relationTypes: relationTypes.length > 0 ? relationTypes : undefined,
  };
}

function parseResolvePathArgs(args: string[]): ResolvePathArgs {
  let filePath: string | undefined;
  let rootPath = process.cwd();
  let profile: AtlasProfile = 'public';
  let json = false;
  let depth = 3;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    if (arg === '--depth') {
      depth = parsePositiveInteger(readOptionValue(args, index, '--depth'), 3);
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    if (!filePath) {
      filePath = arg;
      continue;
    }

    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return { filePath, rootPath, profile, json, depth };
}

function parseGenerateMarkdownArgs(args: string[]): GenerateMarkdownArgs {
  let rootPath = process.cwd();
  let outputPath = 'docs/agents';
  let profile: AtlasProfile = 'public';
  let check = false;
  let json = false;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === 'markdown') {
      continue;
    }

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--check') {
      check = true;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    if (arg === '--output') {
      outputPath = readOptionValue(args, index, '--output');
      index += 1;
      continue;
    }

    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return { rootPath, outputPath, profile, check, json };
}

function parseContextPackArgs(args: string[]): ContextPackArgs {
  let task: string | undefined;
  let rootPath = process.cwd();
  let budget = 4000;
  let profile: AtlasProfile = 'public';
  let deterministic = false;
  let json = false;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--deterministic') {
      deterministic = true;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    if (arg === '--budget') {
      budget = parsePositiveInteger(readOptionValue(args, index, '--budget'), budget);
      index += 1;
      continue;
    }

    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    if (!task) {
      task = arg;
      continue;
    }

    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return { task, rootPath, budget, profile, deterministic, json };
}

function parseGlobalArgs(args: string[]): GlobalArgs {
  let subcommand: string | undefined;
  let rootPath = process.cwd();
  let profile: AtlasProfile = 'company';
  let json = false;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    if (!subcommand) {
      subcommand = arg;
      continue;
    }

    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return { subcommand, rootPath, profile, json };
}

function parseGlobalContextPackArgs(args: string[]): GlobalContextPackArgs {
  let task: string | undefined;
  let rootPath = process.cwd();
  let profile: AtlasProfile = 'company';
  let budget = 8000;
  let deterministic = false;
  let json = false;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === 'context-pack') {
      continue;
    }

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--deterministic') {
      deterministic = true;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    if (arg === '--budget') {
      budget = parsePositiveInteger(readOptionValue(args, index, '--budget'), budget);
      index += 1;
      continue;
    }

    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    if (!task) {
      task = arg;
      continue;
    }

    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return {
    subcommand: 'context-pack',
    task,
    rootPath,
    profile,
    budget,
    deterministic,
    json,
  };
}

function parseGlobalGenerateMarkdownArgs(
  args: string[],
): GlobalGenerateMarkdownArgs {
  let rootPath = process.cwd();
  let profile: AtlasProfile = 'company';
  let outputPath = 'docs/agents/global';
  let check = false;
  let json = false;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === 'generate' || arg === 'markdown') {
      continue;
    }

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--check') {
      check = true;
      continue;
    }

    if (arg === '--output') {
      outputPath = readOptionValue(args, index, '--output');
      index += 1;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return {
    subcommand: 'generate',
    rootPath,
    profile,
    outputPath,
    check,
    json,
  };
}

function parseMigrateArgs(args: string[]): MigrateArgs {
  let rootPath = process.cwd();
  let toVersion = 1;
  let write = false;
  let json = false;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--write') {
      write = true;
      continue;
    }

    if (arg === '--to') {
      toVersion = parsePositiveInteger(readOptionValue(args, index, '--to'), toVersion);
      index += 1;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return { rootPath, toVersion, write, json };
}

function parseBenchmarkArgs(args: string[]): BenchmarkArgs {
  let rootPath = process.cwd();
  let profile: AtlasProfile = 'public';
  let iterations = 3;
  let json = false;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    if (arg === '--iterations') {
      iterations = parsePositiveInteger(
        readOptionValue(args, index, '--iterations'),
        iterations,
      );
      index += 1;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return { rootPath, profile, iterations, json };
}

function parseDoctorArgs(args: string[]): DoctorArgs {
  let rootPath = process.cwd();
  let profile: AtlasProfile = 'public';
  let json = false;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return { rootPath, profile, json };
}

function parseBoundaryCheckArgs(args: string[]): BoundaryCheckArgs {
  let rootPath = process.cwd();
  let profile: AtlasProfile = 'public';
  let json = false;
  let policyPath: string | undefined;
  let includeGenerated = true;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--no-generated') {
      includeGenerated = false;
      continue;
    }

    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    if (arg === '--policy') {
      policyPath = readOptionValue(args, index, '--policy');
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return { rootPath, profile, policyPath, includeGenerated, json };
}

function parseSuggestCardArgs(args: string[]): SuggestCardArgs {
  let filePath: string | undefined;
  let rootPath = process.cwd();
  let json = false;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--path') {
      filePath = readOptionValue(args, index, '--path');
      index += 1;
      continue;
    }

    if (arg === '--root') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--root'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return { filePath, rootPath, json };
}

function parseDiffArgs(args: string[]): DiffArgs {
  let rootPath = process.cwd();
  let profile: AtlasProfile = 'public';
  let json = false;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return { rootPath, profile, json };
}

function parseMaintainArgs(args: string[]): MaintainArgs {
  let subcommand: string | undefined;
  let rootPath = process.cwd();
  let profile: AtlasProfile | undefined;
  let policyPath: string | undefined;
  let json = false;
  let changedOnly = false;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--changed-only') {
      changedOnly = true;
      continue;
    }

    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    if (arg === '--policy') {
      policyPath = readOptionValue(args, index, '--policy');
      index += 1;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    if (!subcommand) {
      subcommand = arg;
      continue;
    }

    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return { subcommand, rootPath, profile, policyPath, json, changedOnly };
}

function parseDiscoverGapsArgs(args: string[]): DiscoverGapsArgs {
  let rootPath = process.cwd();
  let profile: AtlasProfile = 'public';
  let receiptsPath: string | undefined;
  let outputPath: string | undefined;
  let budget = 4000;
  let recallThreshold = 0.67;
  let staticDiscovery = true;
  let json = false;
  let rootPathWasSet = false;
  const resolvePathMisses: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--no-static') {
      staticDiscovery = false;
      continue;
    }
    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }
    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }
    if (arg === '--receipts') {
      receiptsPath = readOptionValue(args, index, '--receipts');
      index += 1;
      continue;
    }
    if (arg === '--budget') {
      budget = parsePositiveInteger(readOptionValue(args, index, '--budget'), budget);
      index += 1;
      continue;
    }
    if (arg === '--recall-threshold') {
      recallThreshold = Number(readOptionValue(args, index, '--recall-threshold'));
      index += 1;
      continue;
    }
    if (arg === '--resolve-path-miss') {
      resolvePathMisses.push(readOptionValue(args, index, '--resolve-path-miss'));
      index += 1;
      continue;
    }
    if (arg === '--out') {
      outputPath = readOptionValue(args, index, '--out');
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return {
    rootPath,
    profile,
    receiptsPath,
    budget,
    recallThreshold,
    resolvePathMisses,
    static: staticDiscovery,
    outputPath,
    json,
  };
}

function parseProposeCardsArgs(args: string[]): ProposeCardsArgs {
  let reportPath: string | undefined;
  let outputDirectory = path.join(process.cwd(), '.runtime', 'agent-atlas', 'proposals');
  let llm = false;
  let llmProvider: string | undefined;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--report') {
      reportPath = readOptionValue(args, index, '--report');
      index += 1;
      continue;
    }
    if (arg === '--out') {
      outputDirectory = readOptionValue(args, index, '--out');
      index += 1;
      continue;
    }
    if (arg === '--llm') {
      llm = true;
      continue;
    }
    if (arg === '--llm-provider') {
      llmProvider = readOptionValue(args, index, '--llm-provider');
      llm = true;
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    if (!reportPath) {
      reportPath = arg;
      continue;
    }
    throw new CliUsageError(`Unexpected argument: ${arg}`);
  }

  return { reportPath, outputDirectory, llm, llmProvider, json };
}

function parseProposalArgs(args: string[]): ProposalArgs {
  const subcommand = args[0];
  let proposalPath: string | undefined;
  let rootPath: string | undefined;
  let json = false;
  const selectedEntityIds: AtlasEntityId[] = [];

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--path') {
      rootPath = readOptionValue(args, index, '--path');
      index += 1;
      continue;
    }
    if (arg === '--select') {
      selectedEntityIds.push(readOptionValue(args, index, '--select') as AtlasEntityId);
      index += 1;
      continue;
    }
    rejectUnknownOption(arg);
    if (!proposalPath) {
      proposalPath = arg;
      continue;
    }
    throw new CliUsageError(`Unexpected argument: ${arg}`);
  }

  return { subcommand, proposalPath, rootPath, selectedEntityIds, json };
}

function parseUsageNoteArgs(args: string[]): UsageNoteArgs {
  let task: string | undefined;
  let rootPath = process.cwd();
  let profile: AtlasProfile = 'public';
  let commandName = 'context-pack';
  let json = false;
  let outputPath: string | undefined;
  let outcome: string | undefined;
  let broadSearchFallback = false;
  let rootPathWasSet = false;
  const selectedEntities: AtlasEntityId[] = [];
  const selectedFiles: string[] = [];
  const selectedTests: string[] = [];
  const missingCards: string[] = [];
  const misleadingCards: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--broad-search-fallback') {
      broadSearchFallback = true;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    if (arg === '--command') {
      commandName = readOptionValue(args, index, '--command');
      index += 1;
      continue;
    }

    if (arg === '--entity') {
      selectedEntities.push(readOptionValue(args, index, '--entity') as AtlasEntityId);
      index += 1;
      continue;
    }

    if (arg === '--file') {
      selectedFiles.push(readOptionValue(args, index, '--file'));
      index += 1;
      continue;
    }

    if (arg === '--test') {
      selectedTests.push(readOptionValue(args, index, '--test'));
      index += 1;
      continue;
    }

    if (arg === '--missing-card') {
      missingCards.push(readOptionValue(args, index, '--missing-card'));
      index += 1;
      continue;
    }

    if (arg === '--misleading-card') {
      misleadingCards.push(readOptionValue(args, index, '--misleading-card'));
      index += 1;
      continue;
    }

    if (arg === '--out') {
      outputPath = readOptionValue(args, index, '--out');
      index += 1;
      continue;
    }

    if (arg === '--outcome') {
      outcome = readOptionValue(args, index, '--outcome');
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    if (!task) {
      task = arg;
      continue;
    }

    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return {
    task,
    rootPath,
    profile,
    command: commandName,
    selectedEntities,
    selectedFiles,
    selectedTests,
    broadSearchFallback,
    missingCards,
    misleadingCards,
    outcome,
    outputPath,
    json,
  };
}

function parseEvaluateArgs(args: string[]): EvaluateArgs {
  let rootPath = process.cwd();
  let profile: AtlasProfile = 'public';
  let json = false;
  let receiptsPath: string | undefined;
  let budget = 4000;
  let evaluationVersion: string | undefined;
  let outputPath: string | undefined;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--') {
      continue;
    }

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--profile') {
      profile = parseAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    if (arg === '--receipts') {
      receiptsPath = readOptionValue(args, index, '--receipts');
      index += 1;
      continue;
    }

    if (arg === '--budget') {
      budget = parsePositiveInteger(readOptionValue(args, index, '--budget'), budget);
      index += 1;
      continue;
    }

    if (arg === '--evaluation-version') {
      evaluationVersion = readOptionValue(args, index, '--evaluation-version');
      index += 1;
      continue;
    }

    if (arg === '--out') {
      outputPath = readOptionValue(args, index, '--out');
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return { rootPath, profile, receiptsPath, budget, evaluationVersion, outputPath, json };
}

function parseMcpSmokeTestArgs(args: string[]): McpSmokeTestArgs {
  let rootPath = process.cwd();
  let profile: AtlasProfile = 'public';
  let pathToResolve = 'packages/cli/src/index.ts';
  let task: string | undefined;
  let budget = 1200;
  let json = false;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === 'smoke-test') {
      continue;
    }

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--profile') {
      profile = parseMcpProfile(readOptionValue(args, index, '--profile'), profile);
      index += 1;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    if (arg === '--resolve-path') {
      pathToResolve = readOptionValue(args, index, '--resolve-path');
      index += 1;
      continue;
    }

    if (arg === '--task') {
      task = readOptionValue(args, index, '--task');
      index += 1;
      continue;
    }

    if (arg === '--budget') {
      budget = parsePositiveInteger(readOptionValue(args, index, '--budget'), budget);
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return { rootPath, profile, pathToResolve, task, budget, json };
}

function parseUiArgs(args: string[]): UiArgs {
  let rootPath = process.cwd();
  let profile: AtlasProfile = 'public';
  let host = '127.0.0.1';
  let port = 4388;
  let rootPathWasSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--profile') {
      profile = parseStrictAtlasProfile(readOptionValue(args, index, '--profile'));
      index += 1;
      continue;
    }

    if (arg === '--path') {
      [rootPath, rootPathWasSet] = setRootPath(
        readOptionValue(args, index, '--path'),
        rootPathWasSet,
      );
      index += 1;
      continue;
    }

    if (arg === '--host') {
      host = readOptionValue(args, index, '--host');
      index += 1;
      continue;
    }

    if (arg === '--port') {
      port = parsePositiveInteger(readOptionValue(args, index, '--port'), port);
      index += 1;
      continue;
    }

    rejectUnknownOption(arg);
    [rootPath, rootPathWasSet] = setRootPath(arg, rootPathWasSet);
  }

  return { rootPath, profile, host, port };
}

function printValidationMarkdown(result: AtlasValidationResult): void {
  const errors = result.diagnostics.filter(
    (diagnostic) => diagnostic.level === 'error',
  );
  const warnings = result.diagnostics.filter(
    (diagnostic) => diagnostic.level === 'warning',
  );

  console.log(`# Atlas validation

Status: ${result.status}
Profile: \`${result.profile}\`

Entities: ${result.entityCount}
Relations: ${result.relationCount}
Warnings: ${warnings.length}
Errors: ${errors.length}`);

  printDiagnosticSection('Errors', errors);
  printDiagnosticSection('Warnings', warnings);
}

function printDiagnosticSection(
  title: string,
  diagnostics: AtlasDiagnostic[],
): void {
  if (diagnostics.length === 0) {
    return;
  }

  console.log(`\n## ${title}\n`);
  for (const diagnostic of diagnostics) {
    const subject = diagnostic.entityId
      ? `\`${diagnostic.entityId}\``
      : '`atlas`';
    console.log(`- ${subject}: ${diagnostic.message} \`${diagnostic.code}\``);
    if (diagnostic.hint) {
      console.log(`  Fix: ${diagnostic.hint}`);
    }
  }
}

function printShowMarkdown(graph: AtlasGraph, entity: AtlasEntity): void {
  const outgoing = graph.index.outgoingById.get(entity.id) ?? [];
  const incoming = graph.index.incomingById.get(entity.id) ?? [];

  console.log(`# ${entity.id}

Kind: ${entity.kind}
Title: ${entity.title}
Summary: ${entity.summary}`);

  if (entity.visibility) {
    console.log(`Visibility: ${entity.visibility}`);
  }

  printEdgeSection('Outgoing', outgoing);
  printEdgeSection('Incoming', incoming);
}

function printNeighborsMarkdown(
  startId: AtlasEntityId,
  depth: number,
  relationTypes: AtlasRelationType[] | undefined,
  neighbors: NeighborResult[],
): void {
  console.log(`# Atlas neighbors

Start: \`${startId}\`
Depth: ${depth}
Relations: ${relationTypes?.map((type) => `\`${type}\``).join(', ') ?? 'all'}
Count: ${neighbors.length}`);

  if (neighbors.length === 0) {
    return;
  }

  console.log('\n## Results\n');
  for (const neighbor of neighbors) {
    const via = neighbor.via
      ? ` via \`${neighbor.via.type}\` ${formatProvenance(neighbor.via)}`
      : '';
    console.log(
      `- d${neighbor.distance} \`${neighbor.entity.id}\` (${neighbor.entity.kind})${via}: ${neighbor.entity.title}`,
    );
  }
}

function printPathResolutionMarkdown(result: PathResolutionResult): void {
  console.log(`# Atlas path resolution

Path: \`${result.normalizedPath}\`
Owners: ${result.owners.length}`);

  printOwnerSection(result.owners);
  printContextSection('Workflows', result.workflows);
  printContextSection('Domains', result.domains);
  printContextSection('Documents', result.documents);
  printContextSection('Tests', result.tests);
}

function printGenerateMarkdownResult(result: {
  outputPath: string;
  profile: AtlasProfile;
  files: string[];
}): void {
  console.log(`# Atlas Markdown generation

Status: generated
Profile: \`${result.profile}\`
Output: \`${result.outputPath}\`
Files: ${result.files.length}`);

  if (result.files.length === 0) {
    return;
  }

  console.log('\n## Files\n');
  for (const file of result.files) {
    console.log(`- \`${file}\``);
  }
}

function printMigrateMarkdown(result: {
  rootPath: string;
  toVersion: number;
  write: boolean;
  scanned: number;
  changed: number;
  changes: Array<{ path: string; action: string; written: boolean }>;
}): void {
  console.log(`# Atlas migration

Status: ${result.write ? 'written' : 'planned'}
Root: \`${result.rootPath}\`
Target schema_version: ${result.toVersion}
Scanned: ${result.scanned}
Changes: ${result.changed}`);

  if (result.changes.length === 0) {
    return;
  }

  console.log('\n## Changes\n');
  for (const change of result.changes) {
    const state = change.written ? 'written' : 'planned';
    console.log(`- ${state} \`${change.action}\`: \`${change.path}\``);
  }

  if (!result.write) {
    console.log('\nRun again with `--write` to update files.');
  }
}

function printBenchmarkMarkdown(result: {
  rootPath: string;
  profile: AtlasProfile;
  iterations: number;
  entityCount: number;
  relationCount: number;
  diagnosticsCount: number;
  loadMs: { min: number; avg: number; max: number };
  normalizeMs: { min: number; avg: number; max: number };
}): void {
  console.log(`# Atlas benchmark

Root: \`${result.rootPath}\`
Profile: \`${result.profile}\`
Iterations: ${result.iterations}

Entities: ${result.entityCount}
Relations: ${result.relationCount}
Diagnostics: ${result.diagnosticsCount}

## Timings

| Phase | Min ms | Avg ms | Max ms |
|---|---:|---:|---:|
| load graph | ${result.loadMs.min} | ${result.loadMs.avg} | ${result.loadMs.max} |
| index access | ${result.normalizeMs.min} | ${result.normalizeMs.avg} | ${result.normalizeMs.max} |`);
}

function printDoctorMarkdown(result: AtlasDoctorResult): void {
  console.log(`# Atlas doctor

Status: ${result.status}
Root: \`${result.rootPath}\`
Profile: \`${result.profile}\`
Schema version: ${result.schemaVersion}
Registry version: ${result.registryVersion}

Commands: ${result.commands.map((commandName) => `\`${commandName}\``).join(', ')}`);

  if (Object.keys(result.packageVersions).length > 0) {
    console.log('\n## Package versions\n');
    for (const [name, version] of Object.entries(result.packageVersions).sort()) {
      console.log(`- \`${name}\`: \`${version}\``);
    }
  }

  console.log('\n## Checks\n');
  for (const check of result.checks) {
    console.log(`- ${check.status}: ${check.name} - ${check.message}`);
    if (check.hint) {
      console.log(`  Fix: ${check.hint}`);
    }
  }
}

function printBoundaryCheckMarkdown(result: BoundaryCheckResult): void {
  const errors = result.diagnostics.filter(
    (diagnostic) => diagnostic.level === 'error',
  );
  const warnings = result.diagnostics.filter(
    (diagnostic) => diagnostic.level === 'warning',
  );

  console.log(`# Atlas boundary check

Status: ${result.status}
Root: \`${result.rootPath}\`
Profile: \`${result.profile}\`
Policy: ${result.policyPath ? `\`${result.policyPath}\`` : 'default'}

Files checked: ${result.checkedFiles}
Warnings: ${warnings.length}
Errors: ${errors.length}`);

  printDiagnosticSection('Errors', errors);
  printDiagnosticSection('Warnings', warnings);
}

function printSuggestCardMarkdown(result: SuggestedAtlasCard): void {
  console.log(`# Atlas suggested card

Kind: \`${result.kind}\`
Entity: \`${result.entityId}\`
Path: \`${result.path}\`

## Draft YAML

\`\`\`yaml
${result.yaml.trimEnd()}
\`\`\`

## Notes

${result.notes.map((note) => `- ${note}`).join('\n')}`);
}

function printDiffMarkdown(result: CliDiffReport): void {
  const errors = result.diagnostics.filter(
    (diagnostic) => diagnostic.level === 'error',
  );
  const warnings = result.diagnostics.filter(
    (diagnostic) => diagnostic.level === 'warning',
  );

  console.log(`# Atlas diff

Status: ${result.status}
Root: \`${result.rootPath}\`

Changed atlas files: ${result.changedAtlasFiles.length}
Changed generated files: ${result.changedGeneratedFiles.length}
Stale generated files: ${result.staleGeneratedFiles.length}
Missing generated files: ${result.missingGeneratedFiles.length}
Extra generated files: ${result.extraGeneratedFiles.length}
Warnings: ${warnings.length}
Errors: ${errors.length}`);

  printFileList('Changed Atlas Files', result.changedAtlasFiles);
  printFileList('Changed Generated Files', result.changedGeneratedFiles);
  printFileList('Stale Generated Files', result.staleGeneratedFiles);
  printFileList('Missing Generated Files', result.missingGeneratedFiles);
  printFileList('Extra Generated Files', result.extraGeneratedFiles);
  printDiagnosticSection('Errors', errors);
  printDiagnosticSection('Warnings', warnings);
}

function printMaintainCheckMarkdown(result: CliMaintainCheckReport): void {
  console.log(`# Atlas maintenance check

Status: ${result.status}
Root: \`${result.rootPath}\`
Mode: \`${result.policy.mode}\`
Profile: \`${result.policy.profile}\`
Policy: ${result.policy.sourcePath ? `\`${result.policy.sourcePath}\`` : 'default'}

Validation: ${result.validation.status}
Boundary: ${result.boundary ? result.boundary.status : 'skipped'}
Diff: ${result.diff.status}`);

  printDiagnosticSection('Validation Diagnostics', result.validation.diagnostics);
  if (result.boundary) {
    printDiagnosticSection('Boundary Diagnostics', result.boundary.diagnostics);
  }
  printDiagnosticSection('Maintenance Diagnostics', result.diff.diagnostics);
  printFileList('Stale Generated Files', result.diff.staleGeneratedFiles);
  printFileList('Missing Generated Files', result.diff.missingGeneratedFiles);
  printFileList('Extra Generated Files', result.diff.extraGeneratedFiles);
}

function printMaintainFixMarkdown(result: CliMaintainFixReport): void {
  console.log(`# Atlas maintenance fix

Status: ${result.status}
Root: \`${result.rootPath}\`
Mode: \`${result.policy.mode}\`
Profile: \`${result.policy.profile}\`

Applied metadata files: ${result.metadataFix.appliedFiles.length}
Regenerated docs: ${result.regeneratedFiles.length}`);

  printFileList('Applied Metadata Files', result.metadataFix.appliedFiles);
  printFileList('Regenerated Docs', result.regeneratedFiles);
  if (result.metadataFix.skippedFiles.length > 0) {
    console.log('\n## Skipped Files\n');
    for (const skipped of result.metadataFix.skippedFiles) {
      console.log(`- \`${skipped.path}\`: ${skipped.reason}`);
    }
  }
  printDiagnosticSection('Diagnostics', [
    ...result.metadataFix.diagnostics,
    ...result.validation.diagnostics,
    ...(result.boundary?.diagnostics ?? []),
    ...result.diff.diagnostics,
  ]);
}

function printMaintainAgentInstructions(policy: AtlasMaintenancePolicy): void {
  console.log(`# Agent Atlas Maintenance Instructions

Mode: \`${policy.mode}\`
Profile: \`${policy.profile}\`
Generated docs: \`${policy.generated_docs.output}\`

Before broad repository search, run \`atlas resolve-path <changed-file>\` for file-specific work or \`atlas context-pack "<task>" --profile ${policy.profile}\` for broader work.

When Atlas metadata is missing or stale, follow the repo policy:
- \`review-only\`: record gaps or create proposals; do not apply metadata automatically.
- \`generated-docs-only\`: regenerate \`${policy.generated_docs.output}\` when stale; keep metadata changes review-gated.
- \`agent-maintained\`: update canonical \`.agent-atlas/**\` cards and regenerate \`${policy.generated_docs.output}\` when Atlas is wrong or incomplete.

Before finishing, run \`atlas maintain fix --profile ${policy.profile}\`, then \`atlas maintain check --profile ${policy.profile}\`. Boundary and secret-safety failures are blockers.`);
}

function printGapReportMarkdown(result: AtlasGapReport): void {
  console.log(`# Atlas gap discovery

Status: passed
Profile: \`${result.profile}\`
Receipts: ${result.receiptCount}
Gaps: ${result.gaps.length}
Actionable: ${result.gaps.filter((gap) => gap.recommendedAction === 'propose-card').length}
`);

  for (const gap of result.gaps.slice(0, 20)) {
    console.log(
      `- \`${gap.id}\` (${gap.type}, ${gap.recommendedAction}, confidence ${gap.confidence}): ${gap.sources[0]?.detail ?? 'gap'}`
    );
  }
}

function printCardProposalMarkdown(result: {
  proposalPath?: string;
  proposal: AtlasCardProposal;
}): void {
  console.log(`# Atlas card proposal

Status: ${result.proposal.proposedEntities.length > 0 ? 'generated' : 'empty'}
Profile: \`${result.proposal.profile}\`
Entities: ${result.proposal.proposedEntities.length}
Confidence: ${result.proposal.confidence}
${result.proposalPath ? `Path: \`${result.proposalPath}\`` : ''}
`);

  for (const entity of result.proposal.proposedEntities) {
    console.log(`- \`${entity.id}\` -> \`${entity.filePath}\``);
  }
  if (result.proposal.blockedReasons.length > 0) {
    console.log('\n## Blockers');
    for (const reason of result.proposal.blockedReasons) {
      console.log(`- ${reason}`);
    }
  }
}

function printProposalValidationMarkdown(result: AtlasProposalValidationResult): void {
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.level === 'error');
  const warnings = result.diagnostics.filter((diagnostic) => diagnostic.level === 'warning');
  console.log(`# Atlas proposal validation

Status: ${result.status}
Profile: \`${result.profile}\`
Entities: ${result.proposedEntityCount}
Errors: ${errors.length}
Warnings: ${warnings.length}
`);
  printDiagnosticSection('Errors', errors);
  printDiagnosticSection('Warnings', warnings);
}

function printProposalApplyMarkdown(result: ApplyAtlasProposalResult): void {
  console.log(`# Atlas proposal apply

Status: applied
Applied files: ${result.appliedFiles.length}
Skipped entities: ${result.skippedEntityIds.length}
`);
  printFileList('Applied Files', result.appliedFiles);
  if (result.skippedEntityIds.length > 0) {
    console.log('\n## Skipped Entities');
    for (const entityId of result.skippedEntityIds) {
      console.log(`- \`${entityId}\``);
    }
  }
}

function printGenerateCheckMarkdown(result: {
  outputPath: string;
  profile: AtlasProfile;
  staleFiles: string[];
  missingFiles: string[];
  extraFiles: string[];
}): void {
  const status =
    result.staleFiles.length === 0 &&
    result.missingFiles.length === 0 &&
    result.extraFiles.length === 0
      ? 'passed'
      : 'failed';
  console.log(`# Atlas Markdown check

Status: ${status}
Profile: \`${result.profile}\`
Output: \`${result.outputPath}\`
Stale files: ${result.staleFiles.length}
Missing files: ${result.missingFiles.length}
Extra files: ${result.extraFiles.length}`);

  printFileList('Stale Files', result.staleFiles);
  printFileList('Missing Files', result.missingFiles);
  printFileList('Extra Files', result.extraFiles);
}

function printFileList(title: string, files: string[]): void {
  if (files.length === 0) {
    return;
  }
  console.log(`\n## ${title}\n`);
  for (const file of files) {
    console.log(`- \`${file}\``);
  }
}

function printUsageNoteMarkdown(result: WriteUsageNoteResult): void {
  console.log(`# Atlas usage note

Status: written
Path: \`${result.path}\`
Task: ${result.note.task}
Command: \`${result.note.command}\`
Profile: \`${result.note.profile}\`

Entities: ${result.note.selected_entities.length}
Files: ${result.note.selected_files.length}
Tests: ${result.note.selected_tests.length}
Broad search fallback: ${result.note.broad_search_fallback ? 'yes' : 'no'}
Missing cards: ${result.note.missing_cards.length}
Misleading cards: ${result.note.misleading_cards.length}`);
}

function printUsageEvidenceMarkdown(result: UsageEvidenceEvaluation): void {
  console.log(`# Atlas usage evidence

Status: ${result.receiptCount > 0 ? 'evaluated' : 'no receipts'}
Root: \`${result.rootPath}\`
Receipts: \`${result.receiptsPath}\`
Profile: \`${result.profile}\`
${result.evaluationVersion ? `Evaluation version: \`${result.evaluationVersion}\`\n` : ''}

Receipt count: ${result.receiptCount}
Broad-search fallbacks: ${result.broadSearchFallbacks}
Missing-card mentions: ${result.missingCardMentions}
Misleading-card mentions: ${result.misleadingCardMentions}

## Recall

| Category | Average |
|---|---:|
| entities | ${formatOptionalScore(result.averages.entityRecall)} |
| files | ${formatOptionalScore(result.averages.fileRecall)} |
| tests | ${formatOptionalScore(result.averages.testRecall)} |`);

  if (result.receipts.length > 0) {
    console.log('\n## Receipts\n');
    for (const receipt of result.receipts) {
      console.log(
        `- \`${receipt.task}\`: entities ${formatOptionalScore(receipt.entityRecall)}, files ${formatOptionalScore(receipt.fileRecall)}, tests ${formatOptionalScore(receipt.testRecall)}`,
      );
    }
  }

  console.log('\n## Notes\n');
  for (const note of result.notes) {
    console.log(`- ${note}`);
  }
}

function printMcpSmokeTestMarkdown(result: AtlasMcpSmokeTestResult): void {
  console.log(`# Atlas MCP smoke test

Status: ${result.status}
Root: \`${result.atlasRoot}\`
Profile: \`${result.profile}\`
Path: \`${result.path}\`
Task: ${result.task}

resolve_path: ${result.resolvePathOk ? 'passed' : 'failed'}
context_pack: ${result.contextPackOk ? 'passed' : 'failed'}
read-only: ${result.readOnlyOk ? 'passed' : 'failed'}
Changed files: ${result.changedFiles.length}`);

  printFileList('Changed Files', result.changedFiles);

  if (result.diagnostics.length > 0) {
    console.log('\n## Diagnostics\n');
    for (const diagnostic of result.diagnostics) {
      console.log(`- ${diagnostic}`);
    }
  }
}

function printGlobalRegistryMarkdown(graph: GlobalAtlasGraph): void {
  const errors = graph.diagnostics.filter(
    (diagnostic) => diagnostic.level === 'error',
  );
  const warnings = graph.diagnostics.filter(
    (diagnostic) => diagnostic.level === 'warning',
  );

  console.log(`# Atlas global registry

Name: ${graph.registry.name}
Config: \`${graph.registry.configPath}\`
Status: ${errors.length > 0 ? 'failed' : 'passed'}

Imports: ${graph.registry.imports.length}
Entities: ${graph.entities.length}
Relations: ${graph.edges.filter((edge) => edge.provenance === 'explicit').length}
Warnings: ${warnings.length}
Errors: ${errors.length}`);

  if (graph.registry.imports.length > 0) {
    console.log('\n## Imports\n');
    for (const registryImport of graph.registry.imports) {
      const repository = registryImport.repository
        ? `, repository \`${registryImport.repository}\``
        : '';
      const schemaVersions =
        registryImport.schemaVersions.length > 0
          ? registryImport.schemaVersions.join(', ')
          : 'legacy';
      console.log(
        `- \`${registryImport.id}\` (${registryImport.role}, profile \`${registryImport.profile}\`${repository}): ${registryImport.entityCount} entities, ${registryImport.relationCount} relations, schema ${schemaVersions}`,
      );
    }
  }

  printDiagnosticSection('Errors', errors);
  printDiagnosticSection('Warnings', warnings);
}

function createGlobalRegistryManifest(graph: GlobalAtlasGraph): {
  version: 1;
  name: string;
  configPath: string;
  entityCount: number;
  relationCount: number;
  imports: Array<{
    id: string;
    role: string;
    path: string;
    rootPath: string;
    profile: AtlasProfile;
    repository?: AtlasEntityId;
    entityCount: number;
    relationCount: number;
    schemaVersions: number[];
    legacyEntityCount: number;
  }>;
  diagnostics: AtlasDiagnostic[];
} {
  return {
    version: 1,
    name: graph.registry.name,
    configPath: graph.registry.configPath,
    entityCount: graph.entities.length,
    relationCount: graph.edges.filter((edge) => edge.provenance === 'explicit')
      .length,
    imports: graph.registry.imports.map((registryImport) => ({
      id: registryImport.id,
      role: registryImport.role,
      path: registryImport.path,
      rootPath: registryImport.rootPath,
      profile: registryImport.profile,
      repository: registryImport.repository,
      entityCount: registryImport.entityCount,
      relationCount: registryImport.relationCount,
      schemaVersions: registryImport.schemaVersions,
      legacyEntityCount: registryImport.legacyEntityCount,
    })),
    diagnostics: graph.diagnostics,
  };
}

function printGlobalManifestMarkdown(
  manifest: ReturnType<typeof createGlobalRegistryManifest>,
): void {
  const errors = manifest.diagnostics.filter(
    (diagnostic) => diagnostic.level === 'error',
  );
  const warnings = manifest.diagnostics.filter(
    (diagnostic) => diagnostic.level === 'warning',
  );

  console.log(`# Atlas global manifest

Name: ${manifest.name}
Config: \`${manifest.configPath}\`
Status: ${errors.length > 0 ? 'failed' : 'passed'}

Registry version: ${manifest.version}
Imports: ${manifest.imports.length}
Entities: ${manifest.entityCount}
Relations: ${manifest.relationCount}
Warnings: ${warnings.length}
Errors: ${errors.length}

## Imports

| ID | Role | Profile | Path | Repository | Entities | Relations | Schema |
|---|---|---|---|---|---:|---:|---|`);

  for (const registryImport of manifest.imports) {
    const schema =
      registryImport.schemaVersions.length > 0
        ? registryImport.schemaVersions.join(', ')
        : 'legacy';
    console.log(
      `| \`${registryImport.id}\` | ${registryImport.role} | \`${registryImport.profile}\` | \`${registryImport.path}\` | ${registryImport.repository ? `\`${registryImport.repository}\`` : ''} | ${registryImport.entityCount} | ${registryImport.relationCount} | ${schema} |`,
    );
  }

  printDiagnosticSection('Errors', errors);
  printDiagnosticSection('Warnings', warnings);
}

function printGlobalListMarkdown(
  graph: AtlasGraph & {
    registry: {
      name: string;
      imports: Array<{
        id: string;
        role: string;
        repository?: AtlasEntityId;
        entityCount: number;
      }>;
    };
  },
): void {
  console.log(`# Atlas global entities

Registry: ${graph.registry.name}
Entities: ${graph.entities.length}`);

  const byKind = new Map<string, AtlasEntity[]>();
  for (const entity of graph.entities) {
    const entities = byKind.get(entity.kind) ?? [];
    entities.push(entity);
    byKind.set(entity.kind, entities);
  }

  for (const [kind, entities] of [...byKind.entries()].sort()) {
    console.log(`\n## ${kind}\n`);
    for (const entity of entities.sort((left, right) =>
      left.id.localeCompare(right.id),
    )) {
      const registry = entity.metadata?.registry;
      const importId =
        isRecord(registry) && typeof registry.importId === 'string'
          ? registry.importId
          : undefined;
      const importedFrom = importId ? ` _${importId}_` : '';
      console.log(`- \`${entity.id}\` - ${entity.title}${importedFrom}`);
    }
  }
}

function printOwnerSection(owners: PathOwnerMatch[]): void {
  if (owners.length === 0) {
    return;
  }

  console.log('\n## Owners\n');
  for (const owner of owners) {
    console.log(
      `- \`${owner.entity.id}\` (${owner.matchType}, ${owner.confidence.toFixed(2)}): ${owner.entity.title} via \`${owner.pattern}\``,
    );
  }
}

function printContextSection(title: string, matches: PathContextMatch[]): void {
  if (matches.length === 0) {
    return;
  }

  console.log(`\n## ${title}\n`);
  for (const match of matches) {
    const via = match.via.map((edge) => edge.type).join(' -> ');
    console.log(
      `- d${match.distance} \`${match.entity.id}\` (${match.confidence.toFixed(2)}): ${match.entity.title} via \`${via}\``,
    );
  }
}

function printEdgeSection(title: string, edges: AtlasGraphEdge[]): void {
  if (edges.length === 0) {
    return;
  }

  console.log(`\n## ${title}\n`);
  for (const edge of edges) {
    const target = title === 'Incoming' ? edge.source : edge.target;
    console.log(`- \`${edge.type}\` ${formatProvenance(edge)} \`${target}\``);
  }
}

function showUsage(): void {
  console.error(
    'Usage: atlas show <entity-id> [path] [--path <path>] [--profile public|private|company] [--json]',
  );
}

function neighborsUsage(): void {
  console.error(
    'Usage: atlas neighbors <entity-id> [path] [--depth N] [--relation type[,type]] [--profile public|private|company] [--json]',
  );
}

function resolvePathUsage(): void {
  console.error(
    'Usage: atlas resolve-path <file-path> [atlas-root] [--path <root>] [--profile public|private|company] [--json]',
  );
}

function generateMarkdownUsage(): void {
  console.error(
    'Usage: atlas generate markdown [path] [--path <root>] [--output docs/agents] [--profile public|private|company] [--check] [--json]',
  );
}

function contextPackUsage(): void {
  console.error(
    'Usage: atlas context-pack "<task>" [path] [--path <root>] [--budget tokens] [--profile public|private|company] [--deterministic] [--json]',
  );
}

function migrateUsage(): void {
  console.error(
    'Usage: atlas migrate [path] [--path <root>] [--to 1] [--write] [--json]',
  );
}

function benchmarkUsage(): void {
  console.error(
    'Usage: atlas benchmark [path] [--path <root>] [--profile public|private|company] [--iterations N] [--json]',
  );
}

function doctorUsage(): void {
  console.error(
    'Usage: atlas doctor [path] [--path <root>] [--profile public|private|company] [--json]',
  );
}

function boundaryCheckUsage(): void {
  console.error(
    'Usage: atlas boundary-check [path] [--path <root>] [--profile public|private|company] [--policy agent-atlas.boundary.yaml] [--no-generated] [--json]',
  );
}

function suggestCardUsage(): void {
  console.error(
    'Usage: atlas suggest-card --path <file> [--root <atlas-root>] [--json]',
  );
}

function diffUsage(): void {
  console.error(
    'Usage: atlas diff [path] [--path <root>] [--profile public|private|company] [--json]',
  );
}

function maintainUsage(): void {
  console.error(
    'Usage: atlas maintain check|fix|agent-instructions [path] [--path <root>] [--policy agent-atlas.maintenance.yaml] [--profile public|private|company] [--changed-only] [--json]',
  );
}

function discoverGapsUsage(): void {
  console.error(
    'Usage: atlas discover-gaps [path] [--path <root>] [--receipts .agent-atlas/usage] [--budget tokens] [--profile public|private|company] [--resolve-path-miss <file>] [--no-static] [--out file] [--json]',
  );
}

function proposeCardsUsage(): void {
  console.error(
    'Usage: atlas propose-cards --report <gap-report.json> [--out .runtime/agent-atlas/proposals] [--llm] [--llm-provider mock] [--json]',
  );
}

function proposalUsage(): void {
  console.error(
    'Usage: atlas proposal validate|apply <proposal.yaml> [--path <root>] [--select <entity-id>] [--json]',
  );
}

function usageNoteUsage(): void {
  console.error(
    'Usage: atlas usage-note "<task>" [--path <root>] [--command name] [--entity id] [--file path] [--test command] [--broad-search-fallback] [--missing-card text] [--misleading-card text] [--out file] [--json]',
  );
}

function evaluateUsage(): void {
  console.error(
    'Usage: atlas evaluate [path] [--path <root>] [--receipts .agent-atlas/usage] [--budget tokens] [--profile public|private|company] [--evaluation-version id] [--out file] [--json]',
  );
}

function mcpUsage(): void {
  console.error(
    'Usage: atlas mcp smoke-test [path] [--path <root>] [--profile public|private|company] [--resolve-path <file>] [--task text] [--budget tokens] [--json]',
  );
}

function uiUsage(): void {
  console.error(
    'Usage: atlas ui [path] [--path <root>] [--profile public|private|company] [--host 127.0.0.1] [--port 4388]',
  );
}

function globalUsage(): void {
  console.error(
    'Usage: atlas global validate|list|manifest|context-pack|generate markdown [path] [--path <registry-root>] [--profile public|private|company] [--json]',
  );
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseRelationTypes(value: string): AtlasRelationType[] {
  return value
    .split(',')
    .map((type) => type.trim())
    .filter(isAtlasRelationType);
}

function parseStrictAtlasProfile(value: string): AtlasProfile {
  if (value === 'public' || value === 'private' || value === 'company') {
    return value;
  }
  throw new CliUsageError(`Unsupported atlas profile: ${value}`);
}

function isAtlasRelationType(value: string): value is AtlasRelationType {
  return (ATLAS_RELATION_TYPES as readonly string[]).includes(value);
}

function formatProvenance(edge: AtlasGraphEdge): string {
  return edge.provenance === 'generated' ? '(generated)' : '(explicit)';
}

function formatOptionalScore(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(3);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function cleanGeneratedMarkdownOutput(outputPath: string): Promise<void> {
  await mkdir(outputPath, { recursive: true });
  for (const generatedPath of [
    'atlas.md',
    'verification.md',
    'components',
    'documents',
    'domains',
    'resources',
    'workflows',
  ]) {
    await rm(path.join(outputPath, generatedPath), {
      recursive: true,
      force: true,
    });
  }
}

async function checkGeneratedMarkdownOutput(
  outputPath: string,
  profile: AtlasProfile,
  files: Array<{ path: string; content: string }>,
): Promise<{
  outputPath: string;
  profile: AtlasProfile;
  staleFiles: string[];
  missingFiles: string[];
  extraFiles: string[];
}> {
  const staleFiles: string[] = [];
  const missingFiles: string[] = [];
  const expectedFiles = new Set(files.map((file) => normalizeGeneratedPath(file.path)));
  for (const file of files) {
    const absoluteFilePath = path.join(outputPath, file.path);
    try {
      const existing = await readFile(absoluteFilePath, 'utf8');
      if (existing.replace(/\r\n/g, '\n') !== file.content.replace(/\r\n/g, '\n')) {
        staleFiles.push(file.path);
      }
    } catch {
      missingFiles.push(file.path);
    }
  }

  const existingGeneratedFiles = await collectExistingGeneratedMarkdownFiles(outputPath);
  const extraFiles = existingGeneratedFiles
    .filter((filePath) => !expectedFiles.has(filePath))
    .sort();

  return {
    outputPath,
    profile,
    staleFiles,
    missingFiles,
    extraFiles,
  };
}

async function runMaintainCheck(
  options: MaintainArgs,
  policy: AtlasMaintenancePolicy,
): Promise<CliMaintainCheckReport> {
  const profile = options.profile ?? policy.profile;
  const effectivePolicy = { ...policy, profile };
  const validation = await validateAtlas(options.rootPath, { profile });
  const boundary = effectivePolicy.safety.require_boundary_check
    ? await checkAtlasBoundary(options.rootPath, { profile })
    : undefined;
  const graph = await loadAtlasGraph(options.rootPath, { profile });
  const maintenance = await analyzeAtlasMaintenance(graph);
  const generated = await checkGeneratedMarkdownOutput(
    path.resolve(options.rootPath, effectivePolicy.generated_docs.output),
    profile,
    generateMarkdownViews(graph, { profile }),
  );
  const generatedHasDrift =
    generated.staleFiles.length > 0 ||
    generated.missingFiles.length > 0 ||
    generated.extraFiles.length > 0;
  const diff: CliDiffReport = {
    ...maintenance,
    generatedOutputPath: generated.outputPath,
    staleGeneratedFiles: generated.staleFiles,
    missingGeneratedFiles: generated.missingFiles,
    extraGeneratedFiles: generated.extraFiles,
    status:
      maintenance.status === 'failed' || generatedHasDrift
        ? 'failed'
        : 'passed',
  };
  const status =
    validation.status === 'failed' ||
    boundary?.status === 'failed' ||
    diff.status === 'failed'
      ? 'failed'
      : 'passed';

  return {
    rootPath: path.resolve(options.rootPath),
    policy: effectivePolicy,
    validation,
    boundary,
    diff,
    status,
  };
}

async function writeGeneratedMarkdownOutput(
  rootPath: string,
  outputPath: string,
  profile: AtlasProfile,
): Promise<string[]> {
  const graph = await loadAtlasGraph(rootPath, { profile });
  const files = generateMarkdownViews(graph, { profile });
  const absoluteOutputPath = path.resolve(rootPath, outputPath);
  await cleanGeneratedMarkdownOutput(absoluteOutputPath);
  for (const file of files) {
    const absoluteFilePath = path.join(absoluteOutputPath, file.path);
    await mkdir(path.dirname(absoluteFilePath), { recursive: true });
    await writeFile(absoluteFilePath, file.content, 'utf8');
  }
  return files.map((file) => file.path);
}

async function collectExistingGeneratedMarkdownFiles(
  outputPath: string,
): Promise<string[]> {
  const files: string[] = [];

  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue;
      }

      try {
        const content = await readFile(entryPath, 'utf8');
        if (content.startsWith('<!-- Generated by Agent Atlas. Do not edit directly. -->')) {
          files.push(normalizeGeneratedPath(path.relative(outputPath, entryPath)));
        }
      } catch {
        // Ignore unreadable files here; the normal generator check will report
        // expected files that cannot be read as missing.
      }
    }
  }

  await walk(outputPath);
  return files.sort();
}

function normalizeGeneratedPath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

async function main(): Promise<void> {
switch (command) {
  case undefined:
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  case 'validate': {
    const options = parseValidateArgs(args);
    const result = await validateAtlas(options.rootPath, {
      profile: options.profile,
    });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printValidationMarkdown(result);
    }
    process.exitCode = result.status === 'failed' ? 1 : 0;
    break;
  }
  case 'overview': {
    const options = parseValidateArgs(args);
    const graph = await loadAtlasGraph(options.rootPath, {
      profile: options.profile,
    });
    const overview = createAtlasOverview(graph, options.profile);

    if (options.json) {
      console.log(JSON.stringify(overview, null, 2));
    } else {
      console.log(renderAtlasOverviewMarkdown(overview));
    }
    break;
  }
  case 'show': {
    const options = parseShowArgs(args);
    if (!options.entityId) {
      showUsage();
      process.exitCode = 1;
      break;
    }

    const graph = await loadAtlasGraph(options.rootPath, {
      profile: options.profile,
    });
    const entity = graph.index.entitiesById.get(options.entityId);
    if (!entity) {
      console.error(`Atlas entity not found: ${options.entityId}`);
      process.exitCode = 1;
      break;
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            entity,
            outgoing: graph.index.outgoingById.get(entity.id) ?? [],
            incoming: graph.index.incomingById.get(entity.id) ?? [],
            diagnostics: graph.diagnostics,
          },
          null,
          2,
        ),
      );
    } else {
      printShowMarkdown(graph, entity);
    }
    break;
  }
  case 'neighbors': {
    const options = parseNeighborArgs(args);
    if (!options.entityId) {
      neighborsUsage();
      process.exitCode = 1;
      break;
    }

    const graph = await loadAtlasGraph(options.rootPath, {
      profile: options.profile,
    });
    if (!graph.index.entitiesById.has(options.entityId)) {
      console.error(`Atlas entity not found: ${options.entityId}`);
      process.exitCode = 1;
      break;
    }

    const neighbors = findNeighbors(graph.index, options.entityId, {
      depth: options.depth,
      relationTypes: options.relationTypes,
    });

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            startId: options.entityId,
            depth: options.depth,
            relationTypes: options.relationTypes,
            neighbors,
            diagnostics: graph.diagnostics,
          },
          null,
          2,
        ),
      );
    } else {
      printNeighborsMarkdown(
        options.entityId,
        options.depth,
        options.relationTypes,
        neighbors,
      );
    }
    break;
  }
  case 'resolve-path': {
    const options = parseResolvePathArgs(args);
    if (!options.filePath) {
      resolvePathUsage();
      process.exitCode = 1;
      break;
    }

    const graph = await loadAtlasGraph(options.rootPath, {
      profile: options.profile,
    });
    const result = resolvePathInGraph(graph, options.filePath, {
      depth: options.depth,
    });

    if (options.json) {
      console.log(
        JSON.stringify({ ...result, diagnostics: graph.diagnostics }, null, 2),
      );
    } else {
      printPathResolutionMarkdown(result);
    }

    process.exitCode = result.owners.length === 0 ? 1 : 0;
    break;
  }
  case 'generate': {
    if (args[0] !== 'markdown') {
      generateMarkdownUsage();
      process.exitCode = 1;
      break;
    }

    const options = parseGenerateMarkdownArgs(args);
    const graph = await loadAtlasGraph(options.rootPath, {
      profile: options.profile,
    });
    const files = generateMarkdownViews(graph, { profile: options.profile });
    const absoluteOutputPath = path.resolve(
      options.rootPath,
      options.outputPath,
    );

    if (options.check) {
      const result = await checkGeneratedMarkdownOutput(
        absoluteOutputPath,
        options.profile,
        files,
      );
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printGenerateCheckMarkdown(result);
      }
      process.exitCode =
        result.staleFiles.length > 0 ||
        result.missingFiles.length > 0 ||
        result.extraFiles.length > 0
          ? 1
          : 0;
      break;
    }

    await cleanGeneratedMarkdownOutput(absoluteOutputPath);
    for (const file of files) {
      const absoluteFilePath = path.join(absoluteOutputPath, file.path);
      await mkdir(path.dirname(absoluteFilePath), { recursive: true });
      await writeFile(absoluteFilePath, file.content, 'utf8');
    }

    const result = {
      outputPath: absoluteOutputPath,
      profile: options.profile,
      files: files.map((file) => file.path),
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printGenerateMarkdownResult(result);
    }
    break;
  }
  case 'context-pack': {
    const options = parseContextPackArgs(args);
    if (!options.task) {
      contextPackUsage();
      process.exitCode = 1;
      break;
    }

    const graph = await loadAtlasGraph(options.rootPath, {
      profile: options.profile,
    });
    const pack = createContextPack(graph, {
      task: options.task,
      budget: options.budget,
      profile: options.profile,
      deterministic: options.deterministic,
    });

    if (options.json) {
      console.log(
        JSON.stringify({ ...pack, diagnostics: graph.diagnostics }, null, 2),
      );
    } else {
      console.log(renderContextPackMarkdown(pack));
    }
    break;
  }
  case 'suggest-card': {
    const options = parseSuggestCardArgs(args);
    if (!options.filePath) {
      suggestCardUsage();
      process.exitCode = 1;
      break;
    }

    const result = await suggestAtlasCard(options.rootPath, options.filePath);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printSuggestCardMarkdown(result);
    }
    break;
  }
  case 'diff': {
    const options = parseDiffArgs(args);
    const graph = await loadAtlasGraph(options.rootPath, {
      profile: options.profile,
    });
    const maintenance = await analyzeAtlasMaintenance(graph);
    const generated = await checkGeneratedMarkdownOutput(
      path.resolve(options.rootPath, 'docs/agents'),
      options.profile,
      generateMarkdownViews(graph, { profile: options.profile }),
    );
    const generatedHasDrift =
      generated.staleFiles.length > 0 ||
      generated.missingFiles.length > 0 ||
      generated.extraFiles.length > 0;
    const result: CliDiffReport = {
      ...maintenance,
      generatedOutputPath: generated.outputPath,
      staleGeneratedFiles: generated.staleFiles,
      missingGeneratedFiles: generated.missingFiles,
      extraGeneratedFiles: generated.extraFiles,
      status:
        maintenance.status === 'failed' || generatedHasDrift
          ? 'failed'
          : 'passed',
    };
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printDiffMarkdown(result);
    }
    process.exitCode = result.status === 'failed' ? 1 : 0;
    break;
  }
  case 'maintain': {
    const options = parseMaintainArgs(args);
    if (!options.subcommand) {
      maintainUsage();
      process.exitCode = 1;
      break;
    }

    const loadedPolicy = await loadAtlasMaintenancePolicy(
      options.rootPath,
      options.policyPath,
    );
    const policy = options.profile
      ? { ...loadedPolicy, profile: options.profile }
      : loadedPolicy;

    if (options.subcommand === 'agent-instructions') {
      if (options.json) {
        console.log(JSON.stringify({ policy }, null, 2));
      } else {
        printMaintainAgentInstructions(policy);
      }
      break;
    }

    if (options.subcommand === 'check') {
      const result = await runMaintainCheck(options, policy);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printMaintainCheckMarkdown(result);
      }
      process.exitCode = result.status === 'failed' ? 1 : 0;
      break;
    }

    if (options.subcommand === 'fix') {
      const metadataFix = await applyAtlasMaintenanceMetadataFixes(
        options.rootPath,
        policy,
      );
      const regeneratedFiles =
        policy.mode !== 'review-only' &&
        policy.generated_docs.auto_regenerate
          ? await writeGeneratedMarkdownOutput(
              options.rootPath,
              policy.generated_docs.output,
              policy.profile,
            )
          : [];
      const check = await runMaintainCheck(options, policy);
      const result: CliMaintainFixReport = {
        ...check,
        metadataFix,
        regeneratedFiles,
        status:
          metadataFix.status === 'failed' || check.status === 'failed'
            ? 'failed'
            : 'passed',
      };
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printMaintainFixMarkdown(result);
      }
      process.exitCode = result.status === 'failed' ? 1 : 0;
      break;
    }

    maintainUsage();
    process.exitCode = 1;
    break;
  }
  case 'discover-gaps': {
    const options = parseDiscoverGapsArgs(args);
    const result = await discoverAtlasGaps(options.rootPath, {
      profile: options.profile,
      receiptsPath: options.receiptsPath,
      budget: options.budget,
      recallThreshold: options.recallThreshold,
      resolvePathMisses: options.resolvePathMisses,
      static: options.static,
    });
    if (options.outputPath) {
      await mkdir(path.dirname(path.resolve(options.outputPath)), { recursive: true });
      await writeFile(path.resolve(options.outputPath), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    }
    if (options.json || options.outputPath) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printGapReportMarkdown(result);
    }
    break;
  }
  case 'propose-cards': {
    const options = parseProposeCardsArgs(args);
    if (!options.reportPath) {
      proposeCardsUsage();
      process.exitCode = 1;
      break;
    }
    const report = JSON.parse(await readFile(options.reportPath, 'utf8')) as AtlasGapReport;
    const proposal = proposeAtlasCards(report, {
      llm: options.llm,
      llmProvider: options.llmProvider,
    });
    const proposalPath = await writeAtlasCardProposal(
      proposal,
      path.resolve(options.outputDirectory),
    );
    if (options.json) {
      console.log(JSON.stringify({ proposalPath, proposal }, null, 2));
    } else {
      printCardProposalMarkdown({ proposalPath, proposal });
    }
    break;
  }
  case 'proposal': {
    const options = parseProposalArgs(args);
    if (!options.subcommand || !options.proposalPath) {
      proposalUsage();
      process.exitCode = 1;
      break;
    }
    if (options.subcommand === 'validate') {
      const result = await validateAtlasProposal(options.proposalPath, options.rootPath);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printProposalValidationMarkdown(result);
      }
      process.exitCode = result.status === 'failed' ? 1 : 0;
      break;
    }
    if (options.subcommand === 'apply') {
      const result = await applyAtlasProposal(options.proposalPath, {
        selectEntityIds: options.selectedEntityIds,
      });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printProposalApplyMarkdown(result);
      }
      break;
    }
    proposalUsage();
    process.exitCode = 1;
    break;
  }
  case 'migrate': {
    const options = parseMigrateArgs(args);
    if (options.toVersion !== 1) {
      migrateUsage();
      process.exitCode = 1;
      break;
    }

    const result = await migrateAtlas(options.rootPath, {
      toVersion: options.toVersion,
      write: options.write,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printMigrateMarkdown(result);
    }
    break;
  }
  case 'benchmark': {
    const options = parseBenchmarkArgs(args);
    if (options.iterations < 1) {
      benchmarkUsage();
      process.exitCode = 1;
      break;
    }

    const result = await benchmarkAtlas(options.rootPath, {
      profile: options.profile,
      iterations: options.iterations,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printBenchmarkMarkdown(result);
    }
    break;
  }
  case 'doctor': {
    const options = parseDoctorArgs(args);
    const result = await doctorAtlas(options.rootPath, {
      profile: options.profile,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printDoctorMarkdown(result);
    }

    process.exitCode = result.status === 'failed' ? 1 : 0;
    break;
  }
  case 'boundary-check': {
    const options = parseBoundaryCheckArgs(args);
    const result = await checkAtlasBoundary(options.rootPath, {
      profile: options.profile,
      policyPath: options.policyPath,
      includeGenerated: options.includeGenerated,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printBoundaryCheckMarkdown(result);
    }

    process.exitCode = result.status === 'failed' ? 1 : 0;
    break;
  }
  case 'usage-note': {
    const options = parseUsageNoteArgs(args);
    if (!options.task) {
      usageNoteUsage();
      process.exitCode = 1;
      break;
    }

    const result = await writeUsageNote({
      rootPath: options.rootPath,
      task: options.task,
      command: options.command,
      profile: options.profile,
      selectedEntities: options.selectedEntities,
      selectedFiles: options.selectedFiles,
      selectedTests: options.selectedTests,
      broadSearchFallback: options.broadSearchFallback,
      missingCards: options.missingCards,
      misleadingCards: options.misleadingCards,
      outcome: options.outcome,
      outputPath: options.outputPath,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printUsageNoteMarkdown(result);
    }
    break;
  }
  case 'evaluate': {
    const options = parseEvaluateArgs(args);
    const result = await evaluateUsageEvidence(options.rootPath, {
      profile: options.profile,
      receiptsPath: options.receiptsPath,
      budget: options.budget,
      evaluationVersion: options.evaluationVersion,
    });

    if (options.outputPath) {
      const outputPath = path.resolve(options.rootPath, options.outputPath);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printUsageEvidenceMarkdown(result);
    }
    break;
  }
  case 'mcp': {
    if (args[0] !== 'smoke-test') {
      mcpUsage();
      process.exitCode = 1;
      break;
    }

    const options = parseMcpSmokeTestArgs(args);
    const result = await runAtlasMcpSmokeTest({
      atlasRoot: options.rootPath,
      profile: options.profile,
      pathToResolve: options.pathToResolve,
      task: options.task,
      budget: options.budget,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printMcpSmokeTestMarkdown(result);
    }
    process.exitCode = result.status === 'passed' ? 0 : 1;
    break;
  }
  case 'ui': {
    if (args.includes('--help') || args.includes('-h')) {
      uiUsage();
      break;
    }

    const options = parseUiArgs(args);
    const handle = await startAtlasUiServer({
      rootPath: options.rootPath,
      profile: options.profile,
      host: options.host,
      port: options.port,
    });

    console.log(`# Atlas UI

Status: running
Profile: \`${options.profile}\`
Root: \`${path.resolve(options.rootPath)}\`
URL: ${handle.url}

Press Ctrl+C to stop.`);
    break;
  }
  case 'global': {
    const globalSubcommand = args[0];
    if (globalSubcommand === 'generate') {
      if (args[1] !== 'markdown') {
        globalUsage();
        process.exitCode = 1;
        break;
      }

      const options = parseGlobalGenerateMarkdownArgs(args);
      const graph = await loadGlobalAtlasGraph(options.rootPath, {
        profile: options.profile,
      });
      const files = generateMarkdownViews(graph, { profile: options.profile });
      const absoluteOutputPath = path.resolve(
        options.rootPath,
        options.outputPath,
      );

      if (options.check) {
        const result = await checkGeneratedMarkdownOutput(
          absoluteOutputPath,
          options.profile,
          files,
        );
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printGenerateCheckMarkdown(result);
        }
        process.exitCode =
          result.staleFiles.length > 0 ||
          result.missingFiles.length > 0 ||
          result.extraFiles.length > 0
            ? 1
            : 0;
        break;
      }

      await cleanGeneratedMarkdownOutput(absoluteOutputPath);
      for (const file of files) {
        const absoluteFilePath = path.join(absoluteOutputPath, file.path);
        await mkdir(path.dirname(absoluteFilePath), { recursive: true });
        await writeFile(absoluteFilePath, file.content, 'utf8');
      }

      const result = {
        status: 'generated',
        profile: options.profile,
        outputPath: absoluteOutputPath,
        files: files.map((file) => file.path),
      };
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printGenerateMarkdownResult(result);
      }
      break;
    }

    if (globalSubcommand === 'context-pack') {
      const options = parseGlobalContextPackArgs(args);
      if (!options.task) {
        contextPackUsage();
        process.exitCode = 1;
        break;
      }

      const graph = await loadGlobalAtlasGraph(options.rootPath, {
        profile: options.profile,
      });
      const pack = createContextPack(graph, {
        task: options.task,
        budget: options.budget,
        profile: options.profile,
        deterministic: options.deterministic,
      });

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              ...pack,
              registry: graph.registry,
              diagnostics: graph.diagnostics,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(renderContextPackMarkdown(pack));
      }
      break;
    }

    const options = parseGlobalArgs(args);
    if (
      !options.subcommand ||
      !['validate', 'list', 'manifest'].includes(options.subcommand)
    ) {
      globalUsage();
      process.exitCode = 1;
      break;
    }

    const graph = await loadGlobalAtlasGraph(options.rootPath, {
      profile: options.profile,
    });
    const errors = graph.diagnostics.filter(
      (diagnostic) => diagnostic.level === 'error',
    );

    if (options.json) {
      const jsonResult =
        options.subcommand === 'manifest'
          ? createGlobalRegistryManifest(graph)
          : {
              registry: graph.registry,
              entityCount: graph.entities.length,
              relationCount: graph.edges.filter(
                (edge) => edge.provenance === 'explicit',
              ).length,
              diagnostics: graph.diagnostics,
              entities:
                options.subcommand === 'list' ? graph.entities : undefined,
            };
      console.log(JSON.stringify(jsonResult, null, 2));
    } else if (options.subcommand === 'list') {
      printGlobalListMarkdown(graph);
    } else if (options.subcommand === 'manifest') {
      printGlobalManifestMarkdown(createGlobalRegistryManifest(graph));
    } else {
      printGlobalRegistryMarkdown(graph);
    }

    process.exitCode = errors.length > 0 ? 1 : 0;
    break;
  }
  default:
    console.error(`Atlas CLI command not implemented yet: ${command}`);
    printHelp();
    process.exitCode = 1;
}
}

await main().catch((error: unknown) => {
  if (error instanceof CliUsageError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  throw error;
});
