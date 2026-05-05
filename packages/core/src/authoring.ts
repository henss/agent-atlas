import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { AtlasEntity } from '@agent-atlas/schema';
import type { AtlasDiagnostic } from './diagnostics.js';
import type { AtlasGraph } from './graph.js';

const execFileAsync = promisify(execFile);

export interface SuggestedAtlasCard {
  kind: 'component' | 'test-scope';
  path: string;
  entityId: string;
  yaml: string;
  notes: string[];
}

export interface AtlasMaintenanceReport {
  rootPath: string;
  changedAtlasFiles: string[];
  changedGeneratedFiles: string[];
  diagnostics: AtlasDiagnostic[];
  status: 'passed' | 'failed';
}

export async function suggestAtlasCard(
  rootPath: string,
  filePath: string,
): Promise<SuggestedAtlasCard> {
  const absoluteRoot = path.resolve(rootPath);
  const relativePath = normalizePath(
    path.isAbsolute(filePath)
      ? path.relative(absoluteRoot, filePath)
      : filePath,
  );
  const slug = slugFromPath(relativePath);
  const isTest = isTestPath(relativePath);
  const kind = isTest ? 'test-scope' : 'component';
  const entityId = `${kind}:${slug}`;

  if (kind === 'test-scope') {
    return {
      kind,
      path: relativePath,
      entityId,
      yaml: [
        `id: ${entityId}`,
        'kind: test-scope',
        `title: ${titleFromSlug(slug)} Tests`,
        `summary: Verifies behavior around ${relativePath}.`,
        'visibility: public',
        'commands:',
        '  - command: pnpm test',
        '    purpose: run the relevant test suite',
        '',
      ].join('\n'),
      notes: [
        'Draft only; review the command and scope before saving.',
        'Prefer a narrow verification command if the repo has one.',
      ],
    };
  }

  return {
    kind,
    path: relativePath,
    entityId,
    yaml: [
      `id: ${entityId}`,
      'kind: component',
      `title: ${titleFromSlug(slug)}`,
      `summary: Owns implementation around ${relativePath}.`,
      'visibility: public',
      'code:',
      '  paths:',
      `    - ${directoryGlob(relativePath)}`,
      '  entrypoints:',
      `    - ${relativePath}`,
      'relations: []',
      '',
    ].join('\n'),
    notes: [
      'Draft only; connect this component to its domain, workflow, docs, and tests before saving.',
      'Keep one-seam updates narrow instead of seeding unrelated repo areas.',
    ],
  };
}

export async function analyzeAtlasMaintenance(
  graph: AtlasGraph,
): Promise<AtlasMaintenanceReport> {
  const diagnostics: AtlasDiagnostic[] = [];
  diagnostics.push(...(await diagnoseEntityReferences(graph)));

  const gitStatus = await readGitStatus(graph.rootPath);
  const changedAtlasFiles = gitStatus
    .filter((filePath) => normalizePath(filePath).startsWith('.agent-atlas/'))
    .sort();
  const changedGeneratedFiles = gitStatus
    .filter((filePath) => normalizePath(filePath).startsWith('docs/agents/'))
    .sort();

  return {
    rootPath: graph.rootPath,
    changedAtlasFiles,
    changedGeneratedFiles,
    diagnostics,
    status: diagnostics.some((diagnostic) => diagnostic.level === 'error')
      ? 'failed'
      : 'passed',
  };
}

async function diagnoseEntityReferences(
  graph: AtlasGraph,
): Promise<AtlasDiagnostic[]> {
  const diagnostics: AtlasDiagnostic[] = [];
  const repoFiles = await collectRepoFiles(graph.rootPath);
  for (const entity of graph.entities) {
    diagnostics.push(...diagnoseCodeReferences(entity, repoFiles));
    diagnostics.push(...(await diagnoseCommandReferences(graph.rootPath, entity)));
  }
  return diagnostics;
}

