import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";
import {
  createContextPack,
  findNeighbors,
  loadAtlasGraph,
  renderContextPackMarkdown,
  resolvePathInGraph,
} from "@agent-atlas/core";
import type {
  AtlasGraph,
  AtlasGraphEdge,
  AtlasProfile,
  NeighborResult,
} from "@agent-atlas/core";
import type {
  AtlasEntity,
  AtlasEntityId,
  AtlasEntityKind,
  AtlasRelationType,
} from "@agent-atlas/schema";

export interface AtlasMcpServerOptions {
  atlasRoot: string;
  profile?: AtlasProfile;
}

export interface AtlasMcpSmokeTestOptions extends AtlasMcpServerOptions {
  pathToResolve?: string;
  task?: string;
  budget?: number;
}

export interface AtlasMcpSmokeTestResult {
  status: "passed" | "failed";
  atlasRoot: string;
  profile: AtlasProfile;
  path: string;
  task: string;
  resolvePathOk: boolean;
  contextPackOk: boolean;
  readOnlyOk: boolean;
  changedFiles: string[];
  diagnostics: string[];
}

export interface ListEntitiesArgs {
  kind?: AtlasEntityKind;
  query?: string;
  profile?: AtlasProfile;
}

export interface DescribeEntityArgs {
  id: AtlasEntityId;
  depth?: number;
  profile?: AtlasProfile;
  budget?: number;
}

export interface ResolvePathArgs {
  path: string;
  profile?: AtlasProfile;
  depth?: number;
}

export interface FindRelatedArgs {
  id: AtlasEntityId;
  relation?: AtlasRelationType;
  depth?: number;
  profile?: AtlasProfile;
}

export interface ContextPackArgs {
  task: string;
  budget?: number;
  profile?: AtlasProfile;
}

export interface AtlasMcpHandlers {
  listEntities(args?: ListEntitiesArgs): Promise<string>;
  describeEntity(args: DescribeEntityArgs): Promise<string>;
  resolvePath(args: ResolvePathArgs): Promise<string>;
  findRelated(args: FindRelatedArgs): Promise<string>;
  contextPack(args: ContextPackArgs): Promise<string>;
  readResource(uri: string): Promise<string>;
}

export function createAtlasMcpHandlers(
  options: AtlasMcpServerOptions,
): AtlasMcpHandlers {
  const atlasRoot = options.atlasRoot;
  const defaultProfile = options.profile ?? "public";

  async function graphFor(profile?: AtlasProfile): Promise<AtlasGraph> {
    const selectedProfile = parseMcpProfile(profile, defaultProfile);
    const graph = await loadAtlasGraph(atlasRoot, { profile: selectedProfile });
    if (graph.entities.length === 0) {
      throw new Error(
        `No atlas entities were loaded from ${atlasRoot}. Check --path and ensure .agent-atlas YAML files exist.`,
      );
    }
    return graph;
  }

  return {
    async listEntities(args = {}) {
      const profile = parseMcpProfile(args.profile, defaultProfile);
      const graph = await graphFor(profile);
      const query = args.query?.toLowerCase();
      const entities = graph.entities
        .filter((entity) => (args.kind ? entity.kind === args.kind : true))
        .filter((entity) =>
          query ? entitySearchText(entity).includes(query) : true,
        )
        .sort(compareEntities);

      return renderEntityListMarkdown(entities, profile);
    },

    async describeEntity(args) {
      const profile = parseMcpProfile(args.profile, defaultProfile);
      const graph = await graphFor(profile);
      const entity = graph.index.entitiesById.get(args.id);
      if (!entity) {
        return renderMcpErrorMarkdown(
          "Entity not found",
          `\`${args.id}\` is not present in profile \`${profile}\`.`,
          "Check the entity ID, selected profile, and overlay visibility.",
        );
      }

      const neighbors = findNeighbors(graph.index, args.id, {
        depth: args.depth ?? 1,
      });
      return renderEntityDescriptionMarkdown(
        graph,
        entity,
        neighbors,
        profile,
        args.budget,
      );
    },

    async resolvePath(args) {
      const profile = parseMcpProfile(args.profile, defaultProfile);
      if (!args.path?.trim()) {
        return renderMcpErrorMarkdown(
          "Invalid path",
          "`resolve_path` requires a non-empty repo-relative path.",
          "Pass a path such as `packages/cli/src/index.ts`.",
        );
      }
      const graph = await graphFor(profile);
      const result = resolvePathInGraph(graph, args.path, {
        depth: args.depth ?? 3,
      });
      return renderPathResolutionMarkdown(
        args.path,
        result.normalizedPath,
        result,
      );
    },

    async findRelated(args) {
      const profile = parseMcpProfile(args.profile, defaultProfile);
      const graph = await graphFor(profile);
      if (!graph.index.entitiesById.has(args.id)) {
        return renderMcpErrorMarkdown(
          "Entity not found",
          `\`${args.id}\` is not present in profile \`${profile}\`.`,
          "Check the entity ID, selected profile, and overlay visibility.",
        );
      }

      const neighbors = findNeighbors(graph.index, args.id, {
        depth: args.depth ?? 1,
        relationTypes: args.relation ? [args.relation] : undefined,
      });
      return renderRelatedMarkdown(
        args.id,
        neighbors,
        args.relation,
        args.depth ?? 1,
      );
    },

    async contextPack(args) {
      const profile = parseMcpProfile(args.profile, defaultProfile);
      if (!args.task?.trim()) {
        return renderMcpErrorMarkdown(
          "Invalid task",
          "`context_pack` requires a non-empty task string.",
          "Pass the coding task the agent is preparing for.",
        );
      }
      const graph = await graphFor(profile);
      const pack = createContextPack(graph, {
        task: args.task,
        budget: args.budget,
        profile,
        deterministic: true,
      });
      return renderContextPackMarkdown(pack);
    },

    async readResource(uri) {
      return readAtlasResource(uri, {
        defaultProfile,
        listEntities: this.listEntities,
        describeEntity: this.describeEntity,
        resolvePath: this.resolvePath,
        contextPack: this.contextPack,
      });
    },
  };
}

