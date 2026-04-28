import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

import type {
  AtlasEntity,
  AtlasEntityId,
  AtlasRelation,
} from '@agent-atlas/schema';
import type { AtlasDiagnostic } from './diagnostics.js';
import type { AtlasGraph } from './graph.js';
import {
  createGraphDiagnostics,
  createGraphIndex,
  normalizeGraphEdges,
} from './graph.js';
import type { AtlasProfile } from './profile.js';
import { validateAtlas } from './validation.js';

export interface AtlasRegistryConfig {
  version: 1;
  name: string;
  imports: AtlasRegistryImport[];
}

export interface AtlasRegistryImport {
  id: string;
  path: string;
  role: 'registry' | 'repository';
  repository?: AtlasEntityId;
  profile?: AtlasProfile;
}

export interface AtlasRegistryImportSummary extends AtlasRegistryImport {
  rootPath: string;
  profile: AtlasProfile;
  entityCount: number;
  relationCount: number;
  schemaVersions: number[];
  legacyEntityCount: number;
}

export interface GlobalAtlasGraph extends AtlasGraph {
  registry: {
    configPath: string;
    name: string;
    imports: AtlasRegistryImportSummary[];
  };
}

export interface LoadGlobalAtlasGraphOptions {
  profile?: AtlasProfile;
}

