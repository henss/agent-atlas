import { execFile } from 'node:child_process';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse, stringify } from 'yaml';

import type { AtlasEntity } from '@agent-atlas/schema';
import { analyzeAtlasMaintenance } from './authoring.js';
import type { AtlasDiagnostic } from './diagnostics.js';
import { loadAtlasGraph } from './graph.js';
import { loadAtlasDocuments } from './loader.js';
import type { AtlasProfile } from './profile.js';
import { resolvePathInGraph } from './path-resolution.js';
import { suggestAtlasCard } from './authoring.js';

const execFileAsync = promisify(execFile);

export type AtlasMaintenanceMode =
  | 'review-only'
  | 'generated-docs-only'
  | 'agent-maintained';

export interface AtlasMaintenancePolicy {
  version: 1;
  mode: AtlasMaintenanceMode;
  profile: AtlasProfile;
  generated_docs: {
    output: string;
    auto_regenerate: boolean;
  };
  generated_readme?: {
    path: string;
    auto_regenerate: boolean;
  };
  metadata: {
    auto_apply: boolean;
    allow_add: boolean;
    allow_update: boolean;
    allow_archive: boolean;
    allow_delete: boolean;
  };
  safety: {
    require_validate: boolean;
    require_boundary_check: boolean;
    block_secret_like_values: boolean;
    block_profile_leaks: boolean;
  };
  sourcePath?: string;
}

export interface AtlasMaintenanceMetadataFixResult {
  rootPath: string;
  policy: AtlasMaintenancePolicy;
  appliedFiles: string[];
  skippedFiles: Array<{
    path: string;
    reason: string;
  }>;
  diagnostics: AtlasDiagnostic[];
  status: 'passed' | 'failed';
}

export function defaultAtlasMaintenancePolicy(): AtlasMaintenancePolicy {
  return {
    version: 1,
    mode: 'review-only',
    profile: 'public',
    generated_docs: {
      output: 'docs/agents',
      auto_regenerate: false,
    },
    metadata: {
      auto_apply: false,
      allow_add: false,
      allow_update: false,
      allow_archive: false,
      allow_delete: false,
    },
    safety: {
      require_validate: true,
      require_boundary_check: true,
      block_secret_like_values: true,
      block_profile_leaks: true,
    },
  };
}

export async function loadAtlasMaintenancePolicy(
  rootPath: string,
  explicitPolicyPath?: string,
): Promise<AtlasMaintenancePolicy> {
  const absoluteRoot = path.resolve(rootPath);
  const candidates = explicitPolicyPath
    ? [path.resolve(absoluteRoot, explicitPolicyPath)]
    : [
        path.join(absoluteRoot, 'agent-atlas.maintenance.yaml'),
        path.join(absoluteRoot, '.agent-atlas', 'maintenance.yaml'),
      ];

  for (const candidate of candidates) {
    if (!(await fileExists(candidate))) {
      continue;
    }
    const parsed = parse(await readFile(candidate, 'utf8')) as unknown;
    return normalizeMaintenancePolicy(parsed, candidate);
  }

  return defaultAtlasMaintenancePolicy();
}