export function createAtlasMcpServer(
  options: AtlasMcpServerOptions,
): McpServer {
  const handlers = createAtlasMcpHandlers(options);
  const defaultProfile = options.profile ?? "public";
  const server = new McpServer(
    {
      name: "agent-atlas",
      version: "0.17.0",
    },
    {
      capabilities: {},
    },
  );

  server.registerResource(
    "atlas-root",
    "atlas://root",
    {
      title: "Agent Atlas Root",
      description: "Compact root summary of the selected atlas profile.",
      mimeType: "text/markdown",
    },
    async (uri) => resourceText(uri.href, await handlers.listEntities()),
  );

  server.registerResource(
    "atlas-entity",
    new ResourceTemplate("atlas://entity/{id}", { list: undefined }),
    {
      title: "Atlas Entity",
      description: "Entity card plus selected graph neighborhood.",
      mimeType: "text/markdown",
    },
    async (uri, variables) =>
      resourceText(
        uri.href,
        await handlers.describeEntity({
          id: stringVariable(variables.id) as AtlasEntityId,
        }),
      ),
  );

  server.registerResource(
    "atlas-path",
    new ResourceTemplate("atlas://path/{+path}", { list: undefined }),
    {
      title: "Atlas Path Context",
      description: "Path ownership and related graph context.",
      mimeType: "text/markdown",
    },
    async (uri, variables) =>
      resourceText(
        uri.href,
        await handlers.resolvePath({ path: stringVariable(variables.path) }),
      ),
  );

  server.registerResource(
    "atlas-context-pack",
    new ResourceTemplate("atlas://context-pack{?task,budget,profile}", {
      list: undefined,
    }),
    {
      title: "Atlas Context Pack",
      description: "Task-specific token-budgeted context pack.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const task = uri.searchParams.get("task") ?? "";
      const budget = parseOptionalInteger(
        uri.searchParams.get("budget") ?? undefined,
      );
      const profile = parseMcpProfile(
        uri.searchParams.get("profile") ?? undefined,
        defaultProfile,
      );
      return resourceText(
        uri.href,
        await handlers.contextPack({ task, budget, profile }),
      );
    },
  );

  server.registerTool(
    "list_entities",
    {
      title: "List Atlas Entities",
      description:
        "List compact entity summaries from the selected atlas profile.",
      inputSchema: {
        kind: z.string().optional(),
        query: z.string().optional(),
        profile: z.enum(["public", "private", "company"]).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      toolText(await handlers.listEntities(args as ListEntitiesArgs)),
  );

  server.registerTool(
    "describe_entity",
    {
      title: "Describe Atlas Entity",
      description: "Return one entity card plus selected graph neighbors.",
      inputSchema: {
        id: z.string(),
        depth: z.number().int().positive().optional(),
        profile: z.enum(["public", "private", "company"]).optional(),
        budget: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      toolText(await handlers.describeEntity(args as DescribeEntityArgs)),
  );

  server.registerTool(
    "resolve_path",
    {
      title: "Resolve Atlas Path",
      description:
        "Resolve a repo-relative path to owners, workflows, documents, and tests.",
      inputSchema: {
        path: z.string(),
        profile: z.enum(["public", "private", "company"]).optional(),
        depth: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      toolText(await handlers.resolvePath(args as ResolvePathArgs)),
  );

  server.registerTool(
    "find_related",
    {
      title: "Find Related Atlas Entities",
      description: "Traverse graph neighborhood around an entity.",
      inputSchema: {
        id: z.string(),
        relation: z.string().optional(),
        depth: z.number().int().positive().optional(),
        profile: z.enum(["public", "private", "company"]).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      toolText(await handlers.findRelated(args as FindRelatedArgs)),
  );

  server.registerTool(
    "context_pack",
    {
      title: "Create Atlas Context Pack",
      description:
        "Generate a task-specific context pack from the atlas graph.",
      inputSchema: {
        task: z.string(),
        budget: z.number().int().positive().optional(),
        profile: z.enum(["public", "private", "company"]).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      toolText(await handlers.contextPack(args as ContextPackArgs)),
  );

  return server;
}

export async function startAtlasMcpStdioServer(
  options: AtlasMcpServerOptions,
): Promise<void> {
  const server = createAtlasMcpServer(options);
  await server.connect(new StdioServerTransport());
}

export async function runAtlasMcpSmokeTest(
  options: AtlasMcpSmokeTestOptions,
): Promise<AtlasMcpSmokeTestResult> {
  const atlasRoot = path.resolve(options.atlasRoot);
  const profile = parseMcpProfile(options.profile, "public");
  const pathToResolve = options.pathToResolve ?? "packages/cli/src/index.ts";
  const task = options.task ?? `change ${pathToResolve}`;
  const before = await snapshotFiles(atlasRoot);
  const diagnostics: string[] = [];
  let resolvePathOk = false;
  let contextPackOk = false;

  const server = createAtlasMcpServer({ atlasRoot, profile });
  const client = new Client({
    name: "agent-atlas-smoke-test",
    version: "1.0.0",
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const pathResult = await client.callTool({
      name: "resolve_path",
      arguments: { path: pathToResolve, profile },
    });
    const pathText = toolResultText(pathResult);
    resolvePathOk =
      pathText.includes("# Atlas path resolution") &&
      !pathText.includes("# MCP error");
    if (!resolvePathOk) {
      diagnostics.push(
        "resolve_path did not return a successful path resolution response.",
      );
    }

    const packResult = await client.callTool({
      name: "context_pack",
      arguments: { task, budget: options.budget ?? 1200, profile },
    });
    const packText = toolResultText(packResult);
    contextPackOk =
      packText.includes("# Context pack") && !packText.includes("# MCP error");
    if (!contextPackOk) {
      diagnostics.push(
        "context_pack did not return a successful context pack response.",
      );
    }
  } catch (error) {
    diagnostics.push(error instanceof Error ? error.message : String(error));
  } finally {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }

  const after = await snapshotFiles(atlasRoot);
  const changedFiles = diffSnapshots(before, after);
  if (changedFiles.length > 0) {
    diagnostics.push("MCP smoke test changed files under the atlas root.");
  }

  const readOnlyOk = changedFiles.length === 0;
  const status =
    resolvePathOk && contextPackOk && readOnlyOk ? "passed" : "failed";

  return {
    status,
    atlasRoot,
    profile,
    path: pathToResolve,
    task,
    resolvePathOk,
    contextPackOk,
    readOnlyOk,
    changedFiles,
    diagnostics,
  };
}

interface ReadResourceHandlers {
  defaultProfile: AtlasProfile;
  listEntities(args?: ListEntitiesArgs): Promise<string>;
  describeEntity(args: DescribeEntityArgs): Promise<string>;
  resolvePath(args: ResolvePathArgs): Promise<string>;
  contextPack(args: ContextPackArgs): Promise<string>;
}

async function readAtlasResource(
  uri: string,
  handlers: ReadResourceHandlers,
): Promise<string> {
  const parsed = new URL(uri);
  if (parsed.protocol !== "atlas:") {
    return `# Unsupported resource\n\nUnsupported URI: \`${uri}\`.\n`;
  }

  if (parsed.hostname === "root") {
    return handlers.listEntities({ profile: handlers.defaultProfile });
  }

  if (parsed.hostname === "entity") {
    const id = decodePathValue(parsed.pathname) as AtlasEntityId;
    return handlers.describeEntity({ id, profile: handlers.defaultProfile });
  }

  if (parsed.hostname === "path") {
    const filePath = decodePathValue(parsed.pathname);
    return handlers.resolvePath({
      path: filePath,
      profile: handlers.defaultProfile,
    });
  }

  if (parsed.hostname === "context-pack") {
    return handlers.contextPack({
      task: parsed.searchParams.get("task") ?? "",
      budget: parseOptionalInteger(
        parsed.searchParams.get("budget") ?? undefined,
      ),
      profile: parseMcpProfile(
        parsed.searchParams.get("profile") ?? undefined,
        handlers.defaultProfile,
      ),
    });
  }

  return `# Unsupported resource\n\nUnsupported URI: \`${uri}\`.\n`;
}

function renderEntityListMarkdown(
  entities: AtlasEntity[],
  profile: AtlasProfile,
): string {
  const lines = [
    "# Atlas entities",
    "",
    `Profile: \`${profile}\``,
    `Count: ${entities.length}`,
    "",
  ];
  for (const entity of entities) {
    lines.push(
      `- \`${entity.id}\` (${entity.kind}) - ${entity.title}: ${entity.summary}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function renderEntityDescriptionMarkdown(
  graph: AtlasGraph,
  entity: AtlasEntity,
  neighbors: NeighborResult[],
  profile: AtlasProfile,
  budget: number | undefined,
): string {
  const outgoing = graph.index.outgoingById.get(entity.id) ?? [];
  const incoming = graph.index.incomingById.get(entity.id) ?? [];
  const lines = [
    `# ${entity.title}`,
    "",
    `ID: \`${entity.id}\``,
    `Kind: \`${entity.kind}\``,
    `Profile: \`${profile}\``,
    "",
    entity.summary,
  ];

  const access = renderAccessLines(entity, profile);
  if (access.length > 0) {
    lines.push("", "## Access", "", ...access);
  }

  lines.push(
    "",
    "## Relations",
    "",
    ...renderEdgeLines("Outgoing", outgoing),
    ...renderEdgeLines("Incoming", incoming),
    "",
    "## Related",
    "",
    ...neighbors.map(
      (neighbor) =>
        `- d${neighbor.distance} \`${neighbor.entity.id}\` (${neighbor.entity.kind}): ${neighbor.entity.title}${neighbor.via ? ` via \`${neighbor.via.type}\`` : ""}`,
    ),
  );

  return fitMarkdownBudget(`${lines.join("\n")}\n`, budget);
}

function renderPathResolutionMarkdown(
  requestedPath: string,
  normalizedPath: string,
  result: ReturnType<typeof resolvePathInGraph>,
): string {
  const lines = [
    "# Atlas path resolution",
    "",
    `Path: \`${normalizedPath || requestedPath}\``,
    "",
  ];
  lines.push("## Owners", "", ...renderPathMatches(result.owners));
  lines.push("", "## Workflows", "", ...renderPathMatches(result.workflows));
  lines.push("", "## Domains", "", ...renderPathMatches(result.domains));
  lines.push("", "## Documents", "", ...renderPathMatches(result.documents));
  lines.push("", "## Tests", "", ...renderPathMatches(result.tests));
  return `${lines.join("\n")}\n`;
}

function renderRelatedMarkdown(
  id: AtlasEntityId,
  neighbors: NeighborResult[],
  relation: AtlasRelationType | undefined,
  depth: number,
): string {
  const lines = [
    "# Atlas related entities",
    "",
    `Start: \`${id}\``,
    `Depth: ${depth}`,
    `Relation: ${relation ? `\`${relation}\`` : "all"}`,
    `Count: ${neighbors.length}`,
    "",
  ];
  for (const neighbor of neighbors) {
    lines.push(
      `- d${neighbor.distance} \`${neighbor.entity.id}\` (${neighbor.entity.kind}): ${neighbor.entity.title}${neighbor.via ? ` via \`${neighbor.via.type}\`` : ""}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function renderPathMatches(
  matches: Array<{
    entity: AtlasEntity;
    confidence: number;
    distance?: number;
    pattern?: string;
    matchType?: string;
  }>,
): string[] {
  if (matches.length === 0) {
    return ["- None."];
  }

  return matches.map((match) => {
    const detail = match.pattern ? ` via \`${match.pattern}\`` : "";
    return `- \`${match.entity.id}\` (${match.confidence.toFixed(2)}): ${match.entity.title}${detail}`;
  });
}

function renderEdgeLines(title: string, edges: AtlasGraphEdge[]): string[] {
  if (edges.length === 0) {
    return [`### ${title}`, "", "- None."];
  }

  return [
    `### ${title}`,
    "",
    ...edges.map((edge) => {
      const other = title === "Incoming" ? edge.source : edge.target;
      return `- \`${edge.type}\` \`${other}\`${edge.provenance === "generated" ? " _(generated)_" : ""}`;
    }),
  ];
}

function renderAccessLines(
  entity: AtlasEntity,
  profile: AtlasProfile,
): string[] {
  const lines: string[] = [];
  if (entity.uri) {
    lines.push(`- uri: \`${renderUri(entity.uri, profile)}\``);
  }
  if (entity.access?.method) {
    lines.push(`- method: \`${entity.access.method}\``);
  }
  if (profile !== "public" && entity.access?.server) {
    lines.push(`- server: \`${entity.access.server}\``);
  }
  if (profile !== "public" && entity.access?.permission) {
    lines.push(`- permission: \`${entity.access.permission}\``);
  }
  if (entity.access?.private_overlay_required || isPrivateUri(entity.uri)) {
    lines.push("- private overlay required");
  }
  return lines;
}

function renderUri(uri: string, profile: AtlasProfile): string {
  if (profile === "public" && isPrivateUri(uri)) {
    return "[redacted: private reference]";
  }
  return uri;
}

function isPrivateUri(uri: string | undefined): boolean {
  if (!uri) {
    return false;
  }
  const lowerUri = uri.toLowerCase();
  return (
    [
      "notion:",
      "confluence:",
      "jira:",
      "gdrive:",
      "google-drive:",
      "gcal:",
      "slack:",
      "mailto:",
    ].some((scheme) => lowerUri.startsWith(scheme)) ||
    lowerUri.includes("localhost") ||
    /^https?:\/\/(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(
      lowerUri,
    )
  );
}

function entitySearchText(entity: AtlasEntity): string {
  return [
    entity.id,
    entity.kind,
    entity.title,
    entity.summary,
    ...(entity.aliases ?? []),
    ...(entity.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function compareEntities(left: AtlasEntity, right: AtlasEntity): number {
  const kindCompare = left.kind.localeCompare(right.kind);
  if (kindCompare !== 0) return kindCompare;
  return left.id.localeCompare(right.id);
}

function toolText(text: string): {
  content: Array<{ type: "text"; text: string }>;
} {
  return { content: [{ type: "text", text }] };
}

function resourceText(
  uri: string,
  text: string,
): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
  return { contents: [{ uri, mimeType: "text/markdown", text }] };
}

function stringVariable(value: unknown): string {
  if (Array.isArray(value)) {
    return String(value[0] ?? "");
  }
  return String(value ?? "");
}

function decodePathValue(value: string): string {
  return decodeURIComponent(value.replace(/^\/+/, ""));
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseMcpProfile(
  value: unknown,
  fallback: AtlasProfile,
): AtlasProfile {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (value === "public" || value === "private" || value === "company") {
    return value;
  }
  throw new Error(
    `Invalid MCP profile ${String(value)}. Expected public, private, or company.`,
  );
}

function renderMcpErrorMarkdown(
  title: string,
  message: string,
  hint: string,
): string {
  return `# MCP error: ${title}\n\n${message}\n\nFix: ${hint}\n`;
}

function toolResultText(result: unknown): string {
  if (!isRecord(result) || !Array.isArray(result.content)) {
    return "";
  }
  return result.content
    .map((item) =>
      isRecord(item) && item.type === "text" && typeof item.text === "string"
        ? item.text
        : "",
    )
    .join("\n");
}

async function snapshotFiles(rootPath: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();

  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (
        entry.name === ".git" ||
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === ".runtime"
      ) {
        continue;
      }

      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const entryStat = await stat(entryPath);
      snapshot.set(
        normalizeFilePath(path.relative(rootPath, entryPath)),
        `${entryStat.size}:${Math.trunc(entryStat.mtimeMs)}`,
      );
    }
  }

  await walk(rootPath);
  return snapshot;
}

function diffSnapshots(
  before: Map<string, string>,
  after: Map<string, string>,
): string[] {
  const changed = new Set<string>();
  for (const [filePath, value] of before.entries()) {
    if (after.get(filePath) !== value) {
      changed.add(filePath);
    }
  }
  for (const filePath of after.keys()) {
    if (!before.has(filePath)) {
      changed.add(filePath);
    }
  }
  return [...changed].sort();
}

function normalizeFilePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fitMarkdownBudget(
  markdown: string,
  budget: number | undefined,
): string {
  if (!budget) {
    return markdown;
  }
  const maxCharacters = budget * 4;
  if (markdown.length <= maxCharacters) {
    return markdown;
  }
  return `${markdown.slice(0, Math.max(0, maxCharacters - 40)).trimEnd()}\n\n_Trimmed to budget._\n`;
}
