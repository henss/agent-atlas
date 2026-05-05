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
import type { AtlasProfile } from './profile.js';

export interface AtlasValidationResult {
  rootPath: string;
  profile: AtlasProfile;
  entities: AtlasEntity[];
  diagnostics: AtlasDiagnostic[];
  entityCount: number;
  relationCount: number;
  status: 'passed' | 'failed';
}

export interface AtlasValidationOptions {
  profile?: AtlasProfile;
  includeYamlRoot?: boolean;
}

interface ParsedAtlasDocument {
  entity: AtlasEntity;
  path: string;
  source: AtlasDocumentSource;
}

interface AtlasDocumentSource {
  kind: 'public' | 'overlay';
  profile?: AtlasProfile | 'generated' | 'unknown';
}

const ENTITY_ID_PATTERN =
  /^(domain|system|workflow|repository|component|capability|interface|tool|resource|document|dataset|secret-scope|test-scope):[a-z0-9][a-z0-9._/-]*$/;

const PRIVATE_URI_SCHEMES = [
  'notion:',
  'confluence:',
  'jira:',
  'gdrive:',
  'google-drive:',
  'slack:',
  'gcal:',
  'mailto:',
];

export async function validateAtlas(
  rootPath: string,
  options: AtlasValidationOptions = {},
): Promise<AtlasValidationResult> {
  const absoluteRoot = path.resolve(rootPath);
  const profile = options.profile ?? 'public';
  const diagnostics: AtlasDiagnostic[] = [];
  const documents = await loadAtlasDocuments(absoluteRoot, {
    includeYamlRoot: options.includeYamlRoot,
  });
  const baseDocuments: ParsedAtlasDocument[] = [];
  const overlayDocuments: ParsedAtlasDocument[] = [];

  if (documents.length === 0) {
    diagnostics.push({
      level: 'warning',
      code: 'ATLAS_FILES_NOT_FOUND',
      message: 'No .agent-atlas/**/*.yaml files found.',
      hint: 'Create .agent-atlas/public/<kind>/<id>.yaml files or pass the intended atlas root path.',
      path: absoluteRoot,
    });
  }

  for (const document of documents) {
    if (document.parseError) {
      diagnostics.push({
        level: 'error',
        code: 'YAML_PARSE_ERROR',
        message: `Could not parse YAML: ${document.parseError}`,
        hint: 'Fix YAML indentation, quoting, or list syntax in this file.',
        path: document.path,
      });
      continue;
    }

    const source = getDocumentSource(document.path);
    if (source.kind === 'overlay' && source.profile === 'unknown') {
      diagnostics.push({
        level: 'error',
        code: 'OVERLAY_PROFILE_UNKNOWN',
        message:
          'Overlay path must use private, private.local, company, or generated.',
        hint: 'Move this file under .agent-atlas/overlays/private, .agent-atlas/overlays/private.local, .agent-atlas/overlays/company, or .agent-atlas/overlays/generated.',
        path: document.path,
      });
      continue;
    }

    if (source.kind === 'overlay' && !isOverlayIncluded(source, profile)) {
      continue;
    }

    const entity =
      source.kind === 'overlay'
        ? validateOverlayShape(document.data, document.path, diagnostics)
        : validateEntityShape(document.data, document.path, diagnostics);
    if (!entity) {
      continue;
    }

    const parsedDocument = { entity, path: document.path, source };
    if (source.kind === 'overlay') {
      overlayDocuments.push(parsedDocument);
    } else {
      baseDocuments.push(parsedDocument);
    }
  }

  const basePathsById = collectPathsByEntityId(baseDocuments);
  for (const [entityId, paths] of basePathsById.entries()) {
    if (paths.length <= 1) {
      continue;
    }

    for (const duplicatePath of paths) {
      diagnostics.push({
        level: 'error',
        code: 'DUPLICATE_ENTITY_ID',
        message: `Duplicate entity ID ${entityId}.`,
        hint: 'Keep one canonical entity file per ID, or convert extra files into overlays.',
        entityId,
        path: duplicatePath,
      });
    }
  }

  const entities = mergeOverlayDocuments(
    baseDocuments,
    overlayDocuments,
    diagnostics,
  );
  const entityPaths = collectPathsByEntityId([
    ...baseDocuments,
    ...overlayDocuments,
  ]);
  const entityIds = new Set(entities.map((entity) => entity.id));
  for (const entity of entities) {
    validateRelations(
      entity,
      entityIds,
      entityPaths.get(entity.id)?.[0],
      diagnostics,
    );
    validatePublicProfileSafety(
      entity,
      entityPaths.get(entity.id)?.[0],
      profile,
      diagnostics,
    );
  }

  return {
    rootPath: absoluteRoot,
    profile,
    entities,
    diagnostics,
    entityCount: entities.length,
    relationCount: entities.reduce(
      (count, entity) => count + (entity.relations?.length ?? 0),
      0,
    ),
    status: hasErrors(diagnostics) ? 'failed' : 'passed',
  };
}