export async function loadGlobalAtlasGraph(
  rootPath: string,
  options: LoadGlobalAtlasGraphOptions = {},
): Promise<GlobalAtlasGraph> {
  const { config, configPath } = await loadAtlasRegistryConfig(rootPath);
  const configDirectory = path.dirname(configPath);
  const diagnostics: AtlasDiagnostic[] = [];
  const importedEntities: AtlasEntity[] = [];
  const imports: AtlasRegistryImportSummary[] = [];
  const defaultProfile = options.profile ?? 'company';

  diagnostics.push(
    ...diagnoseRegistryConfig(config, configPath, defaultProfile),
  );

  for (const registryImport of config.imports) {
    const importRoot = path.resolve(configDirectory, registryImport.path);
    const profile = registryImport.profile ?? defaultProfile;
    if (!(await pathExists(importRoot))) {
      diagnostics.push({
        level: 'error',
        code: 'GLOBAL_IMPORT_MISSING',
        message: `Registry import ${registryImport.id} path ${registryImport.path} does not exist.`,
        hint: 'Create the imported atlas root or update agent-atlas.registry.yaml.',
        path: configPath,
      });
      imports.push({
        ...registryImport,
        rootPath: importRoot,
        profile,
        entityCount: 0,
        relationCount: 0,
        schemaVersions: [],
        legacyEntityCount: 0,
      });
      continue;
    }

    const validation = await validateAtlas(importRoot, {
      profile,
      includeYamlRoot: true,
    });
    const entities = validation.entities.map((entity) =>
      annotateImportedEntity(entity, registryImport, importRoot),
    );

    importedEntities.push(...entities);
    diagnostics.push(...validation.diagnostics);
    imports.push({
      ...registryImport,
      rootPath: importRoot,
      profile,
      entityCount: entities.length,
      relationCount: entities.reduce(
        (count, entity) => count + (entity.relations?.length ?? 0),
        0,
      ),
      schemaVersions: uniqueSchemaVersions(entities),
      legacyEntityCount: entities.filter(
        (entity) => entity.schema_version === undefined,
      ).length,
    });
  }

  const entities = keepFirstGlobalEntityById(importedEntities, diagnostics);
  const entityIds = new Set(entities.map((entity) => entity.id));
  diagnostics.push(...diagnoseRepositoryImports(imports, entityIds, configPath));
  const filteredDiagnostics = suppressResolvedImportTargetDiagnostics(
    diagnostics,
    entityIds,
  );
  const edges = normalizeGraphEdges(entities);
  const index = createGraphIndex(entities, edges);
  filteredDiagnostics.push(
    ...diagnoseCrossRepoTopology(entities, edges, imports),
  );

  return {
    rootPath: path.dirname(configPath),
    entities,
    edges,
    index,
    diagnostics: [
      ...filteredDiagnostics,
      ...createGraphDiagnostics(entities, edges),
    ],
    registry: {
      configPath,
      name: config.name,
      imports,
    },
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function uniqueSchemaVersions(entities: AtlasEntity[]): number[] {
  const versions = new Set<number>();
  for (const entity of entities) {
    if (entity.schema_version !== undefined) {
      versions.add(entity.schema_version);
    }
  }
  return [...versions].sort((left, right) => left - right);
}

function diagnoseRegistryConfig(
  config: AtlasRegistryConfig,
  configPath: string,
  defaultProfile: AtlasProfile,
): AtlasDiagnostic[] {
  const diagnostics: AtlasDiagnostic[] = [];
  const importIds = new Set<string>();
  const duplicateImportIds = new Set<string>();
  const repositoryIds = new Set<AtlasEntityId>();
  const duplicateRepositoryIds = new Set<AtlasEntityId>();

  for (const registryImport of config.imports) {
    if (importIds.has(registryImport.id)) {
      duplicateImportIds.add(registryImport.id);
    }
    importIds.add(registryImport.id);

    if (registryImport.repository) {
      if (repositoryIds.has(registryImport.repository)) {
        duplicateRepositoryIds.add(registryImport.repository);
      }
      repositoryIds.add(registryImport.repository);
    }

    if (
      registryImport.role === 'repository' &&
      registryImport.repository === undefined
    ) {
      diagnostics.push({
        level: 'error',
        code: 'GLOBAL_IMPORT_REPOSITORY_UNDECLARED',
        message: `Repository import ${registryImport.id} does not declare a repository entity ID.`,
        hint: 'Add repository: repository:<slug> so imported entities can be attached to the repo card.',
        path: configPath,
      });
    }

    if (registryImport.profile && registryImport.profile !== defaultProfile) {
      diagnostics.push({
        level: 'warning',
        code: 'GLOBAL_IMPORT_PROFILE_MISMATCH',
        message: `Registry import ${registryImport.id} uses profile ${registryImport.profile} while the registry command uses ${defaultProfile}.`,
        hint: 'Keep this override only when the control plane intentionally imports a narrower or broader profile.',
        path: configPath,
      });
    }
  }

  for (const duplicateImportId of [...duplicateImportIds].sort()) {
    diagnostics.push({
      level: 'error',
      code: 'GLOBAL_DUPLICATE_IMPORT_ID',
      message: `Duplicate registry import ID ${duplicateImportId}.`,
      hint: 'Use one stable import ID per imported atlas root.',
      path: configPath,
    });
  }

  for (const duplicateRepositoryId of [...duplicateRepositoryIds].sort()) {
    diagnostics.push({
      level: 'error',
      code: 'GLOBAL_DUPLICATE_REPOSITORY_ID',
      message: `Duplicate registry repository ID ${duplicateRepositoryId}.`,
      hint: 'Each repository entity should be owned by one repository import.',
      entityId: duplicateRepositoryId,
      path: configPath,
    });
  }

  return diagnostics;
}

function diagnoseRepositoryImports(
  imports: AtlasRegistryImportSummary[],
  entityIds: Set<AtlasEntityId>,
  configPath: string,
): AtlasDiagnostic[] {
  const diagnostics: AtlasDiagnostic[] = [];

  for (const registryImport of imports) {
    if (
      registryImport.role === 'repository' &&
      registryImport.repository &&
      !entityIds.has(registryImport.repository)
    ) {
      diagnostics.push({
        level: 'error',
        code: 'GLOBAL_REPOSITORY_ENTITY_MISSING',
        message: `Repository import ${registryImport.id} references missing entity ${registryImport.repository}.`,
        hint: 'Add the repository entity to the central registry import or fix the repository field.',
        entityId: registryImport.repository,
        path: configPath,
      });
    }
  }

  return diagnostics;
}

function diagnoseCrossRepoTopology(
  entities: AtlasEntity[],
  edges: ReturnType<typeof normalizeGraphEdges>,
  imports: AtlasRegistryImportSummary[],
): AtlasDiagnostic[] {
  const repositoryImports = imports.filter(
    (registryImport) =>
      registryImport.role === 'repository' && registryImport.entityCount > 0,
  );
  if (repositoryImports.length < 2) {
    return [];
  }

  const importByEntityId = new Map<AtlasEntityId, string>();
  for (const entity of entities) {
    const registry = entity.metadata?.registry;
    if (isRecord(registry) && typeof registry.importId === 'string') {
      importByEntityId.set(entity.id, registry.importId);
    }
  }

  const importsWithCrossEdges = new Set<string>();
  for (const edge of edges) {
    const sourceImport = importByEntityId.get(edge.source);
    const targetImport = importByEntityId.get(edge.target);
    if (!sourceImport || !targetImport || sourceImport === targetImport) {
      continue;
    }
    importsWithCrossEdges.add(sourceImport);
    importsWithCrossEdges.add(targetImport);
  }

  return repositoryImports
    .filter((registryImport) => !importsWithCrossEdges.has(registryImport.id))
    .map((registryImport) => ({
      level: 'warning' as const,
      code: 'GLOBAL_WEAK_CROSS_REPO_CONTEXT',
      message: `Repository import ${registryImport.id} has no cross-import relations.`,
      hint: 'Connect repo-local entities to central systems, interfaces, documents, resources, or dependent repositories so global context packs can span seams.',
      entityId: registryImport.repository,
    }));
}

export async function loadAtlasRegistryConfig(rootPath: string): Promise<{
  config: AtlasRegistryConfig;
  configPath: string;
}> {
  const configPath = path.extname(rootPath)
    ? path.resolve(rootPath)
    : path.resolve(rootPath, 'agent-atlas.registry.yaml');
  const raw = await readFile(configPath, 'utf8');
  const config = parse(raw);
  assertAtlasRegistryConfig(config, configPath);
  return { config, configPath };
}

function annotateImportedEntity(
  entity: AtlasEntity,
  registryImport: AtlasRegistryImport,
  rootPath: string,
): AtlasEntity {
  const relations = [...(entity.relations ?? [])];
  if (
    registryImport.role === 'repository' &&
    registryImport.repository &&
    entity.id !== registryImport.repository &&
    !relations.some(
      (relation) =>
        relation.type === 'part-of' &&
        relation.target === registryImport.repository,
    )
  ) {
    relations.push({
      type: 'part-of',
      target: registryImport.repository,
      summary: `Imported from ${registryImport.id}.`,
      strength: 'inferred',
    });
  }

  return {
    ...entity,
    relations,
    metadata: {
      ...entity.metadata,
      registry: {
        importId: registryImport.id,
        role: registryImport.role,
        rootPath,
        repository: registryImport.repository,
      },
    },
  };
}

function keepFirstGlobalEntityById(
  entities: AtlasEntity[],
  diagnostics: AtlasDiagnostic[],
): AtlasEntity[] {
  const entitiesById = new Map<AtlasEntityId, AtlasEntity>();
  const duplicateIds = new Set<AtlasEntityId>();

  for (const entity of entities) {
    if (entitiesById.has(entity.id)) {
      duplicateIds.add(entity.id);
      continue;
    }
    entitiesById.set(entity.id, entity);
  }

  for (const duplicateId of [...duplicateIds].sort()) {
    diagnostics.push({
      level: 'error',
      code: 'GLOBAL_DUPLICATE_ENTITY_ID',
      message: `Duplicate global entity ID ${duplicateId}.`,
      entityId: duplicateId,
    });
  }

  return [...entitiesById.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function suppressResolvedImportTargetDiagnostics(
  diagnostics: AtlasDiagnostic[],
  globalEntityIds: Set<AtlasEntityId>,
): AtlasDiagnostic[] {
  return diagnostics.filter((diagnostic) => {
    if (diagnostic.code !== 'RELATION_TARGET_MISSING') {
      return true;
    }

    const target = diagnostic.message.match(
      /Relation target ([^ ]+) does not exist\./,
    )?.[1];
    return !target || !globalEntityIds.has(target as AtlasEntityId);
  });
}

function assertAtlasRegistryConfig(
  value: unknown,
  configPath: string,
): asserts value is AtlasRegistryConfig {
  if (!isRecord(value)) {
    throw new Error(`Registry config ${configPath} must be a YAML object.`);
  }

  if (value.version !== 1) {
    throw new Error(`Registry config ${configPath} must use version: 1.`);
  }

  if (!isNonEmptyString(value.name)) {
    throw new Error(`Registry config ${configPath} must include name.`);
  }

  if (!Array.isArray(value.imports) || value.imports.length === 0) {
    throw new Error(
      `Registry config ${configPath} must include at least one import.`,
    );
  }

  for (const [index, registryImport] of value.imports.entries()) {
    if (!isRecord(registryImport)) {
      throw new Error(
        `Registry import ${index + 1} in ${configPath} must be an object.`,
      );
    }

    if (!isNonEmptyString(registryImport.id)) {
      throw new Error(
        `Registry import ${index + 1} in ${configPath} must include id.`,
      );
    }

    if (!isNonEmptyString(registryImport.path)) {
      throw new Error(
        `Registry import ${registryImport.id} in ${configPath} must include path.`,
      );
    }

    if (
      registryImport.role !== 'registry' &&
      registryImport.role !== 'repository'
    ) {
      throw new Error(
        `Registry import ${registryImport.id} in ${configPath} must use role registry or repository.`,
      );
    }

    if (
      'profile' in registryImport &&
      registryImport.profile !== undefined &&
      registryImport.profile !== 'public' &&
      registryImport.profile !== 'private' &&
      registryImport.profile !== 'company'
    ) {
      throw new Error(
        `Registry import ${registryImport.id} in ${configPath} has unknown profile ${String(
          registryImport.profile,
        )}.`,
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
