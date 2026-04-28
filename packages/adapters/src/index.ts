import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type {
  AtlasEntity,
  AtlasEntityId,
  AtlasRelation,
} from "@agent-atlas/schema";

export type AtlasAdapterProfile =
  | "public"
  | "private"
  | "company"
  | (string & {});

export interface AtlasAdapterContext {
  profile: AtlasAdapterProfile;
  repoRoot?: string;
}

export interface AtlasAdapterDiagnostic {
  severity: "info" | "warning" | "error";
  message: string;
  source?: string;
}

export interface AtlasAdapterResult {
  entities?: AtlasEntity[];
  relations?: AtlasRelationContribution[];
  resources?: ExternalResourceReference[];
  diagnostics?: AtlasAdapterDiagnostic[];
}

export interface AtlasRelationContribution {
  source: AtlasEntityId;
  relation: AtlasRelation;
}

export interface AtlasAdapter {
  name: string;
  load(context: AtlasAdapterContext): Promise<AtlasAdapterResult>;
}

export interface AtlasEntityProvider {
  name: string;
  loadEntities(context: AtlasAdapterContext): Promise<AtlasEntity[]>;
}

export interface CodeIndexPathMatch {
  entityId?: AtlasEntityId;
  path: string;
  title?: string;
  summary?: string;
  uri?: string;
  confidence: number;
  source: string;
}

export interface CodeIndexSymbolMatch {
  symbol: string;
  path?: string;
  uri?: string;
  summary?: string;
  confidence: number;
  source: string;
}

export interface CodeIndexTextMatch {
  query: string;
  path?: string;
  uri?: string;
  summary?: string;
  confidence: number;
  source: string;
}

export interface CodeIndexAdapter {
  name: string;
  resolvePath(
    filePath: string,
    context: AtlasAdapterContext,
  ): Promise<CodeIndexPathMatch[]>;
  findSymbols?(
    query: string,
    context: AtlasAdapterContext,
  ): Promise<CodeIndexSymbolMatch[]>;
  searchText?(
    query: string,
    context: AtlasAdapterContext,
  ): Promise<CodeIndexTextMatch[]>;
}

export interface DeveloperPortalEntity {
  id: AtlasEntityId;
  title: string;
  summary: string;
  kind: AtlasEntity["kind"];
  uri?: string;
  owners?: string[];
  tags?: string[];
  relations?: AtlasRelation[];
  metadata?: Record<string, unknown>;
}

export interface DeveloperPortalAdapter {
  name: string;
  listEntities(context: AtlasAdapterContext): Promise<DeveloperPortalEntity[]>;
  getEntity?(
    id: AtlasEntityId,
    context: AtlasAdapterContext,
  ): Promise<DeveloperPortalEntity | undefined>;
}

export interface ExternalResourceReference {
  uri: string;
  title: string;
  summary: string;
  source: string;
  visibility?: AtlasEntity["visibility"];
  access?: AtlasEntity["access"];
  metadata?: Record<string, unknown>;
}

export interface ExternalResourceResolver {
  name: string;
  canResolve(uri: string): boolean;
  describe(
    uri: string,
    context: AtlasAdapterContext,
  ): Promise<ExternalResourceReference>;
}

export interface BackstageCatalogEntity {
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    title?: string;
    description?: string;
    tags?: string[];
    annotations?: Record<string, string>;
  };
  spec?: {
    type?: string;
    owner?: string;
    system?: string;
    lifecycle?: string;
    dependsOn?: string[];
    providesApis?: string[];
    consumesApis?: string[];
  };
}

export interface BackstageAdapterOptions {
  catalog: BackstageCatalogEntity[] | (() => Promise<BackstageCatalogEntity[]>);
  source?: string;
}

export class BackstageAdapter implements DeveloperPortalAdapter, AtlasAdapter {
  readonly name = "backstage";

  constructor(private readonly options: BackstageAdapterOptions) {}

  async listEntities(
    _context?: AtlasAdapterContext,
  ): Promise<DeveloperPortalEntity[]> {
    const catalog = await this.loadCatalog();
    return catalog.map((entity) =>
      backstageEntityToDeveloperPortalEntity(entity, this.options.source),
    );
  }

  async getEntity(
    id: AtlasEntityId,
    context?: AtlasAdapterContext,
  ): Promise<DeveloperPortalEntity | undefined> {
    const entities = await this.listEntities(context);
    return entities.find((entity) => entity.id === id);
  }

  async load(context: AtlasAdapterContext): Promise<AtlasAdapterResult> {
    const entities = (await this.listEntities(context)).map(
      portalEntityToAtlasEntity,
    );
    return { entities };
  }

  private async loadCatalog(): Promise<BackstageCatalogEntity[]> {
    return typeof this.options.catalog === "function"
      ? this.options.catalog()
      : this.options.catalog;
  }
}

export interface SourcegraphAdapterOptions {
  baseUrl: string;
  repository: string;
}

export class SourcegraphAdapter implements CodeIndexAdapter {
  readonly name = "sourcegraph";