function validateOverlayShape(
  data: unknown,
  filePath: string,
  diagnostics: AtlasDiagnostic[],
): AtlasEntity | undefined {
  if (!isRecord(data)) {
    diagnostics.push({
      level: 'error',
      code: 'ENTITY_NOT_OBJECT',
      message: 'Overlay file must contain a YAML object.',
      hint: 'Use a top-level mapping with at least an id field.',
      path: filePath,
    });
    return undefined;
  }

  if (!isNonEmptyString(data.id)) {
    diagnostics.push({
      level: 'error',
      code: 'REQUIRED_FIELD_MISSING',
      message: 'Required field id is missing or empty.',
      hint: 'Add an id using <kind>:<slug>, for example component:example.',
      path: filePath,
    });
    return undefined;
  }

  const id = data.id;
  if (
    'schema_version' in data &&
    data.schema_version !== undefined &&
    data.schema_version !== 1
  ) {
    diagnostics.push({
      level: 'error',
      code: 'SCHEMA_VERSION_UNSUPPORTED',
      message: `Schema version ${String(data.schema_version)} is not supported.`,
      hint: 'Use schema_version: 1 or run atlas migrate --to 1.',
      entityId: id,
      path: filePath,
    });
  }

  if (!ENTITY_ID_PATTERN.test(id)) {
    diagnostics.push({
      level: 'error',
      code: 'ENTITY_ID_INVALID',
      message: `Entity ID ${id} must use <kind>:<slug> with a known kind and lowercase slug.`,
      hint: 'Use lowercase URL-safe IDs such as workflow:plan-week or component:calendar-adapter.',
      entityId: id,
      path: filePath,
    });
  }

  if ('kind' in data && data.kind !== undefined) {
    const kind = isString(data.kind) ? data.kind : undefined;
    if (!kind || !isAtlasEntityKind(kind)) {
      diagnostics.push({
        level: 'error',
        code: 'ENTITY_KIND_UNKNOWN',
        message: `Entity kind ${String(data.kind)} is not one of ${ATLAS_ENTITY_KINDS.join(', ')}.`,
        hint: 'Choose one of the documented entity kinds or change the ID prefix to match.',
        entityId: id,
        path: filePath,
      });
    } else if (id.split(':', 1)[0] !== kind) {
      diagnostics.push({
        level: 'error',
        code: 'ENTITY_KIND_MISMATCH',
        message: `Entity kind ${kind} does not match ID prefix ${id.split(':', 1)[0]}.`,
        hint: 'Make kind match the ID prefix, for example id component:x with kind component.',
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
      hint: 'Use relations: [] or a YAML list of relation objects.',
      entityId: id,
      path: filePath,
    });
  }

  return data as unknown as AtlasEntity;
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
      hint: 'Use a top-level mapping with id, kind, title, and summary fields.',
      path: filePath,
    });
    return undefined;
  }

  const id = isString(data.id) ? data.id : undefined;
  const kind = isString(data.kind) ? data.kind : undefined;

  for (const field of REQUIRED_ENTITY_FIELDS) {
    if (!isNonEmptyString(data[field])) {
      diagnostics.push({
        level: 'error',
        code: 'REQUIRED_FIELD_MISSING',
        message: `Required field ${field} is missing or empty.`,
        hint: 'Every entity requires id, kind, title, and summary.',
        entityId: id,
        path: filePath,
      });
    }
  }

  if (
    'schema_version' in data &&
    data.schema_version !== undefined &&
    data.schema_version !== 1
  ) {
    diagnostics.push({
      level: 'error',
      code: 'SCHEMA_VERSION_UNSUPPORTED',
      message: `Schema version ${String(data.schema_version)} is not supported.`,
      hint: 'Use schema_version: 1 or run atlas migrate --to 1.',
      entityId: id,
      path: filePath,
    });
  }

  if (id && !ENTITY_ID_PATTERN.test(id)) {
    diagnostics.push({
      level: 'error',
      code: 'ENTITY_ID_INVALID',
      message: `Entity ID ${id} must use <kind>:<slug> with a known kind and lowercase slug.`,
      hint: 'Use lowercase URL-safe IDs such as workflow:plan-week or component:calendar-adapter.',
      entityId: id,
      path: filePath,
    });
  }

  if (kind && !isAtlasEntityKind(kind)) {
    diagnostics.push({
      level: 'error',
      code: 'ENTITY_KIND_UNKNOWN',
      message: `Entity kind ${kind} is not one of ${ATLAS_ENTITY_KINDS.join(', ')}.`,
      hint: 'Choose one of the documented entity kinds or change the ID prefix to match.',
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
        hint: 'Make kind match the ID prefix, for example id component:x with kind component.',
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
      hint: 'Use relations: [] or a YAML list of relation objects.',
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
      hint: 'Use relation entries like { type: uses, target: component:example }.',
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
      hint: 'Add a known relation type such as uses, implements, documented-in, or tested-by.',
      entityId,
      path: filePath,
    });
  }

  if (!isNonEmptyString(relation.target)) {
    diagnostics.push({
      level: 'error',
      code: 'RELATION_TARGET_MISSING',
      message: `Relation ${index + 1} is missing target.`,
      hint: 'Add a target entity ID such as component:example.',
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
        hint: 'Use a relation from docs/spec/relations.md, or add the relation type to the schema first.',
        entityId: entity.id,
        path: filePath,
      });
    }

    if (isNonEmptyString(relation.target) && !entityIds.has(relation.target)) {
      diagnostics.push({
        level: 'error',
        code: 'RELATION_TARGET_MISSING',
        message: `Relation target ${relation.target} does not exist.`,
        hint: 'Create the target entity, fix the target ID, or move cross-repo references into a global registry.',
        entityId: entity.id,
        path: filePath,
      });
    }
  }
}