export async function applyAtlasMaintenanceMetadataFixes(
  rootPath: string,
  policy: AtlasMaintenancePolicy,
): Promise<AtlasMaintenanceMetadataFixResult> {
  const absoluteRoot = path.resolve(rootPath);
  const appliedFiles: string[] = [];
  const skippedFiles: AtlasMaintenanceMetadataFixResult['skippedFiles'] = [];
  const diagnostics: AtlasDiagnostic[] = [];

  if (
    policy.mode !== 'agent-maintained' ||
    !policy.metadata.auto_apply ||
    !policy.metadata.allow_add
  ) {
    return {
      rootPath: absoluteRoot,
      policy,
      appliedFiles,
      skippedFiles: [
        {
          path: '.',
          reason: 'Policy does not allow autonomous atlas metadata additions.',
        },
      ],
      diagnostics,
      status: 'passed',
    };
  }

  const graph = await loadAtlasGraph(absoluteRoot, { profile: policy.profile });
  diagnostics.push(...graph.diagnostics);
  const changedFiles = await readChangedRepoFiles(absoluteRoot);

  if (policy.metadata.allow_update) {
    appliedFiles.push(...(await repairStaleCodeReferences(absoluteRoot, policy)));
  }

  for (const filePath of changedFiles) {
    if (!isSourceCandidate(filePath, policy.generated_docs.output)) {
      continue;
    }
    const resolution = resolvePathInGraph(graph, filePath);
    if (resolution.owners.length > 0) {
      skippedFiles.push({ path: filePath, reason: 'Already covered by an atlas component.' });
      continue;
    }

    const suggestion = await suggestAtlasCard(absoluteRoot, filePath);
    if (!['component', 'test-scope'].includes(suggestion.kind)) {
      skippedFiles.push({ path: filePath, reason: 'No supported autonomous card kind.' });
      continue;
    }

    const outputPath = path.join(
      absoluteRoot,
      '.agent-atlas',
      policy.profile,
      suggestion.kind === 'test-scope' ? 'tests' : 'components',
      `${entitySlug(suggestion.entityId)}.yaml`,
    );
    if (await fileExists(outputPath)) {
      skippedFiles.push({ path: filePath, reason: 'Suggested atlas card already exists.' });
      continue;
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, suggestion.yaml, 'utf8');
    appliedFiles.push(normalizePath(path.relative(absoluteRoot, outputPath)));
  }

  const refreshedGraph = await loadAtlasGraph(absoluteRoot, { profile: policy.profile });
  const maintenance = await analyzeAtlasMaintenance(refreshedGraph);
  diagnostics.push(...refreshedGraph.diagnostics, ...maintenance.diagnostics);

  return {
    rootPath: absoluteRoot,
    policy,
    appliedFiles,
    skippedFiles,
    diagnostics,
    status: diagnostics.some((diagnostic) => diagnostic.level === 'error')
      ? 'failed'
      : 'passed',
  };
}

async function repairStaleCodeReferences(
  rootPath: string,
  policy: AtlasMaintenancePolicy,
): Promise<string[]> {
  const appliedFiles: string[] = [];
  const documents = await loadAtlasDocuments(rootPath);
  for (const document of documents) {
    const relativePath = normalizePath(path.relative(rootPath, document.path));
    if (!isPolicyWritableAtlasPath(relativePath, policy)) {
      continue;
    }
    if (!isRecord(document.data) || !isAtlasEntityLike(document.data)) {
      continue;
    }

    const entity = document.data as unknown as AtlasEntity;
    const code = isRecord(entity.code) ? entity.code : undefined;
    if (!code) {
      continue;
    }

    const entrypoints = readStringArray(code.entrypoints);
    const codePaths = readStringArray(code.paths);
    const nextEntrypoints: string[] = [];
    const nextCodePaths: string[] = [];

    for (const entrypoint of entrypoints) {
      if (await fileExists(path.resolve(rootPath, entrypoint))) {
        nextEntrypoints.push(entrypoint);
      }
    }

    for (const codePath of codePaths) {
      if (await patternMatchesAnyPath(rootPath, codePath)) {
        nextCodePaths.push(codePath);
      }
    }

    if (
      nextEntrypoints.length === entrypoints.length &&
      nextCodePaths.length === codePaths.length
    ) {
      continue;
    }

    entity.code = {
      ...code,
      ...(entrypoints.length > 0 ? { entrypoints: nextEntrypoints } : {}),
      ...(codePaths.length > 0 ? { paths: nextCodePaths } : {}),
    };
    await writeFile(document.path, stringify(entity), 'utf8');
    appliedFiles.push(relativePath);
  }
  return appliedFiles.sort();
}

