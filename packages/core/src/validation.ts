import path from 'node:path';
import type { AtlasEntity, AtlasRelation } from '@agent-atlas/schema';
import {
  ATLAS_ENTITY_KINDS,
  ATLAS_RELATION_TYPES,
  REQUIRED_ENTITY_FIELDS,
  isAtlasEntityKind,
} from '@agent-atlas/schema';
import type { AtlasDiagnostic } from './diagnostics.js';
import { hasErrors } from './diagnostics.js';
import { loadAtlasDocuments } from './loader.js';

export interface AtlasValidationResult {
  rootPath: string;
  entities: AtlasEntity[];
  diagnostics: AtlasDiagnostic[];
  entityCount: number;
  relationCount: number;
  status: 'passed' | 'failed';
}

const ENTITY_ID_PATTERN =
  /^(domain|system|workflow|repository|component|interface|tool|resource|document|dataset|secret-scope|test-scope):[a-z0-9][a-z0-9._/-]*$/;

const PRIVATE_URI_SCHEMES = [
  'notion:',
  'confluence:',
  'jira:',
  'gdrive:',
  'google-drive:',
  'slack:',
  'mailto:',
];

export async function validateAtlas(rootPath: string): Promise<AtlasValidationResult> {
  const absoluteRoot = path.resolve(rootPath);
  const diagnostics: AtlasDiagnostic[] = [];
  const documents = await loadAtlasDocuments(absoluteRoot);
  const entities: AtlasEntity[] = [];
  const entityPaths = new Map<string, string[]>();

  if (documents.length === 0) {
    diagnostics.push({
      level: 'warning',
      code: 'ATLAS_FILES_NOT_FOUND',
      message: 'No .agent-atlas/**/*.yaml files found.',
      path: absoluteRoot,
    });
  }

  for (const document of documents) {
    if (document.parseError) {
      diagnostics.push({
        level: 'error',
        code: 'YAML_PARSE_ERROR',
        message: `Could not parse YAML: ${document.parseError}`,
        path: document.path,
      });
      continue;
    }

    const entity = validateEntityShape(document.data, document.path, diagnostics);
    if (!entity) {
      continue;
    }

    entities.push(entity);
    const paths = entityPaths.get(entity.id) ?? [];
    paths.push(document.path);
    entityPaths.set(entity.id, paths);
  }

  for (const [entityId, paths] of entityPaths.entries()) {
    if (paths.length <= 1) {
      continue;
    }

    for (const duplicatePath of paths) {
      diagnostics.push({
        level: 'error',
        code: 'DUPLICATE_ENTITY_ID',
        message: `Duplicate entity ID ${entityId}.`,
        entityId,
        path: duplicatePath,
      });
    }
  }

  const entityIds = new Set(entities.map((entity) => entity.id));
  for (const entity of entities) {
    validateRelations(entity, entityIds, entityPaths.get(entity.id)?.[0], diagnostics);
    validatePublicProfileSafety(entity, entityPaths.get(entity.id)?.[0], diagnostics);
  }

  return {
    rootPath: absoluteRoot,
    entities,
    diagnostics,
    entityCount: entities.length,
    relationCount: entities.reduce((count, entity) => count + (entity.relations?.length ?? 0), 0),
    status: hasErrors(diagnostics) ? 'failed' : 'passed',
  };
}

function validateEntityShape(
  data: unknown,
  filePath: string,
  diagnostics: AtlasDiagnostic[],
): AtlasEntity | undefined {
  if (!isRecord(data)) {
    diagnostics.push({
      level: 'error',
      code: 'ENTITY_NOT_OBJECT',
      message: 'Entity file must contain a YAML object.',
      path: filePath,
    });
    return undefined;
  }

  for (const field of REQUIRED_ENTITY_FIELDS) {
    if (!isNonEmptyString(data[field])) {
      diagnostics.push({
        level: 'error',
        code: 'REQUIRED_FIELD_MISSING',
        message: `Required field ${field} is missing or empty.`,
        entityId: isString(data.id) ? data.id : undefined,
        path: filePath,
      });
    }
  }

  const id = isString(data.id) ? data.id : undefined;
  const kind = isString(data.kind) ? data.kind : undefined;

  if (id && !ENTITY_ID_PATTERN.test(id)) {
    diagnostics.push({
      level: 'error',
      code: 'ENTITY_ID_INVALID',
      message: `Entity ID ${id} must use <kind>:<slug> with a known kind and lowercase slug.`,
      entityId: id,
      path: filePath,
    });
  }

  if (kind && !isAtlasEntityKind(kind)) {
    diagnostics.push({
      level: 'error',
      code: 'ENTITY_KIND_UNKNOWN',
      message: `Entity kind ${kind} is not one of ${ATLAS_ENTITY_KINDS.join(', ')}.`,
      entityId: id,
      path: filePath,
    });
  }

  if (id && kind) {
    const idKind = id.split(':', 1)[0];
    if (idKind !== kind) {
      diagnostics.push({
        level: 'error',
        code: 'ENTITY_KIND_MISMATCH',
        message: `Entity kind ${kind} does not match ID prefix ${idKind}.`,
        entityId: id,
        path: filePath,
      });
    }
  }

  if (Array.isArray(data.relations)) {
    data.relations.forEach((relation, index) => {
      validateRelationShape(relation, index, id, filePath, diagnostics);
    });
  } else if ('relations' in data && data.relations !== undefined) {
    diagnostics.push({
      level: 'error',
      code: 'RELATIONS_INVALID',
      message: 'Relations must be an array.',
      entityId: id,
      path: filePath,
    });
  }

  if (!id || !kind || !isAtlasEntityKind(kind)) {
    return undefined;
  }

  return data as unknown as AtlasEntity;
}

