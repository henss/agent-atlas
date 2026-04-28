import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

import type { AtlasDiagnostic } from './diagnostics.js';
import { hasErrors } from './diagnostics.js';
import type { AtlasProfile } from './profile.js';

export interface BoundaryPolicy {
  version: 1;
  public_markers: string[];
  company_markers: string[];
  secret_markers: string[];
  customer_markers: string[];
  allow_patterns: string[];
}

export interface BoundaryCheckOptions {
  profile?: AtlasProfile;
  policyPath?: string;
  includeGenerated?: boolean;
}

export interface BoundaryCheckResult {
  rootPath: string;
  profile: AtlasProfile;
  policyPath?: string;
  checkedFiles: number;
  diagnostics: AtlasDiagnostic[];
  status: 'passed' | 'failed';
}

interface BoundaryFile {
  path: string;
  kind: 'atlas' | 'generated';
}

interface BoundaryRule {
  code: string;
  message: string;
  hint: string;
  pattern: RegExp;
}

const PUBLIC_RULES: BoundaryRule[] = [
  {
    code: 'BOUNDARY_PUBLIC_PRIVATE_URI',
    message: 'Public boundary contains a private URI scheme.',
    hint: 'Move concrete private references into a private or company overlay.',
    pattern: /\b(?:notion|confluence|jira|gdrive|google-drive|gcal|slack|mailto):[^\s`"')]+/i,
  },
  {
    code: 'BOUNDARY_PUBLIC_INTERNAL_URL',
    message: 'Public boundary contains an internal URL or host.',
    hint: 'Use a public alias or move the internal URL into a private/company overlay.',
    pattern:
      /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|[^/\s`"')]+\.(?:internal|local|corp))\b/i,
  },
  {
    code: 'BOUNDARY_PUBLIC_ISSUE_KEY',
    message: 'Public boundary contains an issue-key-shaped identifier.',
    hint: 'Use a sanitized task alias in public metadata and keep real tracker keys private.',
    pattern: /\b[A-Z][A-Z0-9]{1,9}-\d+\b/,
  },
  {
    code: 'BOUNDARY_PUBLIC_LOCAL_USER_PATH',
    message: 'Public boundary contains a local user path.',
    hint: 'Use repo-relative paths in public metadata.',
    pattern: /\b(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/|file:\/\/)/,
  },
  {
    code: 'BOUNDARY_PUBLIC_PRIVATE_PATH',
    message: 'Public boundary contains a private path marker.',
    hint: 'Move private paths into a private/company overlay.',
    pattern: /(?:^|[\\/])(?:private|private\.local|internal|restricted)(?:[\\/]|$)/i,
  },
];

const SENSITIVE_RULES: BoundaryRule[] = [
  {
    code: 'BOUNDARY_SECRET_VALUE',
    message: 'Boundary contains a secret or credential-shaped value.',
    hint: 'Remove copied secrets and reference a secret-scope entity instead.',
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|credential|secret)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}/i,
  },
  {
    code: 'BOUNDARY_PRIVATE_KEY',
    message: 'Boundary contains private-key material.',
    hint: 'Remove key material and reference the owning secret-scope entity.',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    code: 'BOUNDARY_LIVE_CUSTOMER_EMAIL',
    message: 'Boundary contains an email address that may identify live customer data.',
    hint: 'Use sanitized customer aliases or keep live customer context in the owning private system.',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
];

export async function checkAtlasBoundary(
  rootPath: string,
  options: BoundaryCheckOptions = {},
): Promise<BoundaryCheckResult> {
  const absoluteRoot = path.resolve(rootPath);
  const profile = options.profile ?? 'public';
  const policy = await loadBoundaryPolicy(absoluteRoot, options.policyPath);
  const files = await collectBoundaryFiles(absoluteRoot, {
    profile,
    includeGenerated: options.includeGenerated ?? true,
  });
  const diagnostics: AtlasDiagnostic[] = [];

  for (const file of files) {
    const content = await readFile(file.path, 'utf8');
    checkContent(content, file, profile, policy, diagnostics);
  }

  return {
    rootPath: absoluteRoot,
    profile,
    policyPath: policy.path,
    checkedFiles: files.length,
    diagnostics,
    status: hasErrors(diagnostics) ? 'failed' : 'passed',
  };
}

async function loadBoundaryPolicy(
  rootPath: string,
  explicitPolicyPath: string | undefined,
): Promise<BoundaryPolicy & { path?: string }> {
  const candidates = explicitPolicyPath
    ? [path.resolve(rootPath, explicitPolicyPath)]
    : [
        path.join(rootPath, 'agent-atlas.boundary.yaml'),
        path.join(rootPath, '.agent-atlas', 'boundary-policy.yaml'),
      ];

  for (const candidate of candidates) {
    if (!(await fileExists(candidate))) {
      continue;
    }

    const parsed = parse(await readFile(candidate, 'utf8')) as unknown;
    return { ...normalizeBoundaryPolicy(parsed), path: candidate };
  }

  return {
    version: 1,
    public_markers: [],
    company_markers: [],
    secret_markers: [],
    customer_markers: [],
    allow_patterns: [],
  };
}

