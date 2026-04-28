import { readFile } from 'node:fs/promises';
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
  entityCount: number;
  relationCount: number;
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

  for (const registryImport of config.imports) {
    const importRoot = path.resolve(configDirectory, registryImport.path);
    const profile = registryImport.profile ?? options.profile ?? 'company';
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
      entityCount: entities.length,
      relationCount: entities.reduce(
        (count, entity) => count + (entity.relations?.length ?? 0),
        0,
      ),
    });
  }

  const entities = keepFirstGlobalEntityById(importedEntities, diagnostics);
  const entityIds = new Set(entities.map((entity) => entity.id));
  const filteredDiagnostics = suppressResolvedImportTargetDiagnostics(
    diagnostics,
    entityIds,
  );
  const edges = normalizeGraphEdges(entities);
  const index = createGraphIndex(entities, edges);

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
