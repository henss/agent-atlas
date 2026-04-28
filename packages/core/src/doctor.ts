import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AtlasProfile } from './profile.js';
import { loadAtlasDocuments } from './loader.js';

export type AtlasDoctorCheckStatus = 'passed' | 'warning' | 'failed';

export interface AtlasDoctorCheck {
  name: string;
  status: AtlasDoctorCheckStatus;
  message: string;
  hint?: string;
}

export interface AtlasDoctorResult {
  status: AtlasDoctorCheckStatus;
  rootPath: string;
  profile: AtlasProfile;
  schemaVersion: 1;
  registryVersion: 1;
  commands: string[];
  packageVersions: Record<string, string>;
  checks: AtlasDoctorCheck[];
}

export async function doctorAtlas(
  rootPath: string,
  options: { profile?: AtlasProfile } = {},
): Promise<AtlasDoctorResult> {
  const absoluteRoot = path.resolve(rootPath);
  const profile = options.profile ?? 'public';
  const repositoryRoot = resolveRepositoryRoot();
  const packageVersions = await readPackageVersions(repositoryRoot);
  const checks: AtlasDoctorCheck[] = [];

  checks.push(await checkDirectory('target root', absoluteRoot));
  checks.push(await checkAtlasInput(absoluteRoot));
  checks.push(...(await checkBuildOutputs(repositoryRoot)));
  checks.push(await checkMcpAvailability(repositoryRoot));
  checks.push(await checkPackageWorkspace(repositoryRoot));

  const status = checks.some((check) => check.status === 'failed')
    ? 'failed'
    : checks.some((check) => check.status === 'warning')
      ? 'warning'
      : 'passed';

  return {
    status,
    rootPath: absoluteRoot,
    profile,
    schemaVersion: 1,
    registryVersion: 1,
    commands: [
      'validate',
      'show',
      'neighbors',
      'resolve-path',
      'context-pack',
      'generate markdown',
      'generate markdown --check',
      'suggest-card',
      'diff',
      'migrate',
      'benchmark',
      'doctor',
      'boundary-check',
      'usage-note',
      'evaluate',
      'global validate',
      'global list',
      'global context-pack',
      'global manifest',
      'global generate markdown',
    ],
    packageVersions,
    checks,
  };
}

function resolveRepositoryRoot(): string {
  const modulePath = fileURLToPath(import.meta.url);
  const packageRoot = path.resolve(path.dirname(modulePath), '..');
  return path.resolve(packageRoot, '..', '..');
}

async function checkDirectory(
  name: string,
  directory: string,
): Promise<AtlasDoctorCheck> {
  try {
    await access(directory);
    return {
      name,
      status: 'passed',
      message: `Found ${directory}.`,
    };
  } catch {
    return {
      name,
      status: 'failed',
      message: `Could not access ${directory}.`,
      hint: 'Pass the target repository or registry root with --path <root>.',
    };
  }
}

async function checkAtlasInput(rootPath: string): Promise<AtlasDoctorCheck> {
  if (await fileExists(path.join(rootPath, 'agent-atlas.registry.yaml'))) {
    return {
      name: 'atlas input',
      status: 'passed',
      message: 'Found agent-atlas.registry.yaml.',
    };
  }

  const documents = await loadAtlasDocuments(rootPath);
  if (documents.length > 0) {
    return {
      name: 'atlas input',
      status: 'passed',
      message: `Found ${documents.length} atlas YAML files.`,
    };
  }

  return {
    name: 'atlas input',
    status: 'warning',
    message: 'No .agent-atlas YAML files or registry config were found.',
    hint: 'Run doctor from a target repo, or pass --path <repo>. Downstream scripts should not rely on the Agent Atlas checkout as the implicit root.',
  };
}

async function checkBuildOutputs(
  repositoryRoot: string,
): Promise<AtlasDoctorCheck[]> {
  const outputs = [
    ['CLI build', path.join(repositoryRoot, 'packages', 'cli', 'dist', 'index.js')],
    [
      'MCP build',
      path.join(repositoryRoot, 'packages', 'mcp-server', 'dist', 'stdio.js'),
    ],
  ] as const;

  return Promise.all(
    outputs.map(async ([name, filePath]) => {
      if (await fileExists(filePath)) {
        return {
          name,
          status: 'passed' as const,
          message: `Found ${filePath}.`,
        };
      }

      return {
        name,
        status: 'failed' as const,
        message: `Missing ${filePath}.`,
        hint: 'Run pnpm -r build in the Agent Atlas checkout.',
      };
    }),
  );
}

async function checkMcpAvailability(
  repositoryRoot: string,
): Promise<AtlasDoctorCheck> {
  const packageJsonPath = path.join(
    repositoryRoot,
    'packages',
    'mcp-server',
    'package.json',
  );
  const packageJson = await readJsonFile(packageJsonPath);
  const dependencies = isRecord(packageJson.dependencies)
    ? packageJson.dependencies
    : {};

  if (typeof dependencies['@modelcontextprotocol/sdk'] === 'string') {
    return {
      name: 'MCP availability',
      status: 'passed',
      message: 'MCP server package declares @modelcontextprotocol/sdk.',
    };
  }

  return {
    name: 'MCP availability',
    status: 'failed',
    message: 'MCP server package is missing @modelcontextprotocol/sdk.',
    hint: 'Run pnpm install in the Agent Atlas checkout.',
  };
}

async function checkPackageWorkspace(
  repositoryRoot: string,
): Promise<AtlasDoctorCheck> {
  if (await fileExists(path.join(repositoryRoot, 'pnpm-workspace.yaml'))) {
    return {
      name: 'workspace packages',
      status: 'passed',
      message: 'Found pnpm-workspace.yaml.',
    };
  }

  return {
    name: 'workspace packages',
    status: 'warning',
    message: 'Could not find pnpm-workspace.yaml.',
    hint: 'Use a full sibling checkout of Agent Atlas, not a copied package directory.',
  };
}

async function readPackageVersions(
  repositoryRoot: string,
): Promise<Record<string, string>> {
  const packagePaths = [
    'package.json',
    'packages/schema/package.json',
    'packages/core/package.json',
    'packages/cli/package.json',
    'packages/markdown/package.json',
    'packages/mcp-server/package.json',
    'packages/adapters/package.json',
  ];
  const versions: Record<string, string> = {};

  for (const packagePath of packagePaths) {
    const packageJson = await readJsonFile(path.join(repositoryRoot, packagePath));
    if (
      typeof packageJson.name === 'string' &&
      typeof packageJson.version === 'string'
    ) {
      versions[packageJson.name] = packageJson.version;
    }
  }

  return versions;
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
