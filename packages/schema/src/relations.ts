export const ATLAS_RELATION_TYPES = [
  'part-of',
  'contains',
  'owned-by',
  'alias-of',
  'implements',
  'implemented-by',
  'exposes',
  'configured-by',
  'uses',
  'used-by',
  'depends-on',
  'dependency-of',
  'calls',
  'called-by',
  'reads-from',
  'writes-to',
  'syncs-with',
  'derived-from',
  'source-of-truth-for',
  'documented-in',
  'documents',
  'related-to',
  'supersedes',
  'superseded-by',
  'tested-by',
  'verifies',
  'validated-by',
  'requires-secret-scope',
  'requires-permission',
  'accessed-through',
] as const;

export type AtlasRelationType = (typeof ATLAS_RELATION_TYPES)[number];

export const INVERSE_RELATION_TYPES: Partial<Record<AtlasRelationType, AtlasRelationType>> = {
  'part-of': 'contains',
  contains: 'part-of',
  implements: 'implemented-by',
  'implemented-by': 'implements',
  uses: 'used-by',
  'used-by': 'uses',
  'depends-on': 'dependency-of',
  'dependency-of': 'depends-on',
  calls: 'called-by',
  'called-by': 'calls',
  'documented-in': 'documents',
  documents: 'documented-in',
  'tested-by': 'verifies',
  verifies: 'tested-by',
};

export function getInverseRelationType(type: AtlasRelationType): AtlasRelationType | undefined {
  return INVERSE_RELATION_TYPES[type];
}