function diagnoseCodeReferences(
  entity: AtlasEntity,
  repoFiles: string[],
): AtlasDiagnostic[] {
  const diagnostics: AtlasDiagnostic[] = [];
  for (const entrypoint of entity.code?.entrypoints ?? []) {
    if (!repoFiles.includes(normalizePath(entrypoint))) {
      diagnostics.push({
        level: 'error',
        code: 'STALE_ENTRYPOINT',
        message: `Entrypoint ${entrypoint} does not exist.`,
        hint: 'Update the entrypoint or remove the stale reference.',
        entityId: entity.id,
      });
    }
  }

  for (const codePath of entity.code?.paths ?? []) {
    if (!patternMatchesAnyPath(repoFiles, codePath)) {
      diagnostics.push({
        level: 'warning',
        code: 'STALE_CODE_PATH',
        message: `Code path ${codePath} matched no files.`,
        hint: 'Update the glob, add the missing files, or remove the stale reference.',
        entityId: entity.id,
      });
    }
  }
  return diagnostics;
}

async function diagnoseCommandReferences(
  rootPath: string,
  entity: AtlasEntity,
): Promise<AtlasDiagnostic[]> {
  const diagnostics: AtlasDiagnostic[] = [];
  for (const command of entity.commands ?? []) {
    const cwd = command.cwd ? path.resolve(rootPath, command.cwd) : rootPath;
    const referencedScripts = [
      ...command.command.matchAll(/\b(?:pnpm|npm|yarn) run ([a-zA-Z0-9:_-]+)/g),
      ...command.command.matchAll(/\byarn ([a-zA-Z0-9:_-]+)/g),
    ]
      .map((match) => match[1])
      .filter((script): script is string => Boolean(script) && !script.startsWith('-'));
    if (referencedScripts.length === 0) {
      continue;
    }

    const packageJsonPath = path.join(cwd, 'package.json');
    const packageJson = await readPackageJson(packageJsonPath);
    if (!packageJson) {
      diagnostics.push({
        level: 'warning',
        code: 'STALE_COMMAND_CWD',
        message: `Command cwd ${command.cwd ?? '.'} has no package.json for ${command.command}.`,
        hint: 'Update command.cwd or use a command that does not imply a package script.',
        entityId: entity.id,
      });
      continue;
    }

    for (const script of referencedScripts) {
      if (!packageJson.scripts.has(script)) {
        diagnostics.push({
          level: 'warning',
          code: 'STALE_PACKAGE_SCRIPT',
          message: `Command ${command.command} references missing package script ${script}.`,
          hint: 'Update the verification command or add the missing package script.',
          entityId: entity.id,
        });
      }
    }
  }
  return diagnostics;
}

async function readPackageJson(
  filePath: string,
): Promise<{ scripts: Set<string> } | undefined> {
  try {
    const content = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.scripts)) {
      return { scripts: new Set() };
    }
    return { scripts: new Set(Object.keys(parsed.scripts)) };
  } catch {
    return undefined;
  }
}

async function readGitStatus(rootPath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--short'], {
      cwd: rootPath,
    });
    return stdout
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => line.slice(3).replace(/^"|"$/g, ''));
  } catch {
    return [];
  }
}

function patternMatchesAnyPath(repoFiles: string[], pattern: string): boolean {
  const normalizedPattern = normalizePath(pattern);
  const regex = globToRegex(normalizedPattern);
  for (const filePath of repoFiles) {
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

function isTestPath(filePath: string): boolean {
  return /(^|[/.])(test|spec)\.[cm]?[jt]sx?$/.test(filePath) || filePath.includes('/tests/');
}

function directoryGlob(filePath: string): string {
  const directory = normalizePath(path.dirname(filePath));
  return directory === '.' ? filePath : `${directory}/**`;
}

function slugFromPath(filePath: string): string {
  return normalizePath(filePath)
    .replace(/\.[^.]+$/, '')
    .split('/')
    .filter((segment) => !['src', 'lib', 'packages', 'apps'].includes(segment))
    .join('-')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'example';
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((segment) => `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1)}`)
    .join(' ');
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
