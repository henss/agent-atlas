import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse } from 'yaml';

import type { AtlasEntity, AtlasEntityId, AtlasRelation, AtlasVisibility } from '@agent-atlas/schema';
import { loadGeneratedCliEntities, type AtlasCliCommandRecord, type GeneratedCliPolicy } from './generated-cli.js';
import type { AtlasDiagnostic } from './diagnostics.js';

export type GeneratedSourceFamily =
  | 'commander'
  | 'package_scripts'
  | 'workspace_packages'
  | 'tests'
  | 'agent_skills'
  | 'docs'
  | 'config'
  | 'routes'
  | 'dependencies';

export interface GeneratedSourcesReferencePolicy {
  path: string;
  auto_regenerate: boolean;
}

export interface GeneratedSourceFamilyPolicy {
  enabled?: boolean;
  include?: string[];
  exclude?: string[];
  default_visibility?: AtlasVisibility;
  owner_component?: AtlasEntityId;
  owner_repository?: AtlasEntityId;
  script_id_prefix?: string;
  package_component_prefix?: string;
  workflow_relations?: Record<string, AtlasEntityId>;
  frameworks?: string[];
  dependency_cruiser_command?: string;
}

export interface GeneratedSourcesPolicy {
  enabled: boolean;
  disabled: GeneratedSourceFamily[];
  default_visibility: AtlasVisibility;
  package_scripts: GeneratedSourceFamilyPolicy;
  workspace_packages: GeneratedSourceFamilyPolicy;
  tests: GeneratedSourceFamilyPolicy;
  agent_skills: GeneratedSourceFamilyPolicy;
  docs: GeneratedSourceFamilyPolicy;
  config: GeneratedSourceFamilyPolicy;
  routes: GeneratedSourceFamilyPolicy;
  dependencies: GeneratedSourceFamilyPolicy;
  commander?: GeneratedCliPolicy;
  reference?: GeneratedSourcesReferencePolicy;
}

export interface GeneratedSourcesLoadResult {
  entities: AtlasEntity[];
  diagnostics: AtlasDiagnostic[];
  records: GeneratedSourceRecord[];
  cliRecords: AtlasCliCommandRecord[];
  policy: GeneratedSourcesPolicy;
}

export interface LoadGeneratedSourceEntitiesOptions {
  ownerRepository?: AtlasEntityId;
}

export interface GeneratedSourceRecord {
  family: GeneratedSourceFamily;
  entityId: AtlasEntityId;
  title: string;
  summary: string;
  inputs: string[];
}

