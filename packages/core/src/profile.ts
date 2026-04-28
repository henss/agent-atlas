export type AtlasProfile = 'public' | 'private' | 'company';

export function parseAtlasProfile(value: string | undefined): AtlasProfile {
  return value === 'private' || value === 'company' ? value : 'public';
}

export function isPublicVisibility(visibility: string | undefined): boolean {
  return visibility === undefined || visibility === 'public';
}
