import type { AtlasEntity } from '@agent-atlas/schema';

export interface AtlasAdapterContext {
  profile: string;
  repoRoot?: string;
}

export interface AtlasEntityProvider {
  name: string;
  loadEntities(context: AtlasAdapterContext): Promise<AtlasEntity[]>;
}

export interface ExternalResourceResolver {
  name: string;
  canResolve(uri: string): boolean;
  describe(uri: string, context: AtlasAdapterContext): Promise<string>;
}

export interface CodeIndexAdapter {
  name: string;
  resolvePath(path: string, context: AtlasAdapterContext): Promise<AtlasEntity[]>;
  findSymbols?(query: string, context: AtlasAdapterContext): Promise<AtlasEntity[]>;
}
