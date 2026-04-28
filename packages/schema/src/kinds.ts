export const ATLAS_ENTITY_KINDS = [
  'domain',
  'system',
  'workflow',
  'repository',
  'component',
  'interface',
  'tool',
  'resource',
  'document',
  'dataset',
  'secret-scope',
  'test-scope',
] as const;

export type AtlasEntityKind = (typeof ATLAS_ENTITY_KINDS)[number];

export function isAtlasEntityKind(value: string): value is AtlasEntityKind {
  return (ATLAS_ENTITY_KINDS as readonly string[]).includes(value);
}

export const REQUIRED_ENTITY_FIELDS = ['id', 'kind', 'title', 'summary'] as const;

export const REQUIRED_FIELDS_BY_KIND: Record<AtlasEntityKind, readonly string[]> = {
  domain: REQUIRED_ENTITY_FIELDS,
  system: REQUIRED_ENTITY_FIELDS,
  workflow: REQUIRED_ENTITY_FIELDS,
  repository: REQUIRED_ENTITY_FIELDS,
  component: REQUIRED_ENTITY_FIELDS,
  interface: REQUIRED_ENTITY_FIELDS,
  tool: REQUIRED_ENTITY_FIELDS,
  resource: REQUIRED_ENTITY_FIELDS,
  document: REQUIRED_ENTITY_FIELDS,
  dataset: REQUIRED_ENTITY_FIELDS,
  'secret-scope': REQUIRED_ENTITY_FIELDS,
  'test-scope': REQUIRED_ENTITY_FIELDS,
};