  constructor(private readonly options: SourcegraphAdapterOptions) {}

  async resolvePath(
    filePath: string,
    _context?: AtlasAdapterContext,
  ): Promise<CodeIndexPathMatch[]> {
    const normalizedPath = normalizePath(filePath);
    return [
      {
        path: normalizedPath,
        title: normalizedPath,
        summary: `Sourcegraph reference for ${normalizedPath}.`,
        uri: this.sourcegraphFileUrl(normalizedPath),
        confidence: 0.7,
        source: this.name,
      },
    ];
  }

  async findSymbols(
    query: string,
    _context?: AtlasAdapterContext,
  ): Promise<CodeIndexSymbolMatch[]> {
    return [
      {
        symbol: query,
        uri: this.sourcegraphSearchUrl(
          `repo:${this.options.repository} symbol:${quoteSearch(query)}`,
        ),
        summary: `Sourcegraph symbol search for ${query}.`,
        confidence: 0.5,
        source: this.name,
      },
    ];
  }

  async searchText(
    query: string,
    _context?: AtlasAdapterContext,
  ): Promise<CodeIndexTextMatch[]> {
    return [
      {
        query,
        uri: this.sourcegraphSearchUrl(
          `repo:${this.options.repository} ${quoteSearch(query)}`,
        ),
        summary: `Sourcegraph text search for ${query}.`,
        confidence: 0.4,
        source: this.name,
      },
    ];
  }

  private sourcegraphFileUrl(filePath: string): string {
    const baseUrl = this.options.baseUrl.replace(/\/+$/, "");
    return `${baseUrl}/${encodeURIComponent(this.options.repository)}/-/blob/${encodePathParts(filePath)}`;
  }

  private sourcegraphSearchUrl(query: string): string {
    const baseUrl = this.options.baseUrl.replace(/\/+$/, "");
    return `${baseUrl}/search?q=${encodeURIComponent(query)}`;
  }
}

export interface LocalDocsAdapterOptions {
  rootDir: string;
  idPrefix?: string;
  titlePrefix?: string;
  include?: string[];
}

export class LocalDocsAdapter
  implements AtlasAdapter, ExternalResourceResolver
{
  readonly name = "local-docs";

  constructor(private readonly options: LocalDocsAdapterOptions) {}

  canResolve(uri: string): boolean {
    return uri.startsWith("file:") || uri.startsWith("docs:");
  }

  async describe(
    uri: string,
    context: AtlasAdapterContext,
  ): Promise<ExternalResourceReference> {
    const filePath = this.uriToPath(uri, context);
    const title = titleFromPath(filePath);
    return {
      uri,
      title,
      summary: `Local documentation reference for ${normalizePath(path.relative(context.repoRoot ?? process.cwd(), filePath))}.`,
      source: this.name,
      visibility: context.profile === "public" ? "public" : undefined,
      access: { method: "file", permission: "read" },
    };
  }

  async load(context: AtlasAdapterContext): Promise<AtlasAdapterResult> {
    const rootDir = path.resolve(
      context.repoRoot ?? process.cwd(),
      this.options.rootDir,
    );
    const files = await collectMarkdownFiles(rootDir, this.options.include);
    const entities = files.map((file) => this.fileToEntity(file, rootDir));
    return { entities };
  }

  private fileToEntity(filePath: string, rootDir: string): AtlasEntity {
    const relativePath = normalizePath(path.relative(rootDir, filePath));
    const slug = slugify(relativePath.replace(/\.mdx?$/i, ""));
    const title =
      `${this.options.titlePrefix ?? ""}${titleFromPath(filePath)}`.trim();
    return {
      id: `document:${this.options.idPrefix ?? "local-doc"}-${slug}`,
      kind: "document",
      title,
      summary: `Local Markdown document at ${relativePath}.`,
      visibility: "public",
      uri: pathToFileURL(filePath).href,
      code: {
        paths: [normalizePath(filePath)],
      },
      access: {
        method: "file",
        permission: "read",
      },
      metadata: {
        adapter: this.name,
        relativePath,
      },
    };
  }

  private uriToPath(uri: string, context: AtlasAdapterContext): string {
    if (uri.startsWith("docs:")) {
      return path.resolve(
        context.repoRoot ?? process.cwd(),
        uri.slice("docs:".length),
      );
    }

    return fileURLToPath(uri);
  }
}

export function portalEntityToAtlasEntity(
  entity: DeveloperPortalEntity,
): AtlasEntity {
  return {
    id: entity.id,
    kind: entity.kind,
    title: entity.title,
    summary: entity.summary,
    visibility: "public",
    uri: entity.uri,
    owners: entity.owners,
    tags: entity.tags,
    relations: entity.relations,
    metadata: entity.metadata,
  };
}