function normalizeMaintenancePolicy(
  value: unknown,
  sourcePath: string,
): AtlasMaintenancePolicy {
  const defaults = defaultAtlasMaintenancePolicy();
  if (!isRecord(value)) {
    return { ...defaults, sourcePath };
  }

  const mode = readMode(value.mode, defaults.mode);
  const profile = readProfile(value.profile, defaults.profile);
  const generatedDocs = isRecord(value.generated_docs) ? value.generated_docs : {};
  const generatedReadme = isRecord(value.generated_readme) ? value.generated_readme : undefined;
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const safety = isRecord(value.safety) ? value.safety : {};

  return {
    version: 1,
    mode,
    profile,
    generated_docs: {
      output: readString(generatedDocs.output, defaults.generated_docs.output),
      auto_regenerate: readBoolean(
        generatedDocs.auto_regenerate,
        mode !== 'review-only',
      ),
    },
    generated_readme: generatedReadme
      ? {
          path: readString(generatedReadme.path, 'README.md'),
          auto_regenerate: readBoolean(generatedReadme.auto_regenerate, mode !== 'review-only'),
        }
      : undefined,
    metadata: {
      auto_apply: readBoolean(metadata.auto_apply, mode === 'agent-maintained'),
      allow_add: readBoolean(metadata.allow_add, mode === 'agent-maintained'),
      allow_update: readBoolean(metadata.allow_update, mode === 'agent-maintained'),
      allow_archive: readBoolean(metadata.allow_archive, mode === 'agent-maintained'),
      allow_delete: readBoolean(metadata.allow_delete, false),
    },
    safety: {
      require_validate: readBoolean(safety.require_validate, true),
      require_boundary_check: readBoolean(safety.require_boundary_check, true),
      block_secret_like_values: readBoolean(safety.block_secret_like_values, true),
      block_profile_leaks: readBoolean(safety.block_profile_leaks, true),
    },
    sourcePath,
  };
}

async function readChangedRepoFiles(rootPath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['status', '--short', '--untracked-files=all'],
      { cwd: rootPath },
    );
    return stdout
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => line.slice(3).replace(/^"|"$/g, ''))
      .map((line) => line.split(' -> ').at(-1) ?? line)
      .map(normalizePath)
      .sort();
  } catch {
    return [];
  }
}

function isSourceCandidate(filePath: string, generatedDocsOutput: string): boolean {
  const normalized = normalizePath(filePath);
  if (
    normalized.startsWith('.agent-atlas/') ||
    normalized.startsWith(`${normalizePath(generatedDocsOutput)}/`) ||
    normalized.startsWith('.git/') ||
    normalized.startsWith('node_modules/') ||
    normalized.startsWith('.runtime/')
  ) {
    return false;
  }
  return /\.[cm]?[jt]sx?$|\.py$|\.go$|\.rs$|\.java$|\.kt$|\.rb$|\.php$/.test(
    normalized,
  );
}

function isPolicyWritableAtlasPath(
  filePath: string,
  policy: AtlasMaintenancePolicy,
): boolean {
  if (!filePath.endsWith('.yaml') && !filePath.endsWith('.yml')) {
    return false;
  }
  if (policy.profile === 'public') {
    return filePath.startsWith('.agent-atlas/public/');
  }
  return (
    filePath.startsWith(`.agent-atlas/${policy.profile}/`) ||
    filePath.startsWith(`.agent-atlas/overlays/${policy.profile}/`)
  );
}

async function patternMatchesAnyPath(rootPath: string, pattern: string): Promise<boolean> {
  const normalizedPattern = normalizePath(pattern);
  const regex = globToRegex(normalizedPattern);
  for (const filePath of await collectRepoFiles(rootPath)) {
    if (regex.test(filePath)) {
      return true;
    }
  }
  return false;
}

async function collectRepoFiles(rootPath: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(normalizePath(path.relative(rootPath, entryPath)));
      }
    }
  }

  await walk(rootPath);
  return files.sort();
}

function globToRegex(pattern: string): RegExp {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === '*' && next === '*') {
      source += '.*';
      index += 1;
      continue;
    }
    if (char === '*') {
      source += '[^/]*';
      continue;
    }
    source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`${source}$`);
}

function entitySlug(entityId: string): string {
  return entityId.split(':')[1] ?? entityId;
}

function readMode(value: unknown, fallback: AtlasMaintenanceMode): AtlasMaintenanceMode {
  return value === 'review-only' ||
    value === 'generated-docs-only' ||
    value === 'agent-maintained'
    ? value
    : fallback;
}

function readProfile(value: unknown, fallback: AtlasProfile): AtlasProfile {
  return value === 'public' || value === 'private' || value === 'company'
    ? value
    : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAtlasEntityLike(value: Record<string, unknown>): boolean {
  return typeof value.id === 'string' && typeof value.kind === 'string';
}