interface PackageManifest {
  name?: string;
  version?: string;
  description?: string;
  private?: boolean;
  exports?: unknown;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface PackageManifestEntry {
  path: string;
  dir: string;
  manifest: PackageManifest;
}

interface PackageBoundary {
  entityId: AtlasEntityId;
  name: string;
  dir: string;
  manifestPath: string;
}

const execFileAsync = promisify(execFile);

const GENERATED_SOURCE_FAMILIES: GeneratedSourceFamily[] = [
  'commander',
  'package_scripts',
  'workspace_packages',
  'tests',
  'agent_skills',
  'docs',
  'config',
  'routes',
  'dependencies',
];

const DEFAULT_EXCLUDES = [
  'node_modules/',
  'dist/',
  'build/',
  '.git/',
  '.runtime/',
  '.cache/',
  'coverage/',
  'docs/agents/',
  'docs/generated/',
];

const TEST_FILE_RE = /(?:^|[./\\-])(?:test|spec)\.[cm]?[jt]sx?$/;
const DOC_FILE_RE = /\.(?:md|markdown)$/i;
const SOURCE_FILE_RE = /\.[cm]?[jt]sx?$/i;
const CONFIG_FILE_RE = /(^|\/)(?:package\.json|pnpm-workspace\.yaml|agent-atlas\.maintenance\.yaml|tsconfig[^/]*\.json|vitest\.config\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s|eslint[^/]*\.(?:js|mjs|cjs|json)|.*schema\.(?:json|ya?ml))$/;
const ROUTE_PATTERNS = [
  /\b(?:app|router)\.(get|post|put|patch|delete|options|head|all)\(\s*['"`]([^'"`]+)['"`]/g,
  /\bnew\s+URL\([^)]*\)\.pathname\s*={0,2}\s*['"`]([^'"`]+)['"`]/g,
  /\burl\.pathname\s*={0,2}\s*['"`]([^'"`]+)['"`]/g,
];

export async function loadGeneratedSourceEntities(
  rootPath: string,
  options: LoadGeneratedSourceEntitiesOptions = {},
): Promise<GeneratedSourcesLoadResult> {
  const absoluteRoot = path.resolve(rootPath);
  const parsedPolicy = await loadGeneratedSourcesPolicy(absoluteRoot);
  const policy = applyDefaultOwnerRepository(parsedPolicy.policy, options.ownerRepository);
  const diagnostics: AtlasDiagnostic[] = [...parsedPolicy.diagnostics];
  const entities: AtlasEntity[] = [];
  const records: GeneratedSourceRecord[] = [];
  let cliRecords: AtlasCliCommandRecord[] = [];

  if (!policy.enabled) {
    return { entities, diagnostics, records, cliRecords, policy };
  }

  const allFiles = await listRepoFiles(absoluteRoot);
  const manifests = await readPackageManifests(absoluteRoot, allFiles);

  if (isFamilyEnabled(policy, 'commander')) {
    const cli = await loadGeneratedCliEntities(absoluteRoot);
    cliRecords = cli.records;
    entities.push(...cli.entities.map((entity) => markGeneratedEntity(entity, 'commander', ['agent-atlas.maintenance.yaml'])));
    records.push(...cli.records.map((record) => ({
      family: 'commander' as const,
      entityId: record.entityId,
      title: `${record.cliName} ${record.commandPath.join(' ')}`,
      summary: record.summary,
      inputs: [record.usage],
    })));
    diagnostics.push(...cli.diagnostics.map((diagnostic) => ({
      level: diagnostic.level,
      code: 'GENERATED_SOURCE',
      message: diagnostic.message,
    })));
  }

  if (isFamilyEnabled(policy, 'workspace_packages')) {
    const generated = generatePackageComponents(policy, manifests);
    entities.push(...generated.entities);
    records.push(...generated.records);
  }

  if (isFamilyEnabled(policy, 'package_scripts')) {
    const generated = generatePackageScriptInterfaces(policy, manifests);
    entities.push(...generated.entities);
    records.push(...generated.records);
  }

  if (isFamilyEnabled(policy, 'tests')) {
    const generated = generateTestScopes(policy, allFiles, manifests);
    entities.push(...generated.entities);
    records.push(...generated.records);
  }

  if (isFamilyEnabled(policy, 'agent_skills')) {
    const generated = await generateAgentSkillCapabilities(absoluteRoot, policy, allFiles);
    entities.push(...generated.entities);
    records.push(...generated.records);
  }

  if (isFamilyEnabled(policy, 'docs')) {
    const generated = await generateDocumentEntities(absoluteRoot, policy, allFiles, manifests);
    entities.push(...generated.entities);
    records.push(...generated.records);
  }

  if (isFamilyEnabled(policy, 'config')) {
    const generated = generateConfigEntities(policy, allFiles, manifests);
    entities.push(...generated.entities);
    records.push(...generated.records);
  }

  if (isFamilyEnabled(policy, 'routes')) {
    const generated = await generateRouteInterfaces(absoluteRoot, policy, allFiles, manifests);
    entities.push(...generated.entities);
    records.push(...generated.records);
  }

  if (isFamilyEnabled(policy, 'dependencies')) {
    const generated = generateDependencyRelations(policy, manifests);
    entities.push(...generated.entities);
    records.push(...generated.records);
  }

  return {
    entities: dedupeGeneratedEntities(entities),
    diagnostics,
    records: dedupeRecords(records),
    cliRecords,
    policy,
  };
}

export async function loadGeneratedSourcesPolicy(rootPath: string): Promise<{
  policy: GeneratedSourcesPolicy;
  diagnostics: AtlasDiagnostic[];
}> {
  const policyPath = await findMaintenancePolicyPath(rootPath);
  if (!policyPath) {
    return { policy: defaultGeneratedSourcesPolicy(), diagnostics: [] };
  }
  const parsed = parse(await readFile(policyPath, 'utf8')) as unknown;
  return { policy: readGeneratedSourcesPolicy(parsed), diagnostics: [] };
}

function applyDefaultOwnerRepository(
  policy: GeneratedSourcesPolicy,
  ownerRepository: AtlasEntityId | undefined,
): GeneratedSourcesPolicy {
  if (!ownerRepository) {
    return policy;
  }
  return {
    ...policy,
    workspace_packages: {
      ...policy.workspace_packages,
      owner_repository: policy.workspace_packages.owner_repository ?? ownerRepository,
    },
    tests: { ...policy.tests, owner_repository: policy.tests.owner_repository ?? ownerRepository },
    agent_skills: {
      ...policy.agent_skills,
      owner_repository: policy.agent_skills.owner_repository ?? ownerRepository,
    },
    docs: { ...policy.docs, owner_repository: policy.docs.owner_repository ?? ownerRepository },
    config: { ...policy.config, owner_repository: policy.config.owner_repository ?? ownerRepository },
    routes: { ...policy.routes, owner_repository: policy.routes.owner_repository ?? ownerRepository },
    dependencies: {
      ...policy.dependencies,
      owner_repository: policy.dependencies.owner_repository ?? ownerRepository,
    },
  };
}

export function mergeGeneratedEntitiesWithManualOverlays(
  manualEntities: AtlasEntity[],
  generatedEntities: AtlasEntity[],
): { entities: AtlasEntity[]; diagnostics: AtlasDiagnostic[] } {
  const diagnostics: AtlasDiagnostic[] = [];
  const generatedById = new Map<AtlasEntityId, AtlasEntity>();
  const result: AtlasEntity[] = [];

  for (const entity of generatedEntities) {
    if (!generatedById.has(entity.id)) {
      generatedById.set(entity.id, entity);
      result.push(entity);
    }
  }

  for (const manual of manualEntities) {
    const generated = generatedById.get(manual.id);
    if (!generated) {
      result.push(manual);
      continue;
    }
    const merged = applyManualOverlay(generated, manual, diagnostics);
    generatedById.set(merged.id, merged);
    const index = result.findIndex((entity) => entity.id === merged.id);
    if (index >= 0) {
      result[index] = merged;
    }
  }

  return { entities: result.sort((left, right) => left.id.localeCompare(right.id)), diagnostics };
}

export function renderSourceDerivedReferenceMarkdown(result: GeneratedSourcesLoadResult): string {
  const lines = [
    '# Source-Derived Atlas Reference',
    '',
    '> Generated from repository source surfaces. Edit source files or Atlas overlays, then rerun `atlas maintain fix`.',
    '',
    `Generated entities: ${result.entities.length}`,
    '',
  ];
  for (const family of GENERATED_SOURCE_FAMILIES) {
    const records = result.records.filter((record) => record.family === family);
    lines.push(`## ${titleCase(family.replaceAll('_', ' '))}`, '');
    if (!isFamilyEnabled(result.policy, family)) {
      lines.push('- disabled', '');
      continue;
    }
    if (records.length === 0) {
      lines.push('- none discovered', '');
      continue;
    }
    for (const record of records.sort((left, right) => left.entityId.localeCompare(right.entityId))) {
      lines.push(`- \`${record.entityId}\` - ${record.title}: ${record.summary}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function defaultGeneratedSourcesPolicy(): GeneratedSourcesPolicy {
  const defaultVisibility: AtlasVisibility = 'public';
  return {
    enabled: true,
    disabled: [],
    default_visibility: defaultVisibility,
    package_scripts: { enabled: true, default_visibility: defaultVisibility, script_id_prefix: 'package-script' },
    workspace_packages: { enabled: true, default_visibility: defaultVisibility, package_component_prefix: 'package' },
    tests: { enabled: true, default_visibility: defaultVisibility },
    agent_skills: { enabled: true, default_visibility: defaultVisibility },
    docs: { enabled: true, default_visibility: defaultVisibility },
    config: { enabled: true, default_visibility: defaultVisibility },
    routes: { enabled: true, default_visibility: defaultVisibility, frameworks: ['node-http', 'express', 'hono', 'next'] },
    dependencies: { enabled: true, default_visibility: defaultVisibility },
    reference: {
      path: 'docs/generated/source-derived-reference.md',
      auto_regenerate: true,
    },
  };
}

function readGeneratedSourcesPolicy(value: unknown): GeneratedSourcesPolicy {
  const defaults = defaultGeneratedSourcesPolicy();
  const root = isRecord(value) && isRecord(value.generated_sources) ? value.generated_sources : {};
  const enabled = readBoolean((root as Record<string, unknown>).enabled, defaults.enabled);
  const disabled = readFamilyArray((root as Record<string, unknown>).disabled);
  const defaultVisibility = readVisibility(
    (root as Record<string, unknown>).default_visibility,
    readProfileDefaultVisibility(value),
  );
  return {
    enabled,
    disabled,
    default_visibility: defaultVisibility,
    package_scripts: readFamilyPolicy(
      (root as Record<string, unknown>).package_scripts,
      { ...defaults.package_scripts, default_visibility: defaultVisibility },
      defaultVisibility,
    ),
    workspace_packages: readFamilyPolicy(
      (root as Record<string, unknown>).workspace_packages,
      { ...defaults.workspace_packages, default_visibility: defaultVisibility },
      defaultVisibility,
    ),
    tests: readFamilyPolicy(
      (root as Record<string, unknown>).tests,
      { ...defaults.tests, default_visibility: defaultVisibility },
      defaultVisibility,
    ),
    agent_skills: readFamilyPolicy(
      (root as Record<string, unknown>).agent_skills,
      { ...defaults.agent_skills, default_visibility: defaultVisibility },
      defaultVisibility,
    ),
    docs: readFamilyPolicy(
      (root as Record<string, unknown>).docs,
      { ...defaults.docs, default_visibility: defaultVisibility },
      defaultVisibility,
    ),
    config: readFamilyPolicy(
      (root as Record<string, unknown>).config,
      { ...defaults.config, default_visibility: defaultVisibility },
      defaultVisibility,
    ),
    routes: readFamilyPolicy(
      (root as Record<string, unknown>).routes,
      { ...defaults.routes, default_visibility: defaultVisibility },
      defaultVisibility,
    ),
    dependencies: readFamilyPolicy(
      (root as Record<string, unknown>).dependencies,
      { ...defaults.dependencies, default_visibility: defaultVisibility },
      defaultVisibility,
    ),
    reference: readReferencePolicy((root as Record<string, unknown>).reference, defaults.reference),
  };
}

function readProfileDefaultVisibility(value: unknown): AtlasVisibility {
  if (!isRecord(value)) {
    return defaultGeneratedSourcesPolicy().default_visibility;
  }
  if (value.profile === 'private') {
    return 'private';
  }
  if (value.profile === 'company') {
    return 'internal';
  }
  return defaultGeneratedSourcesPolicy().default_visibility;
}

function readFamilyPolicy(value: unknown, defaults: GeneratedSourceFamilyPolicy, defaultVisibility: AtlasVisibility): GeneratedSourceFamilyPolicy {
  if (!isRecord(value)) {
    return { ...defaults, default_visibility: defaults.default_visibility ?? defaultVisibility };
  }
  return {
    ...defaults,
    enabled: readOptionalBoolean(value.enabled) ?? defaults.enabled,
    include: readStringArray(value.include) ?? defaults.include,
    exclude: readStringArray(value.exclude) ?? defaults.exclude,
    default_visibility: readVisibility(value.default_visibility, defaults.default_visibility ?? defaultVisibility),
    owner_component: readOptionalString(value.owner_component) as AtlasEntityId | undefined ?? defaults.owner_component,
    owner_repository: readOptionalString(value.owner_repository) as AtlasEntityId | undefined ?? defaults.owner_repository,
    script_id_prefix: readOptionalString(value.script_id_prefix) ?? defaults.script_id_prefix,
    package_component_prefix: readOptionalString(value.package_component_prefix) ?? defaults.package_component_prefix,
    workflow_relations: readWorkflowRelations(value.workflow_relations) ?? defaults.workflow_relations,
    frameworks: readStringArray(value.frameworks) ?? defaults.frameworks,
    dependency_cruiser_command: readOptionalString(value.dependency_cruiser_command) ?? defaults.dependency_cruiser_command,
  };
}

function readReferencePolicy(value: unknown, defaults: GeneratedSourcesReferencePolicy | undefined): GeneratedSourcesReferencePolicy | undefined {
  if (!isRecord(value)) {
    return defaults;
  }
  return {
    path: readString(value.path, defaults?.path ?? 'docs/generated/source-derived-reference.md'),
    auto_regenerate: readBoolean(value.auto_regenerate, defaults?.auto_regenerate ?? true),
  };
}

function isFamilyEnabled(policy: GeneratedSourcesPolicy, family: GeneratedSourceFamily): boolean {
  if (!policy.enabled || policy.disabled.includes(family)) {
    return false;
  }
  if (family === 'commander') {
    return true;
  }
  return policy[family].enabled !== false;
}

async function listRepoFiles(rootPath: string): Promise<string[]> {
  const gitFiles = await listGitIndexedFiles(rootPath);
  if (gitFiles.length > 0) {
    return gitFiles.filter((filePath) => !isExcludedPath(filePath)).sort();
  }

  const files: string[] = [];
  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = normalizePath(path.relative(rootPath, absolutePath));
      if (isExcludedPath(relativePath)) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }
  await walk(rootPath);
  return files.sort();
}

async function listGitIndexedFiles(rootPath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['ls-files', '--cached', '--modified'], {
      cwd: rootPath,
      maxBuffer: 10 * 1024 * 1024,
    });
    return [
      ...new Set(
        stdout
          .split(/\r?\n/)
          .map((line) => normalizePath(line.trim()))
          .filter(Boolean),
      ),
    ];
  } catch {
    return [];
  }
}

async function readPackageManifests(rootPath: string, files: string[]): Promise<PackageManifestEntry[]> {
  const manifests: PackageManifestEntry[] = [];
  for (const file of files.filter((candidate) => candidate.endsWith('package.json'))) {
    try {
      const manifest = JSON.parse(await readFile(path.join(rootPath, file), 'utf8')) as PackageManifest;
      manifests.push({ path: file, dir: normalizePath(path.dirname(file) === '.' ? '' : path.dirname(file)), manifest });
    } catch {
      // Ignore invalid manifests here; validation of package.json belongs to the package manager.
    }
  }
  return manifests.sort((left, right) => left.path.localeCompare(right.path));
}

function generatePackageComponents(policy: GeneratedSourcesPolicy, manifests: PackageManifestEntry[]): GeneratedEntities {
  const entities: AtlasEntity[] = [];
  const records: GeneratedSourceRecord[] = [];
  const family = policy.workspace_packages;
  for (const item of manifests) {
    const name = packageDisplayName(item);
    const id = getPackageEntityId(policy, item);
    const dependencyNames = Object.keys(item.manifest.dependencies ?? {});
    const devDependencyNames = Object.keys(item.manifest.devDependencies ?? {});
    const peerDependencyNames = Object.keys(item.manifest.peerDependencies ?? {});
    const scriptNames = Object.keys(item.manifest.scripts ?? {});
    const exportNames = summarizePackageExports(item.manifest.exports);
    const entity = markGeneratedEntity({
      id,
      kind: 'component',
      title: name,
      summary: item.manifest.description ?? `Package manifest at ${item.path}.`,
      visibility: family.default_visibility ?? policy.default_visibility,
      uri: item.path,
      code: { paths: [item.dir ? `${item.dir}/**` : item.path], entrypoints: [item.path] },
      commands: Object.keys(item.manifest.scripts ?? {}).map((script) => ({
        command: item.dir ? `pnpm --dir ${item.dir} ${script}` : `pnpm ${script}`,
        cwd: item.dir || undefined,
        purpose: `${script} script for ${name}.`,
      })),
      relations: [
        ...(family.owner_repository ? [{ type: 'part-of' as const, target: family.owner_repository }] : []),
      ],
      metadata: {
        package: {
          name,
          version: item.manifest.version,
          private: item.manifest.private,
          path: item.path,
          root: item.dir || '.',
          scripts: scriptNames,
          exports: exportNames,
          dependencies: dependencyNames,
          dev_dependencies: devDependencyNames,
          peer_dependencies: peerDependencyNames,
        },
      },
    }, 'workspace_packages', [item.path]);
    entities.push(entity);
    records.push({ family: 'workspace_packages', entityId: id, title: entity.title, summary: entity.summary, inputs: [item.path] });
  }
  return { entities, records };
}

function generatePackageScriptInterfaces(policy: GeneratedSourcesPolicy, manifests: PackageManifestEntry[]): GeneratedEntities {
  const entities: AtlasEntity[] = [];
  const records: GeneratedSourceRecord[] = [];
  const family = policy.package_scripts;
  const prefix = family.script_id_prefix ?? 'package-script';
  for (const item of manifests) {
    const packageName = packageDisplayName(item);
    const packageComponentId = getPackageEntityId(policy, item);
    for (const [scriptName, command] of Object.entries(item.manifest.scripts ?? {})) {
      const id = `interface:${prefix}.${slugify(packageName)}.${slugify(scriptName)}` as AtlasEntityId;
      const relations: AtlasRelation[] = [{ type: 'part-of', target: packageComponentId }];
      const workflow = family.workflow_relations?.[scriptName] ?? family.workflow_relations?.[`${packageName} ${scriptName}`];
      if (workflow) {
        relations.push({ type: 'implements', target: workflow });
      }
      const entity = markGeneratedEntity({
        id,
        kind: 'interface',
        title: `${packageName} ${scriptName}`,
        summary: `Package script \`${scriptName}\` from ${item.path}.`,
        visibility: family.default_visibility ?? policy.default_visibility,
        uri: item.dir ? `pnpm --dir ${item.dir} ${scriptName}` : `pnpm ${scriptName}`,
        commands: [{ command: item.dir ? `pnpm --dir ${item.dir} ${scriptName}` : `pnpm ${scriptName}`, cwd: item.dir || undefined, purpose: command }],
        relations,
        tags: ['package-script', classifyScript(scriptName)],
        metadata: {
          package_script: { package_name: packageName, script: scriptName, command, path: item.path },
        },
      }, 'package_scripts', [item.path]);
      entities.push(entity);
      records.push({ family: 'package_scripts', entityId: id, title: entity.title, summary: entity.summary, inputs: [item.path] });
    }
  }
  return { entities, records };
}

function generateTestScopes(policy: GeneratedSourcesPolicy, files: string[], manifests: PackageManifestEntry[]): GeneratedEntities {
  const family = policy.tests;
  const testFiles = applyIncludeExclude(files.filter((file) => TEST_FILE_RE.test(file)), family);
  const packageBoundaries = createPackageBoundaries(policy, manifests);
  const groups = new Map<string, { title: string; summaryRoot: string; packageId?: AtlasEntityId; paths: string[] }>();
  for (const file of testFiles) {
    const owner = findOwningPackage(file, packageBoundaries);
    const group = owner ? `package:${owner.entityId}` : `path:${firstPathSegment(file)}`;
    const existing = groups.get(group) ?? {
      title: owner ? `${owner.name} tests` : `${firstPathSegment(file)} tests`,
      summaryRoot: owner ? owner.dir || 'repository root package' : firstPathSegment(file),
      packageId: owner?.entityId,
      paths: [],
    };
    existing.paths.push(file);
    groups.set(group, existing);
  }
  const entities: AtlasEntity[] = [];
  const records: GeneratedSourceRecord[] = [];
  for (const [group, testGroup] of [...groups.entries()].sort()) {
    const id = group.startsWith('package:')
      ? `test-scope:generated.package.${slugify(testGroup.title.replace(/\s+tests$/i, ''))}` as AtlasEntityId
      : `test-scope:generated.${slugify(group.replace(/^path:/, ''))}` as AtlasEntityId;
    const paths = testGroup.paths.sort();
    const entity = markGeneratedEntity({
      id,
      kind: 'test-scope',
      title: testGroup.title,
      summary: `${paths.length} discovered test file${paths.length === 1 ? '' : 's'} under ${testGroup.summaryRoot}.`,
      visibility: family.default_visibility ?? policy.default_visibility,
      code: { paths },
      commands: [{ command: 'pnpm test', purpose: 'Run repository test suite.' }],
      relations: relationsForPathOwnership(family.owner_repository, testGroup.packageId),
      metadata: { tests: { files: paths, package_id: testGroup.packageId } },
    }, 'tests', paths);
    entities.push(entity);
    records.push({ family: 'tests', entityId: id, title: entity.title, summary: entity.summary, inputs: paths });
  }
  return { entities, records };
}

async function generateAgentSkillCapabilities(rootPath: string, policy: GeneratedSourcesPolicy, files: string[]): Promise<GeneratedEntities> {
  const family = policy.agent_skills;
  const skillFiles = applyIncludeExclude(
    files.filter((file) => /^\.agents\/skills\/[^/]+\/SKILL\.md$/i.test(file)),
    family,
  );
  const entities: AtlasEntity[] = [];
  const records: GeneratedSourceRecord[] = [];
  for (const file of skillFiles) {
    const skillName = file.split('/')[2] ?? path.basename(path.dirname(file));
    const id = `capability:agent-skill.${slugify(skillName)}` as AtlasEntityId;
    const documentId = `document:generated.${slugify(stripExtension(file))}` as AtlasEntityId;
    const title = await readMarkdownTitle(rootPath, file) ?? titleCase(skillName.replaceAll('-', ' '));
    const summary = await readMarkdownSummary(rootPath, file) ?? `Agent skill defined at ${file}.`;
    const relations: AtlasRelation[] = [
      { type: 'documented-in', target: documentId },
      ...(family.owner_repository ? [{ type: 'part-of' as const, target: family.owner_repository }] : []),
    ];
    const entity = markGeneratedEntity({
      id,
      kind: 'capability',
      title,
      summary,
      visibility: family.default_visibility ?? policy.default_visibility,
      uri: file,
      code: { paths: [file] },
      relations,
      tags: ['agent-skill'],
      metadata: { agent_skill: { name: skillName, path: file, document_id: documentId } },
    }, 'agent_skills', [file]);
    entities.push(entity);
    records.push({ family: 'agent_skills', entityId: id, title: entity.title, summary: entity.summary, inputs: [file] });
  }
  return { entities, records };
}

async function generateDocumentEntities(rootPath: string, policy: GeneratedSourcesPolicy, files: string[], manifests: PackageManifestEntry[]): Promise<GeneratedEntities> {
  const family = policy.docs;
  const docFiles = applyIncludeExclude(files.filter((file) => DOC_FILE_RE.test(file)), family);
  const packageBoundaries = createPackageBoundaries(policy, manifests);
  const entities: AtlasEntity[] = [];
  const records: GeneratedSourceRecord[] = [];
  for (const file of docFiles) {
    if (await isGeneratedAtlasMarkdown(rootPath, file)) {
      continue;
    }
    const title = await readMarkdownTitle(rootPath, file);
    const id = `document:generated.${slugify(stripExtension(file))}` as AtlasEntityId;
    const entity = markGeneratedEntity({
      id,
      kind: 'document',
      title: title ?? titleCase(path.basename(file).replace(/\.(md|markdown)$/i, '').replaceAll('-', ' ')),
      summary: `Markdown document at ${file}.`,
      visibility: family.default_visibility ?? policy.default_visibility,
      uri: file,
      code: { paths: [file] },
      relations: relationsForPathOwnership(family.owner_repository, findOwningPackage(file, packageBoundaries)?.entityId),
      metadata: {
        document: {
          path: file,
          generated_from_markdown: true,
          package_id: findOwningPackage(file, packageBoundaries)?.entityId,
        },
      },
    }, 'docs', [file]);
    entities.push(entity);
    records.push({ family: 'docs', entityId: id, title: entity.title, summary: entity.summary, inputs: [file] });
  }
  return { entities, records };
}

async function isGeneratedAtlasMarkdown(rootPath: string, file: string): Promise<boolean> {
  try {
    const content = await readFile(path.join(rootPath, file), 'utf8');
    return content.startsWith('<!-- Generated by Agent Atlas. Do not edit directly. -->');
  } catch {
    return false;
  }
}

function generateConfigEntities(policy: GeneratedSourcesPolicy, files: string[], manifests: PackageManifestEntry[]): GeneratedEntities {
  const family = policy.config;
  const configFiles = applyIncludeExclude(files.filter((file) => CONFIG_FILE_RE.test(file)), family);
  const packageBoundaries = createPackageBoundaries(policy, manifests);
  const entities: AtlasEntity[] = [];
  const records: GeneratedSourceRecord[] = [];
  for (const file of configFiles) {
    const owner = findOwningPackage(file, packageBoundaries);
    const id = `resource:config.${slugify(stripExtension(file))}` as AtlasEntityId;
    const entity = markGeneratedEntity({
      id,
      kind: 'resource',
      title: `${path.basename(file)} config`,
      summary: `Repository configuration file at ${file}.`,
      visibility: family.default_visibility ?? policy.default_visibility,
      uri: file,
      code: { paths: [file] },
      relations: relationsForPathOwnership(family.owner_repository, owner?.entityId),
      metadata: { config: { path: file, package_id: owner?.entityId } },
    }, 'config', [file]);
    entities.push(entity);
    records.push({ family: 'config', entityId: id, title: entity.title, summary: entity.summary, inputs: [file] });
  }
  return { entities, records };
}

async function generateRouteInterfaces(rootPath: string, policy: GeneratedSourcesPolicy, files: string[], manifests: PackageManifestEntry[]): Promise<GeneratedEntities> {
  const family = policy.routes;
  const sourceFiles = applyIncludeExclude(files.filter((file) => SOURCE_FILE_RE.test(file)), family);
  const packageBoundaries = createPackageBoundaries(policy, manifests);
  const entities: AtlasEntity[] = [];
  const records: GeneratedSourceRecord[] = [];
  const seen = new Set<string>();
  for (const file of sourceFiles) {
    let content = '';
    try {
      content = await readFile(path.join(rootPath, file), 'utf8');
    } catch {
      continue;
    }
    const routes = extractRoutesFromSource(file, content);
    const owner = findOwningPackage(file, packageBoundaries);
    for (const route of routes) {
      const key = `${route.method}:${route.path}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const id = `interface:route.${slugify(route.method)}.${slugify(route.path)}` as AtlasEntityId;
      const entity = markGeneratedEntity({
        id,
        kind: 'interface',
        title: `${route.method.toUpperCase()} ${route.path}`,
        summary: `Discovered ${route.method.toUpperCase()} route in ${file}.`,
        visibility: family.default_visibility ?? policy.default_visibility,
        uri: `${route.method.toUpperCase()} ${route.path}`,
        code: { paths: [file] },
        relations: relationsForPathOwnership(family.owner_repository, owner?.entityId),
        metadata: { route: { method: route.method, path: route.path, source: file, package_id: owner?.entityId } },
      }, 'routes', [file]);
      entities.push(entity);
      records.push({ family: 'routes', entityId: id, title: entity.title, summary: entity.summary, inputs: [file] });
    }
  }
  return { entities, records };
}

function generateDependencyRelations(policy: GeneratedSourcesPolicy, manifests: PackageManifestEntry[]): GeneratedEntities {
  const family = policy.dependencies;
  const entities: AtlasEntity[] = [];
  const records: GeneratedSourceRecord[] = [];
  const packagePrefix = policy.workspace_packages.package_component_prefix ?? 'package';
  const packageEntityIds = new Map<string, AtlasEntityId>();
  for (const item of manifests) {
    if (item.manifest.name) {
      packageEntityIds.set(item.manifest.name, `component:${packagePrefix}.${slugify(item.manifest.name)}` as AtlasEntityId);
    }
  }
  for (const item of manifests) {
    const name = item.manifest.name ?? (item.dir || 'root');
    const sourceId = `component:${packagePrefix}.${slugify(name)}` as AtlasEntityId;
    const relations: AtlasRelation[] = [];
    for (const dependencyName of Object.keys({
      ...(item.manifest.dependencies ?? {}),
      ...(item.manifest.devDependencies ?? {}),
      ...(item.manifest.peerDependencies ?? {}),
    })) {
      const target = packageEntityIds.get(dependencyName);
      if (target && target !== sourceId) {
        relations.push({ type: 'depends-on', target, strength: 'inferred' });
      }
    }
    if (relations.length === 0) {
      continue;
    }
    const id = `component:${packagePrefix}.${slugify(name)}.dependencies` as AtlasEntityId;
    const entity = markGeneratedEntity({
      id,
      kind: 'component',
      title: `${name} dependency surface`,
      summary: `Workspace dependency relations for ${name}.`,
      visibility: family.default_visibility ?? policy.default_visibility,
      uri: item.path,
      relations: [{ type: 'part-of', target: sourceId }, ...relations],
      metadata: { dependencies: { package_name: name, source_manifest: item.path } },
    }, 'dependencies', [item.path]);
    entities.push(entity);
    records.push({ family: 'dependencies', entityId: id, title: entity.title, summary: entity.summary, inputs: [item.path] });
  }
  return { entities, records };
}

function packageDisplayName(item: PackageManifestEntry): string {
  return item.manifest.name ?? (item.dir || 'root');
}

function getPackageEntityId(policy: GeneratedSourcesPolicy, item: PackageManifestEntry): AtlasEntityId {
  const prefix = policy.workspace_packages.package_component_prefix ?? 'package';
  return `component:${prefix}.${slugify(packageDisplayName(item))}` as AtlasEntityId;
}

function createPackageBoundaries(policy: GeneratedSourcesPolicy, manifests: PackageManifestEntry[]): PackageBoundary[] {
  return manifests
    .map((item) => ({
      entityId: getPackageEntityId(policy, item),
      name: packageDisplayName(item),
      dir: item.dir,
      manifestPath: item.path,
    }))
    .sort((left, right) => right.dir.length - left.dir.length || left.name.localeCompare(right.name));
}

function findOwningPackage(file: string, boundaries: PackageBoundary[]): PackageBoundary | undefined {
  const normalizedFile = normalizePath(file);
  const rootBoundary = boundaries.find((boundary) => boundary.dir === '');
  for (const boundary of boundaries) {
    if (boundary.dir === '') {
      continue;
    }
    if (normalizedFile === boundary.manifestPath || normalizedFile.startsWith(`${boundary.dir}/`)) {
      return boundary;
    }
  }
  return rootBoundary && normalizedFile === rootBoundary.manifestPath ? rootBoundary : undefined;
}

function relationsForPathOwnership(
  ownerRepository: AtlasEntityId | undefined,
  packageId: AtlasEntityId | undefined,
): AtlasRelation[] {
  const relations: AtlasRelation[] = [];
  if (ownerRepository) {
    relations.push({ type: 'part-of', target: ownerRepository });
  }
  if (packageId && packageId !== ownerRepository) {
    relations.push({ type: 'part-of', target: packageId });
  }
  return relations;
}

function summarizePackageExports(exportsValue: unknown): string[] {
  if (typeof exportsValue === 'string') {
    return ['.'];
  }
  if (Array.isArray(exportsValue)) {
    return exportsValue.map((entry) => String(entry)).slice(0, 20);
  }
  if (isRecord(exportsValue)) {
    return Object.keys(exportsValue).sort().slice(0, 20);
  }
  return [];
}

function markGeneratedEntity(entity: AtlasEntity, family: GeneratedSourceFamily, inputs: string[]): AtlasEntity {
  return {
    ...entity,
    tags: [...new Set([...(entity.tags ?? []), 'generated-source', family])],
    metadata: {
      ...(entity.metadata ?? {}),
      generated_source: {
        family,
        inputs,
        generated: true,
      },
    },
  };
}

function applyManualOverlay(generated: AtlasEntity, manual: AtlasEntity, diagnostics: AtlasDiagnostic[]): AtlasEntity {
  for (const key of ['kind', 'title', 'summary', 'uri', 'code', 'commands'] as const) {
    if (JSON.stringify(generated[key]) !== JSON.stringify(manual[key]) && manual[key] !== undefined) {
      diagnostics.push({
        level: 'warning',
        code: 'GENERATED_SOURCE_OVERLAY',
        message: `Manual card ${manual.id} attempted to override generated ${key}; keeping generated value.`,
        entityId: manual.id,
      });
    }
  }
  const visibility = narrowVisibility(generated.visibility, manual.visibility);
  return {
    ...generated,
    visibility,
    owners: mergeArrays(generated.owners, manual.owners),
    tags: mergeArrays(generated.tags, manual.tags),
    aliases: mergeArrays(generated.aliases, manual.aliases),
    relations: mergeRelations(generated.relations, manual.relations),
    agent: {
      ...(generated.agent ?? {}),
      ...(manual.agent ?? {}),
    },
    metadata: mergeMetadata(generated.metadata, manual.metadata),
  };
}

function mergeMetadata(generated: Record<string, unknown> | undefined, manual: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!generated && !manual) {
    return undefined;
  }
  const merged = { ...(manual ?? {}), ...(generated ?? {}) };
  return merged;
}

function mergeArrays(left: string[] | undefined, right: string[] | undefined): string[] | undefined {
  const merged = [...new Set([...(left ?? []), ...(right ?? [])])];
  return merged.length > 0 ? merged : undefined;
}

function mergeRelations(left: AtlasRelation[] | undefined, right: AtlasRelation[] | undefined): AtlasRelation[] | undefined {
  const relations: AtlasRelation[] = [];
  const keys = new Set<string>();
  for (const relation of [...(left ?? []), ...(right ?? [])]) {
    const key = `${relation.type}|${relation.target}|${relation.summary ?? ''}`;
    if (keys.has(key)) {
      continue;
    }
    keys.add(key);
    relations.push(relation);
  }
  return relations.length > 0 ? relations : undefined;
}

function narrowVisibility(generated: AtlasVisibility | undefined, manual: AtlasVisibility | undefined): AtlasVisibility | undefined {
  if (!manual) {
    return generated;
  }
  const rank: Record<AtlasVisibility, number> = { public: 0, internal: 1, private: 2, restricted: 3 };
  if (!generated) {
    return manual;
  }
  return rank[manual] > rank[generated] ? manual : generated;
}

function extractRoutesFromSource(file: string, content: string): Array<{ method: string; path: string }> {
  const routes: Array<{ method: string; path: string }> = [];
  if (/app\/api\/.+\/route\.[cm]?[jt]sx?$/.test(file)) {
    const methodMatches = [...content.matchAll(/\bexport\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)];
    const routePath = `/${file.replace(/^.*app\/api\//, '').replace(/\/route\.[^.]+$/, '').replace(/\[[^\]]+\]/g, ':param')}`;
    routes.push(...methodMatches.map((match) => ({ method: match[1]!.toLowerCase(), path: routePath })));
  }
  for (const pattern of ROUTE_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      if (match.length === 3) {
        routes.push({ method: match[1]!.toLowerCase(), path: match[2]! });
      } else if (match.length === 2) {
        routes.push({ method: 'get', path: match[1]! });
      }
    }
  }
  return routes.filter((route) => route.path.startsWith('/'));
}

async function readMarkdownTitle(rootPath: string, file: string): Promise<string | undefined> {
  try {
    const content = await readFile(path.join(rootPath, file), 'utf8');
    const match = /^#\s+(.+)$/m.exec(content);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

async function readMarkdownSummary(rootPath: string, file: string): Promise<string | undefined> {
  try {
    const content = await readFile(path.join(rootPath, file), 'utf8');
    const lines = content.split(/\r?\n/);
    let inFrontmatter = false;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line === '---') {
        inFrontmatter = !inFrontmatter;
        continue;
      }
      if (inFrontmatter || !line || line.startsWith('#') || line.startsWith('```') || line.startsWith('<!--')) {
        continue;
      }
      return line.replace(/^[-*]\s+/, '').slice(0, 240);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function applyIncludeExclude(files: string[], policy: GeneratedSourceFamilyPolicy): string[] {
  return files
    .filter((file) => matchesAnyInclude(file, policy.include))
    .filter((file) => !matchesAny(file, policy.exclude ?? []))
    .sort();
}

function matchesAnyInclude(file: string, include: string[] | undefined): boolean {
  return !include || include.length === 0 || matchesAny(file, include);
}

function matchesAny(file: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globLikeMatches(file, pattern));
}

function globLikeMatches(file: string, pattern: string): boolean {
  const normalizedPattern = normalizePath(pattern).replace(/^\*\*\//, '');
  if (normalizedPattern.endsWith('/**')) {
    return file.startsWith(normalizedPattern.slice(0, -3));
  }
  if (normalizedPattern.includes('*')) {
    const regex = new RegExp(`^${escapeRegex(normalizedPattern).replace(/\\\*\\\*/g, '.*').replace(/\\\*/g, '[^/]*')}$`);
    return regex.test(file);
  }
  return file === normalizedPattern || file.startsWith(`${normalizedPattern}/`);
}

function isExcludedPath(filePath: string): boolean {
  return DEFAULT_EXCLUDES.some((prefix) => {
    const segment = prefix.replace(/\/$/, '');
    return filePath === segment || filePath.startsWith(prefix) || filePath.includes(`/${segment}/`);
  });
}

function readWorkflowRelations(value: unknown): Record<string, AtlasEntityId> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const relations: Record<string, AtlasEntityId> = {};
  for (const [key, target] of Object.entries(value)) {
    if (typeof target === 'string') {
      relations[key] = target as AtlasEntityId;
    }
  }
  return Object.keys(relations).length > 0 ? relations : undefined;
}

function readFamilyArray(value: unknown): GeneratedSourceFamily[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is GeneratedSourceFamily => GENERATED_SOURCE_FAMILIES.includes(entry as GeneratedSourceFamily));
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : undefined;
}

function readVisibility(value: unknown, fallback: AtlasVisibility): AtlasVisibility {
  return value === 'public' || value === 'private' || value === 'internal' || value === 'restricted'
    ? value
    : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readString(value: unknown, fallback: string): string {
  return readOptionalString(value) ?? fallback;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return readOptionalBoolean(value) ?? fallback;
}

async function findMaintenancePolicyPath(rootPath: string): Promise<string | undefined> {
  for (const candidate of [
    path.join(rootPath, 'agent-atlas.maintenance.yaml'),
    path.join(rootPath, '.agent-atlas', 'maintenance.yaml'),
  ]) {
    try {
      await readFile(candidate, 'utf8');
      return candidate;
    } catch {
      // Try the next policy path.
    }
  }
  return undefined;
}

interface GeneratedEntities {
  entities: AtlasEntity[];
  records: GeneratedSourceRecord[];
}

function dedupeGeneratedEntities(entities: AtlasEntity[]): AtlasEntity[] {
  const byId = new Map<AtlasEntityId, AtlasEntity>();
  for (const entity of entities) {
    if (!byId.has(entity.id)) {
      byId.set(entity.id, entity);
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function dedupeRecords(records: GeneratedSourceRecord[]): GeneratedSourceRecord[] {
  const byKey = new Map<string, GeneratedSourceRecord>();
  for (const record of records) {
    byKey.set(`${record.family}|${record.entityId}`, record);
  }
  return [...byKey.values()].sort((left, right) => left.entityId.localeCompare(right.entityId));
}

function firstPathSegment(filePath: string): string {
  return filePath.includes('/') ? filePath.split('/')[0]! : 'root';
}

function stripExtension(filePath: string): string {
  return filePath.replace(/\.[^.]+$/, '');
}

function classifyScript(script: string): string {
  if (/test|spec|vitest|jest/i.test(script)) return 'verification';
  if (/lint|check|typecheck|validate/i.test(script)) return 'verification';
  if (/build|compile/i.test(script)) return 'build';
  if (/start|dev|serve/i.test(script)) return 'runtime';
  return 'script';
}

function slugify(value: string): string {
  const slug = value
    .replace(/^@/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'root';
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