function validateRelationShape(
  relation: unknown,
  index: number,
  entityId: string | undefined,
  filePath: string,
  diagnostics: AtlasDiagnostic[],
): void {
  if (!isRecord(relation)) {
    diagnostics.push({
      level: 'error',
      code: 'RELATION_INVALID',
      message: `Relation ${index + 1} must be an object.`,
      entityId,
      path: filePath,
    });
    return;
  }

  if (!isNonEmptyString(relation.type)) {
    diagnostics.push({
      level: 'error',
      code: 'RELATION_TYPE_MISSING',
      message: `Relation ${index + 1} is missing type.`,
      entityId,
      path: filePath,
    });
  }

  if (!isNonEmptyString(relation.target)) {
    diagnostics.push({
      level: 'error',
      code: 'RELATION_TARGET_MISSING',
      message: `Relation ${index + 1} is missing target.`,
      entityId,
      path: filePath,
    });
  }
}

function validateRelations(
  entity: AtlasEntity,
  entityIds: Set<string>,
  filePath: string | undefined,
  diagnostics: AtlasDiagnostic[],
): void {
  for (const relation of entity.relations ?? []) {
    if (!isKnownRelation(relation)) {
      diagnostics.push({
        level: 'error',
        code: 'RELATION_TYPE_UNKNOWN',
        message: `Relation type ${String(relation.type)} is not known.`,
        entityId: entity.id,
        path: filePath,
      });
    }

    if (isNonEmptyString(relation.target) && !entityIds.has(relation.target)) {
      diagnostics.push({
        level: 'error',
        code: 'RELATION_TARGET_MISSING',
        message: `Relation target ${relation.target} does not exist.`,
        entityId: entity.id,
        path: filePath,
      });
    }
  }
}

function validatePublicProfileSafety(
  entity: AtlasEntity,
  filePath: string | undefined,
  diagnostics: AtlasDiagnostic[],
): void {
  const normalizedPath = filePath ? filePath.replaceAll('\\', '/') : '';
  const inPublicProfile = normalizedPath.includes('/.agent-atlas/public/');
  const publicEntity = entity.visibility === undefined || entity.visibility === 'public';

  if (inPublicProfile && entity.visibility && entity.visibility !== 'public') {
    diagnostics.push({
      level: 'warning',
      code: 'PUBLIC_PROFILE_NON_PUBLIC_VISIBILITY',
      message: `Public profile entity has visibility ${entity.visibility}.`,
      entityId: entity.id,
      path: filePath,
    });
  }

  if (!inPublicProfile && !publicEntity) {
    return;
  }

  if (entity.uri && hasPrivateUri(entity.uri)) {
    diagnostics.push({
      level: 'warning',
      code: 'PUBLIC_PROFILE_PRIVATE_URI',
      message: `Public entity URI ${entity.uri} should be moved to a private overlay or replaced with an alias.`,
      entityId: entity.id,
      path: filePath,
    });
  }
}

function hasPrivateUri(uri: string): boolean {
  const lowerUri = uri.toLowerCase();
  return (
    PRIVATE_URI_SCHEMES.some((scheme) => lowerUri.startsWith(scheme)) ||
    lowerUri.includes('localhost') ||
    /^https?:\/\/(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(lowerUri)
  );
}

function isKnownRelation(relation: AtlasRelation): boolean {
  return (ATLAS_RELATION_TYPES as readonly string[]).includes(String(relation.type));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
