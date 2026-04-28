#!/usr/bin/env node

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createContextPack,
  findNeighbors,
  loadAtlasGraph,
  renderContextPackMarkdown,
  resolvePathInGraph,
  validateAtlas,
} from '@agent-atlas/core';
import { generateMarkdownViews } from '@agent-atlas/markdown';
import type { MarkdownProfile } from '@agent-atlas/markdown';
import type {
  AtlasDiagnostic,
  AtlasGraph,
  AtlasGraphEdge,
  AtlasValidationResult,
  ContextPackRequest,
  PathContextMatch,
  PathOwnerMatch,
  PathResolutionResult,
  NeighborResult,
} from '@agent-atlas/core';
import type { AtlasEntity, AtlasEntityId, AtlasRelationType } from '@agent-atlas/schema';
import { ATLAS_RELATION_TYPES } from '@agent-atlas/schema';

const [, , command, ...args] = process.argv;

function printHelp(): void {
  console.log(`# Agent Atlas CLI

Status: seed implementation

Planned commands:

- atlas init
- atlas validate [path]
- atlas list [kind]
- atlas show <entity-id>
- atlas neighbors <entity-id> --depth 2
- atlas resolve-path <path>
- atlas context-pack "<task>" --budget 4000
- atlas generate markdown

Current command: ${command ?? '(none)'}
Args: ${args.join(' ')}
`);
}

function parseValidateArgs(args: string[]): { rootPath: string; json: boolean } {
  let rootPath = process.cwd();
  let json = false;

  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }

    rootPath = arg;
  }

  return { rootPath, json };
}

interface ShowArgs {
  entityId?: AtlasEntityId;
  rootPath: string;
  json: boolean;
}

interface NeighborArgs extends ShowArgs {
  depth: number;
  relationTypes?: AtlasRelationType[];
}

interface ResolvePathArgs {
  filePath?: string;
  rootPath: string;
  json: boolean;
  depth: number;
}

interface GenerateMarkdownArgs {
  rootPath: string;
  outputPath: string;
  profile: MarkdownProfile;
  json: boolean;
}

interface ContextPackArgs {
  task?: string;
  rootPath: string;
  budget: number;
  profile: ContextPackRequest['profile'];
  deterministic: boolean;
  json: boolean;
}

function parseShowArgs(args: string[]): ShowArgs {
  let entityId: AtlasEntityId | undefined;
  let rootPath = process.cwd();
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--path') {
      rootPath = args[index + 1] ?? rootPath;
      index += 1;
      continue;
    }

    if (!entityId) {
      entityId = arg as AtlasEntityId;
      continue;
    }

    rootPath = arg;
  }

  return { entityId, rootPath, json };
}

function parseNeighborArgs(args: string[]): NeighborArgs {
  const relationTypes: AtlasRelationType[] = [];
  let entityId: AtlasEntityId | undefined;
  let rootPath = process.cwd();
  let json = false;
  let depth = 1;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--path') {
      rootPath = args[index + 1] ?? rootPath;
      index += 1;
      continue;
    }

    if (arg === '--depth') {
      depth = parsePositiveInteger(args[index + 1], 1);
      index += 1;
      continue;
    }

    if (arg === '--relation' || arg === '--relations') {
      for (const type of parseRelationTypes(args[index + 1] ?? '')) {
        relationTypes.push(type);
      }
      index += 1;
      continue;
    }

    if (!entityId) {
      entityId = arg as AtlasEntityId;
      continue;
    }

    rootPath = arg;
  }

  return {
    entityId,
    rootPath,
    json,
    depth,
    relationTypes: relationTypes.length > 0 ? relationTypes : undefined,
  };
}

function parseResolvePathArgs(args: string[]): ResolvePathArgs {
  let filePath: string | undefined;
  let rootPath = process.cwd();
  let json = false;
  let depth = 3;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--path') {
      rootPath = args[index + 1] ?? rootPath;
      index += 1;
      continue;
    }

    if (arg === '--depth') {
      depth = parsePositiveInteger(args[index + 1], 3);
      index += 1;
      continue;
    }

    if (!filePath) {
      filePath = arg;
      continue;
    }

    rootPath = arg;
  }

  return { filePath, rootPath, json, depth };
}

function parseGenerateMarkdownArgs(args: string[]): GenerateMarkdownArgs {
  let rootPath = process.cwd();
  let outputPath = 'docs/agents';
  let profile: MarkdownProfile = 'public';
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === 'markdown') {
      continue;
    }

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--path') {
      rootPath = args[index + 1] ?? rootPath;
      index += 1;
      continue;
    }

    if (arg === '--output') {
      outputPath = args[index + 1] ?? outputPath;
      index += 1;
      continue;
    }

    if (arg === '--profile') {
      profile = parseMarkdownProfile(args[index + 1] ?? profile);
      index += 1;
      continue;
    }

    rootPath = arg;
  }

  return { rootPath, outputPath, profile, json };
}

