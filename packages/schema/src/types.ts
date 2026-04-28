import type { AtlasEntityKind } from './kinds.js';
import type { AtlasRelationType } from './relations.js';

export type AtlasEntityId = `${AtlasEntityKind}:${string}`;

export type AtlasVisibility = 'public' | 'private' | 'internal' | 'restricted';
export type AtlasStatus = 'active' | 'planned' | 'experimental' | 'deprecated' | 'archived';
export type AtlasRelationStrength = 'primary' | 'secondary' | 'weak' | 'inferred';

export interface AtlasRelation {
  type: AtlasRelationType;
  target: AtlasEntityId;
  summary?: string;
  strength?: AtlasRelationStrength;
  source?: string;
  visibility?: AtlasVisibility;
}

export interface AtlasAgentHints {
  load_when?: string[];
  avoid_loading_when?: string[];
  token_budget_hint?: number;
  risk_notes?: string[];
}

export interface AtlasCodeReference {
  paths?: string[];
  entrypoints?: string[];
  public_symbols?: string[];
}

export interface AtlasAccessReference {
  method?: 'mcp' | 'url' | 'file' | 'manual' | 'private-overlay';
  server?: string;
  permission?: string;
  private_overlay_required?: boolean;
}

export interface AtlasCommandReference {
  command: string;
  cwd?: string;
  purpose?: string;
}

export interface AtlasEntity {
  id: AtlasEntityId;
  kind: AtlasEntityKind;
  title: string;
  summary: string;
  status?: AtlasStatus;
  visibility?: AtlasVisibility;
  aliases?: string[];
  tags?: string[];
  owners?: string[];
  uri?: string;
  code?: AtlasCodeReference;
  access?: AtlasAccessReference;
  commands?: AtlasCommandReference[];
  relations?: AtlasRelation[];
  agent?: AtlasAgentHints;
  metadata?: Record<string, unknown>;
}

export interface AtlasGraph {
  entities: AtlasEntity[];
}