export function backstageEntityToDeveloperPortalEntity(
  entity: BackstageCatalogEntity,
  source = "backstage",
): DeveloperPortalEntity {
  const kind = backstageKindToAtlasKind(entity.kind);
  const id = `${kind}:${slugify(entity.metadata.name)}` as AtlasEntityId;
  const relations: AtlasRelation[] = [];

  if (entity.spec?.system) {
    relations.push({
      type: "part-of",
      target: `system:${slugify(entity.spec.system)}`,
      source,
    } as AtlasRelation);
  }

  for (const dependency of entity.spec?.dependsOn ?? []) {
    relations.push({
      type: "depends-on",
      target: backstageRefToAtlasId(dependency),
      source,
    } as AtlasRelation);
  }

  for (const api of entity.spec?.providesApis ?? []) {
    relations.push({
      type: "exposes",
      target: backstageRefToAtlasId(api, "interface"),
      source,
    } as AtlasRelation);
  }

  for (const api of entity.spec?.consumesApis ?? []) {
    relations.push({
      type: "uses",
      target: backstageRefToAtlasId(api, "interface"),
      source,
    } as AtlasRelation);
  }

  return {
    id,
    kind,
    title: entity.metadata.title ?? entity.metadata.name,
    summary:
      entity.metadata.description ??
      `Backstage ${entity.kind.toLowerCase()} catalog entity ${entity.metadata.name}.`,
    uri: entity.metadata.annotations?.["backstage.io/view-url"],
    owners: entity.spec?.owner ? [entity.spec.owner] : undefined,
    tags: entity.metadata.tags,
    relations,
    metadata: {
      adapter: source,
      backstage: {
        kind: entity.kind,
        namespace: entity.metadata.namespace,
        type: entity.spec?.type,
        lifecycle: entity.spec?.lifecycle,
      },
    },
  };
}

export class SchemeResourceResolver implements ExternalResourceResolver {
  readonly name: string;

  constructor(
    private readonly scheme: string,
    private readonly options: {
      name?: string;
      title: string;
      summary: string;
      server?: string;
      visibility?: AtlasEntity["visibility"];
    },
  ) {
    this.name = options.name ?? `${scheme}-resolver`;
  }

  canResolve(uri: string): boolean {
    return uri.startsWith(`${this.scheme}:`);
  }

  async describe(
    uri: string,
    context: AtlasAdapterContext,
  ): Promise<ExternalResourceReference> {
    const publicProfile = context.profile === "public";
    return {
      uri: publicProfile ? `${this.scheme}://redacted` : uri,
      title: this.options.title,
      summary: this.options.summary,
      source: this.name,
      visibility:
        this.options.visibility ?? (publicProfile ? "public" : undefined),
      access: {
        method: this.options.server ? "mcp" : "manual",
        server: this.options.server,
        permission: "read",
        private_overlay_required: publicProfile,
      },
    };
  }
}

export const notionResourceResolver = new SchemeResourceResolver("notion", {
  name: "notion",
  title: "Notion Reference",
  summary:
    "Reference to a Notion page or database. Store concrete page IDs in private overlays.",
  server: "notion",
});

export const confluenceResourceResolver = new SchemeResourceResolver(
  "confluence",
  {
    name: "confluence",
    title: "Confluence Reference",
    summary:
      "Reference to a Confluence page or space. Store concrete page IDs in private overlays.",
    server: "confluence",
  },
);

export const googleResourceResolver = new SchemeResourceResolver("google", {
  name: "google-workspace",
  title: "Google Workspace Reference",
  summary:
    "Reference to a Google Drive, Docs, Sheets, Slides, or Calendar resource.",
  server: "google",
});

function backstageKindToAtlasKind(kind: string): AtlasEntity["kind"] {
  switch (kind.toLowerCase()) {
    case "api":
      return "interface";
    case "component":
      return "component";
    case "domain":
      return "domain";
    case "group":
      return "resource";
    case "resource":
      return "resource";
    case "system":
      return "system";
    default:
      return "component";
  }
}

function backstageRefToAtlasId(
  ref: string,
  fallbackKind: AtlasEntity["kind"] = "component",
): AtlasEntityId {
  const [, rawKind, rawName] = ref.match(/^(?:(\w+):)?(?:[^/]+\/)?(.+)$/) ?? [];
  const kind = rawKind ? backstageKindToAtlasKind(rawKind) : fallbackKind;
  return `${kind}:${slugify(rawName ?? ref)}` as AtlasEntityId;
}

async function collectMarkdownFiles(
  rootDir: string,
  include?: string[],
): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(fullPath, include)));
      continue;
    }

    if (!entry.isFile() || !/\.mdx?$/i.test(entry.name)) {
      continue;
    }

    const normalized = normalizePath(fullPath);
    if (
      !include ||
      include.some((prefix) => normalized.includes(normalizePath(prefix)))
    ) {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => normalizePath(a).localeCompare(normalizePath(b)));
}

function titleFromPath(filePath: string): string {
  return path
    .basename(filePath)
    .replace(/\.mdx?$/i, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function encodePathParts(filePath: string): string {
  return normalizePath(filePath).split("/").map(encodeURIComponent).join("/");
}

function quoteSearch(query: string): string {
  return /\s/.test(query) ? `"${query.replace(/"/g, '\\"')}"` : query;
}
