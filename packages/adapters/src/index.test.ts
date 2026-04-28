import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BackstageAdapter,
  LocalDocsAdapter,
  SourcegraphAdapter,
  confluenceResourceResolver,
  googleResourceResolver,
  notionResourceResolver,
} from "./index.js";

describe("BackstageAdapter", () => {
  it("maps Backstage catalog entities to atlas entities", async () => {
    const adapter = new BackstageAdapter({
      catalog: [
        {
          kind: "Component",
          metadata: {
            name: "Checkout API",
            description: "Handles checkout requests.",
            tags: ["payments"],
            annotations: {
              "backstage.io/view-url":
                "https://developer.example/catalog/default/component/checkout-api",
            },
          },
          spec: {
            owner: "team-payments",
            system: "commerce-platform",
            dependsOn: ["component:default/fraud-service"],
            providesApis: ["checkout-http-api"],
          },
        },
      ],
    });

    const result = await adapter.load({ profile: "public" });

    expect(result.entities).toHaveLength(1);
    expect(result.entities?.[0]).toMatchObject({
      id: "component:checkout-api",
      kind: "component",
      title: "Checkout API",
      summary: "Handles checkout requests.",
      owners: ["team-payments"],
      tags: ["payments"],
    });
    expect(result.entities?.[0]?.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "part-of",
          target: "system:commerce-platform",
        }),
        expect.objectContaining({
          type: "depends-on",
          target: "component:fraud-service",
        }),
        expect.objectContaining({
          type: "exposes",
          target: "interface:checkout-http-api",
        }),
      ]),
    );
  });
});

describe("SourcegraphAdapter", () => {
  it("returns deterministic path and search references", async () => {
    const adapter = new SourcegraphAdapter({
      baseUrl: "https://sourcegraph.example",
      repository: "github.com/example/repo",
    });

    await expect(
      adapter.resolvePath("packages\\api\\src\\index.ts", {
        profile: "company",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        path: "packages/api/src/index.ts",
        uri: "https://sourcegraph.example/github.com%2Fexample%2Frepo/-/blob/packages/api/src/index.ts",
        source: "sourcegraph",
      }),
    ]);

    const symbols = await adapter.findSymbols?.("create checkout", {
      profile: "company",
    });
    expect(symbols?.[0]?.uri).toContain("symbol%3A%22create%20checkout%22");
  });
});

describe("LocalDocsAdapter", () => {
  it("creates document entities for local markdown files", async () => {
    const repoRoot = await makeTempDir();
    await mkdir(path.join(repoRoot, "docs", "guides"), { recursive: true });
    await writeFile(
      path.join(repoRoot, "docs", "guides", "release-flow.md"),
      "# Release Flow\n",
    );

    const adapter = new LocalDocsAdapter({ rootDir: "docs" });
    const result = await adapter.load({ profile: "public", repoRoot });

    expect(result.entities).toHaveLength(1);
    expect(result.entities?.[0]).toMatchObject({
      id: "document:local-doc-guides-release-flow",
      kind: "document",
      title: "Release Flow",
      summary: "Local Markdown document at guides/release-flow.md.",
      visibility: "public",
      access: { method: "file", permission: "read" },
    });
  });
});

describe("external resource resolvers", () => {
  it("redacts private overlay resource URIs for public profile", async () => {
    await expect(
      notionResourceResolver.describe("notion://page/internal-plan", {
        profile: "public",
      }),
    ).resolves.toMatchObject({
      uri: "notion://redacted",
      access: {
        method: "mcp",
        server: "notion",
        private_overlay_required: true,
      },
    });

    await expect(
      confluenceResourceResolver.describe("confluence://space/page", {
        profile: "company",
      }),
    ).resolves.toMatchObject({
      uri: "confluence://space/page",
      source: "confluence",
    });

    expect(googleResourceResolver.canResolve("google://drive/document")).toBe(
      true,
    );
  });
});

async function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "agent-atlas-adapters-"));
}