function normalizeBoundaryPolicy(value: unknown): BoundaryPolicy {
  if (!isRecord(value)) {
    return emptyPolicy();
  }

  return {
    version: 1,
    public_markers: readStringList(value.public_markers ?? value.private_markers),
    company_markers: readStringList(value.company_markers),
    secret_markers: readStringList(value.secret_markers),
    customer_markers: readStringList(value.customer_markers),
    allow_patterns: readStringList(value.allow_patterns),
  };
}

function emptyPolicy(): BoundaryPolicy {
  return {
    version: 1,
    public_markers: [],
    company_markers: [],
    secret_markers: [],
    customer_markers: [],
    allow_patterns: [],
  };
}

async function collectBoundaryFiles(
  rootPath: string,
  options: { profile: AtlasProfile; includeGenerated: boolean },
): Promise<BoundaryFile[]> {
  const files: BoundaryFile[] = [];
  const atlasRoot = path.join(rootPath, '.agent-atlas');
  const generatedRoot = path.join(rootPath, 'docs', 'agents');

  await collectFiles(path.join(atlasRoot, 'public'), files, 'atlas', isYamlFile);

  if (options.profile === 'private') {
    await collectFiles(
      path.join(atlasRoot, 'overlays', 'private'),
      files,
      'atlas',
      isYamlFile,
    );
    await collectFiles(
      path.join(atlasRoot, 'overlays', 'private.local'),
      files,
      'atlas',
      isYamlFile,
    );
  }

  if (options.profile === 'company') {
    await collectFiles(
      path.join(atlasRoot, 'overlays', 'company'),
      files,
      'atlas',
      isYamlFile,
    );
  }

  if (options.includeGenerated) {
    await collectFiles(generatedRoot, files, 'generated', (fileName) =>
      fileName.endsWith('.md'),
    );
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function collectFiles(
  directory: string,
  files: BoundaryFile[],
  kind: BoundaryFile['kind'],
  predicate: (fileName: string) => boolean,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(entryPath, files, kind, predicate);
      continue;
    }

    if (entry.isFile() && predicate(entry.name)) {
      files.push({ path: entryPath, kind });
    }
  }
}

function checkContent(
  content: string,
  file: BoundaryFile,
  profile: AtlasProfile,
  policy: BoundaryPolicy,
  diagnostics: AtlasDiagnostic[],
): void {
  const allowedContent = removeAllowedMarkers(content, policy.allow_patterns);
  const rules =
    profile === 'public'
      ? [...PUBLIC_RULES, ...markerRules('BOUNDARY_PUBLIC_MARKER', policy.public_markers)]
      : [
          ...SENSITIVE_RULES,
          ...markerRules('BOUNDARY_SECRET_MARKER', policy.secret_markers),
          ...markerRules('BOUNDARY_CUSTOMER_MARKER', policy.customer_markers),
          ...(profile === 'company'
            ? markerRules('BOUNDARY_COMPANY_MARKER', policy.company_markers)
            : []),
        ];

  for (const rule of rules) {
    const match = allowedContent.match(rule.pattern);
    if (!match) {
      continue;
    }

    diagnostics.push({
      level: 'error',
      code: file.kind === 'generated' ? `${rule.code}_GENERATED` : rule.code,
      message: `${rule.message} Matched ${formatMatch(match[0])}.`,
      hint:
        file.kind === 'generated'
          ? `${rule.hint} Regenerate docs after fixing the source atlas metadata.`
          : rule.hint,
      path: file.path,
    });
  }
}

function markerRules(code: string, markers: string[]): BoundaryRule[] {
  return markers.map((marker) => ({
    code,
    message: `Boundary contains configured marker ${marker}.`,
    hint: 'Remove the marker from this profile or add a narrower allow_patterns entry if it is intentionally safe.',
    pattern: new RegExp(escapeRegExp(marker), 'i'),
  }));
}

function removeAllowedMarkers(content: string, allowPatterns: string[]): string {
  let nextContent = content;
  for (const allowed of allowPatterns) {
    nextContent = nextContent.replace(new RegExp(escapeRegExp(allowed), 'gi'), '');
  }
  return nextContent;
}

function formatMatch(value: string): string {
  return `\`${value.length > 80 ? `${value.slice(0, 77)}...` : value}\``;
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string'))].sort()
    : [];
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isYamlFile(fileName: string): boolean {
  return fileName.endsWith('.yaml') || fileName.endsWith('.yml');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