function validatePublicProfileSafety(
  entity: AtlasEntity,
  filePath: string | undefined,
  profile: AtlasProfile,
  diagnostics: AtlasDiagnostic[],
): void {
  if (profile !== 'public') {
    return;
  }

  const normalizedPath = filePath ? filePath.replaceAll('\\', '/') : '';
  const inPublicProfile = normalizedPath.includes('/.agent-atlas/public/');
  const publicEntity =
    entity.visibility === undefined || entity.visibility === 'public';

  if (inPublicProfile && entity.visibility && entity.visibility !== 'public') {
    diagnostics.push({
      level: 'warning',
      code: 'PUBLIC_PROFILE_NON_PUBLIC_VISIBILITY',
      message: `Public profile entity has visibility ${entity.visibility}.`,
      hint: 'Move this entity to an overlay or make the public file a safe placeholder.',
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
      hint: 'Use access.private_overlay_required in public files and put the concrete URI in a private/company overlay.',
      entityId: entity.id,
      path: filePath,
    });
  }
}

function mergeOverlayDocuments(
  baseDocuments: ParsedAtlasDocument[],
  overlayDocuments: ParsedAtlasDocument[],
  diagnostics: AtlasDiagnostic[],
): AtlasEntity[] {
  const entitiesById = new Map<string, AtlasEntity>();

  for (const document of baseDocuments) {
    if (!entitiesById.has(document.entity.id)) {
      entitiesById.set(document.entity.id, cloneEntity(document.entity));
    }
  }

  for (const overlayDocument of overlayDocuments) {
    const base = entitiesById.get(overlayDocument.entity.id);
    if (!base) {
      diagnostics.push({
        level: 'error',
        code: 'OVERLAY_BASE_MISSING',
        message: `Overlay entity ${overlayDocument.entity.id} has no base entity.`,
        hint: 'Create a public base entity with the same id before adding overlay fields.',
        entityId: overlayDocument.entity.id,
        path: overlayDocument.path,
      });
      continue;
    }

    const baseKind = base.id.split(':', 1)[0];
    if (
      overlayDocument.entity.kind &&
      overlayDocument.entity.kind !== baseKind
    ) {
      diagnostics.push({
        level: 'error',
        code: 'OVERLAY_KIND_CONFLICT',
        message: `Overlay kind ${overlayDocument.entity.kind} conflicts with base kind ${baseKind}.`,
        hint: 'Remove kind from the overlay or make it match the base entity kind.',
        entityId: overlayDocument.entity.id,
        path: overlayDocument.path,
      });
      continue;
    }

    mergeEntityOverlay(
      base,
      overlayDocument.entity,
      overlayDocument.path,
      diagnostics,
    );
  }

  return [...entitiesById.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function mergeEntityOverlay(
  base: AtlasEntity,
  overlay: AtlasEntity,
  filePath: string,
  diagnostics: AtlasDiagnostic[],
): void {
  base.title = overlay.title ?? base.title;
  base.summary = overlay.summary ?? base.summary;
  base.status = overlay.status ?? base.status;
  base.visibility = overlay.visibility ?? base.visibility;
  base.uri = overlay.uri ?? base.uri;

  base.aliases = mergeStringArrays(base.aliases, overlay.aliases);
  base.tags = mergeStringArrays(base.tags, overlay.tags);
  base.owners = mergeStringArrays(base.owners, overlay.owners);
  base.code = mergeCode(base.code, overlay.code);
  base.access = overlay.access
    ? { ...base.access, ...overlay.access }
    : base.access;
  base.commands = mergeCommands(base.commands, overlay.commands);
  base.relations = mergeRelations(
    base,
    overlay.relations,
    filePath,
    diagnostics,
  );
  base.agent = mergeAgent(base.agent, overlay.agent);
  base.metadata = overlay.metadata
    ? { ...base.metadata, ...overlay.metadata }
    : base.metadata;
}

function mergeRelations(
  base: AtlasEntity,
  overlayRelations: AtlasRelation[] | undefined,
  filePath: string,
  diagnostics: AtlasDiagnostic[],
): AtlasRelation[] | undefined {
  const relations = [...(base.relations ?? [])];
  const keys = new Set(relations.map(relationKey));

  for (const relation of overlayRelations ?? []) {
    const key = relationKey(relation);
    if (keys.has(key)) {
      diagnostics.push({
        level: 'warning',
        code: 'OVERLAY_DUPLICATE_RELATION',
        message: `Overlay relation ${relation.type} -> ${relation.target} already exists.`,
        hint: 'Remove the duplicate overlay relation unless it intentionally differs by visibility.',
        entityId: base.id,
        path: filePath,
      });
      continue;
    }

    keys.add(key);
    relations.push(relation);
  }

  return relations.length > 0 ? relations : undefined;
}

function mergeCode(
  base: AtlasEntity['code'],
  overlay: AtlasEntity['code'],
): AtlasEntity['code'] {
  if (!overlay) {
    return base;
  }

  return {
    paths: mergeStringArrays(base?.paths, overlay.paths),
    entrypoints: mergeStringArrays(base?.entrypoints, overlay.entrypoints),
    public_symbols: mergeStringArrays(
      base?.public_symbols,
      overlay.public_symbols,
    ),
  };
}

function mergeAgent(
  base: AtlasEntity['agent'],
  overlay: AtlasEntity['agent'],
): AtlasEntity['agent'] {
  if (!overlay) {
    return base;
  }

  return {
    load_when: mergeStringArrays(base?.load_when, overlay.load_when),
    avoid_loading_when: mergeStringArrays(
      base?.avoid_loading_when,
      overlay.avoid_loading_when,
    ),
    token_budget_hint: overlay.token_budget_hint ?? base?.token_budget_hint,
    risk_notes: mergeStringArrays(base?.risk_notes, overlay.risk_notes),
  };
}

function mergeCommands(
  base: AtlasEntity['commands'],
  overlay: AtlasEntity['commands'],
): AtlasEntity['commands'] {
  const commands = new Map<
    string,
    NonNullable<AtlasEntity['commands']>[number]
  >();
  for (const command of [...(base ?? []), ...(overlay ?? [])]) {
    commands.set(`${command.cwd ?? ''}|${command.command}`, command);
  }
  return commands.size > 0 ? [...commands.values()] : undefined;
}

function mergeStringArrays(
  base: string[] | undefined,
  overlay: string[] | undefined,
): string[] | undefined {
  const values = [...new Set([...(base ?? []), ...(overlay ?? [])])];
  return values.length > 0 ? values : undefined;
}

function relationKey(relation: AtlasRelation): string {
  return `${relation.type}|${relation.target}|${relation.visibility ?? ''}`;
}

function collectPathsByEntityId(
  documents: ParsedAtlasDocument[],
): Map<string, string[]> {
  const pathsById = new Map<string, string[]>();
  for (const document of documents) {
    const paths = pathsById.get(document.entity.id) ?? [];
    paths.push(document.path);
    pathsById.set(document.entity.id, paths);
  }
  return pathsById;
}

function getDocumentSource(filePath: string): AtlasDocumentSource {
  const normalizedPath = filePath.replaceAll('\\', '/');
  const overlayMatch = normalizedPath.match(
    /\/\.agent-atlas\/overlays\/([^/]+)\//,
  );
  if (!overlayMatch) {
    return { kind: 'public' };
  }

  const profileName = overlayMatch[1] ?? '';
  if (profileName === 'private' || profileName === 'private.local') {
    return { kind: 'overlay', profile: 'private' };
  }
  if (profileName === 'company') {
    return { kind: 'overlay', profile: 'company' };
  }
  if (profileName === 'generated') {
    return { kind: 'overlay', profile: 'generated' };
  }
  return { kind: 'overlay', profile: 'unknown' };
}

function isOverlayIncluded(
  source: AtlasDocumentSource,
  profile: AtlasProfile,
): boolean {
  if (source.kind !== 'overlay') {
    return true;
  }

  if (source.profile === 'generated') {
    return profile !== 'public';
  }

  return source.profile === profile;
}

function cloneEntity(entity: AtlasEntity): AtlasEntity {
  return {
    ...entity,
    aliases: entity.aliases ? [...entity.aliases] : undefined,
    tags: entity.tags ? [...entity.tags] : undefined,
    owners: entity.owners ? [...entity.owners] : undefined,
    code: entity.code
      ? {
          paths: entity.code.paths ? [...entity.code.paths] : undefined,
          entrypoints: entity.code.entrypoints
            ? [...entity.code.entrypoints]
            : undefined,
          public_symbols: entity.code.public_symbols
            ? [...entity.code.public_symbols]
            : undefined,
        }
      : undefined,
    access: entity.access ? { ...entity.access } : undefined,
    commands: entity.commands
      ? entity.commands.map((command) => ({ ...command }))
      : undefined,
    relations: entity.relations
      ? entity.relations.map((relation) => ({ ...relation }))
      : undefined,
    agent: entity.agent
      ? {
          ...entity.agent,
          load_when: entity.agent.load_when
            ? [...entity.agent.load_when]
            : undefined,
          avoid_loading_when: entity.agent.avoid_loading_when
            ? [...entity.agent.avoid_loading_when]
            : undefined,
          risk_notes: entity.agent.risk_notes
            ? [...entity.agent.risk_notes]
            : undefined,
        }
      : undefined,
    metadata: entity.metadata ? { ...entity.metadata } : undefined,
  };
}

function hasPrivateUri(uri: string): boolean {
  const lowerUri = uri.toLowerCase();
  return (
    PRIVATE_URI_SCHEMES.some((scheme) => lowerUri.startsWith(scheme)) ||
    lowerUri.includes('localhost') ||
    /^https?:\/\/(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(
      lowerUri,
    )
  );
}

function isKnownRelation(relation: AtlasRelation): boolean {
  return (ATLAS_RELATION_TYPES as readonly string[]).includes(
    String(relation.type),
  );
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
