export interface AtlasMcpServerOptions {
  atlasRoot: string;
  profile?: string;
}

export function createAtlasMcpServerPlaceholder(options: AtlasMcpServerOptions): string {
  return `MCP server not implemented yet. atlasRoot=${options.atlasRoot}, profile=${options.profile ?? 'public'}`;
}
