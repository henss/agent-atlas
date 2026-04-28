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