function parseContextPackArgs(args: string[]): ContextPackArgs {
  let task: string | undefined;
  let rootPath = process.cwd();
  let budget = 4000;
  let profile: ContextPackRequest['profile'] = 'public';
  let deterministic = false;
  let json = false;

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
      rootPath = args[index + 1] ?? rootPath;
      index += 1;
      continue;
    }

    if (arg === '--budget') {
      budget = parsePositiveInteger(args[index + 1], budget);
      index += 1;
      continue;
    }

    if (arg === '--profile') {
      profile = parseContextPackProfile(args[index + 1] ?? profile);
      index += 1;
      continue;
    }

    if (!task) {
      task = arg;
      continue;
    }

    rootPath = arg;
  }

  return { task, rootPath, budget, profile, deterministic, json };
}

function printValidationMarkdown(result: AtlasValidationResult): void {
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.level === 'error');
  const warnings = result.diagnostics.filter((diagnostic) => diagnostic.level === 'warning');

  console.log(`# Atlas validation

Status: ${result.status}

Entities: ${result.entityCount}
Relations: ${result.relationCount}
Warnings: ${warnings.length}
Errors: ${errors.length}`);

  printDiagnosticSection('Errors', errors);
  printDiagnosticSection('Warnings', warnings);
}

function printDiagnosticSection(title: string, diagnostics: AtlasDiagnostic[]): void {
  if (diagnostics.length === 0) {
    return;
  }

  console.log(`\n## ${title}\n`);
  for (const diagnostic of diagnostics) {
    const subject = diagnostic.entityId ? `\`${diagnostic.entityId}\`` : '`atlas`';
    console.log(`- ${subject}: ${diagnostic.message} \`${diagnostic.code}\``);
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
  profile: MarkdownProfile;
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
  console.error('Usage: atlas show <entity-id> [path] [--path <path>] [--json]');
}

function neighborsUsage(): void {
  console.error(
    'Usage: atlas neighbors <entity-id> [path] [--depth N] [--relation type[,type]] [--json]',
  );
}

function resolvePathUsage(): void {
  console.error('Usage: atlas resolve-path <file-path> [atlas-root] [--path <root>] [--json]');
}

function generateMarkdownUsage(): void {
  console.error(
    'Usage: atlas generate markdown [path] [--path <root>] [--output docs/agents] [--profile public|private|company] [--json]',
  );
}

function contextPackUsage(): void {
  console.error(
    'Usage: atlas context-pack "<task>" [path] [--path <root>] [--budget tokens] [--profile public|private|company] [--deterministic] [--json]',
  );
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
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

function isAtlasRelationType(value: string): value is AtlasRelationType {
  return (ATLAS_RELATION_TYPES as readonly string[]).includes(value);
}

function parseMarkdownProfile(value: string): MarkdownProfile {
  return value === 'private' || value === 'company' ? value : 'public';
}

function parseContextPackProfile(value: string): ContextPackRequest['profile'] {
  return value === 'private' || value === 'company' ? value : 'public';
}

function formatProvenance(edge: AtlasGraphEdge): string {
  return edge.provenance === 'generated' ? '(generated)' : '(explicit)';
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
    await rm(path.join(outputPath, generatedPath), { recursive: true, force: true });
  }
}

switch (command) {
  case undefined:
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  case 'validate': {
    const options = parseValidateArgs(args);
    const result = await validateAtlas(options.rootPath);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printValidationMarkdown(result);
    }
    process.exitCode = result.status === 'failed' ? 1 : 0;
    break;
  }
  case 'show': {
    const options = parseShowArgs(args);
    if (!options.entityId) {
      showUsage();
      process.exitCode = 1;
      break;
    }

    const graph = await loadAtlasGraph(options.rootPath);
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

    const graph = await loadAtlasGraph(options.rootPath);
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
      printNeighborsMarkdown(options.entityId, options.depth, options.relationTypes, neighbors);
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

    const graph = await loadAtlasGraph(options.rootPath);
    const result = resolvePathInGraph(graph, options.filePath, { depth: options.depth });

    if (options.json) {
      console.log(JSON.stringify({ ...result, diagnostics: graph.diagnostics }, null, 2));
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
    const graph = await loadAtlasGraph(options.rootPath);
    const files = generateMarkdownViews(graph, { profile: options.profile });
    const absoluteOutputPath = path.resolve(options.rootPath, options.outputPath);

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

    const graph = await loadAtlasGraph(options.rootPath);
    const pack = createContextPack(graph, {
      task: options.task,
      budget: options.budget,
      profile: options.profile,
      deterministic: options.deterministic,
    });

    if (options.json) {
      console.log(JSON.stringify({ ...pack, diagnostics: graph.diagnostics }, null, 2));
    } else {
      console.log(renderContextPackMarkdown(pack));
    }
    break;
  }
  default:
    console.error(`Atlas CLI command not implemented yet: ${command}`);
    printHelp();
    process.exitCode = 1;
}
