import type {
  AtlasDiagnostic,
  AtlasGraphEdge,
  AtlasOverview,
  AtlasProfile,
  ContextPack,
  PathResolutionResult,
} from '@agent-atlas/core';
import type { AtlasEntity, AtlasEntityId, AtlasRelationType } from '@agent-atlas/schema';

export interface AtlasMetadataDebug {
  lastUpdated?: string;
  provenance?: string;
  confidence?: number;
  discoveredBy?: string;
  source?: string;
  reviewStatus?: string;
  raw?: Record<string, unknown>;
}

export interface AtlasUiSummary {
  rootPath: string;
  profile: AtlasProfile;
  entityCount: number;
  edgeCount: number;
  explicitEdgeCount: number;
  generatedEdgeCount: number;
  diagnostics: AtlasDiagnostic[];
  diagnosticCounts: Record<AtlasDiagnostic['level'], number>;
  metadataKeyCounts: Record<string, number>;
  entities: AtlasEntity[];
  edges: AtlasGraphEdge[];
}

export type AtlasUiOverview = AtlasOverview;

export interface AtlasUiEntityDetails {
  entity: AtlasEntity;
  outgoing: AtlasGraphEdge[];
  incoming: AtlasGraphEdge[];
  diagnostics: AtlasDiagnostic[];
  metadataDebug: AtlasMetadataDebug;
}

export interface AtlasUiNeighborhood {
  entityId: AtlasEntityId;
  depth: number;
  truncated: boolean;
  nodeLimit: number;
  nodes: AtlasEntity[];
  edges: AtlasGraphEdge[];
}

export interface AtlasUiHealth {
  status: 'ok';
  rootPath: string;
  profile: AtlasProfile;
  entityCount: number;
  diagnosticCounts: Record<AtlasDiagnostic['level'], number>;
  version: 1;
}

export interface AtlasUiContextPackRequest {
  task: string;
  budget?: number;
}

export interface AtlasUiContextPackResponse extends ContextPack {
  diagnostics: AtlasDiagnostic[];
}

export interface AtlasUiResolvePathResponse extends PathResolutionResult {
  diagnostics: AtlasDiagnostic[];
}

export type AtlasUiRelationFilter = AtlasRelationType | 'all';
