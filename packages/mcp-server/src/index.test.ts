import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  createAtlasMcpHandlers,
  createAtlasMcpServer,
  runAtlasMcpSmokeTest,
} from './index.js';

describe('Agent Atlas MCP handlers', () => {
  it('lists and describes entities from the selected profile', async () => {
    const handlers = createAtlasMcpHandlers({
      atlasRoot: path.resolve('../..'),
      profile: 'public',
    });

    const list = await handlers.listEntities({ query: 'context pack' });
    expect(list).toContain('workflow:create-context-pack');

    const overview = await handlers.overview();
    expect(overview).toContain('# Atlas overview');
    expect(overview).toContain('## Major capabilities');
    expect(overview).toContain('## Use MCP tools next');
    expect(overview).toContain('`describe_entity`');

    const description = await handlers.describeEntity({
      id: 'workflow:create-context-pack',
      depth: 1,
    });
    expect(description).toContain('# Create Context Pack');
    expect(description).toContain('component:core-package');
  });

  it('resolves paths and creates context packs', async () => {
    const handlers = createAtlasMcpHandlers({
      atlasRoot: path.resolve('../..'),
      profile: 'public',
    });

    const pathResult = await handlers.resolvePath({ path: 'packages/cli/src/index.ts' });
    expect(pathResult).toContain('component:cli-package');

    const absolutePathResult = await handlers.resolvePath({
      path: path.resolve('../../packages/cli/src/index.ts'),
    });
    expect(absolutePathResult).toContain('Path: `packages/cli/src/index.ts`');
    expect(absolutePathResult).toContain('component:cli-package');

    const pack = await handlers.contextPack({
      task: 'change CLI path resolution in packages/cli/src/index.ts',
      budget: 1200,
    });
    expect(pack).toContain('# Context pack');
    expect(pack).toContain('packages/cli/src/index.ts');
  });

  it('returns concise errors for invalid MCP inputs', async () => {
    const handlers = createAtlasMcpHandlers({
      atlasRoot: path.resolve('../..'),
      profile: 'public',
    });

    await expect(
      handlers.listEntities({ profile: 'bad-profile' as never }),
    ).rejects.toThrow('Invalid MCP profile');

    const pathResult = await handlers.resolvePath({ path: '' });
    expect(pathResult).toContain('# MCP error: Invalid path');

    const outsidePathResult = await handlers.resolvePath({
      path: path.resolve('../../../llm-orchestrator/package.json'),
    });
    expect(outsidePathResult).toContain('# MCP error: Path outside atlas root');
    expect(outsidePathResult).toContain('repo-scoped Atlas MCP server root');

    const unmatchedPathResult = await handlers.resolvePath({
      path: 'scratch/untracked-missing.ts',
    });
    expect(unmatchedPathResult).toContain('## Hint');
    expect(unmatchedPathResult).toContain('No Atlas entities matched this path');

    const invalidKind = await handlers.listEntities({ kind: 'unknown' as never });
    expect(invalidKind).toContain('# MCP error: Invalid entity kind');

    const invalidRelation = await handlers.findRelated({
      id: 'workflow:create-context-pack',
      relation: 'unknown' as never,
    });
    expect(invalidRelation).toContain('# MCP error: Invalid relation type');

    const pack = await handlers.contextPack({ task: '' });
    expect(pack).toContain('# MCP error: Invalid task');
  });

  it('budgets MCP Markdown responses', async () => {
    const handlers = createAtlasMcpHandlers({
      atlasRoot: path.resolve('../..'),
      profile: 'public',
    });

    const overview = await handlers.overview({ budget: 20 });
    expect(overview).toContain('_Trimmed to budget._');

    const list = await handlers.listEntities({ budget: 20 });
    expect(list).toContain('_Trimmed to budget._');

    const pathResult = await handlers.resolvePath({
      path: 'packages/cli/src/index.ts',
      budget: 20,
    });
    expect(pathResult).toContain('_Trimmed to budget._');

    const related = await handlers.findRelated({
      id: 'workflow:create-context-pack',
      budget: 20,
    });
    expect(related).toContain('_Trimmed to budget._');

    const pack = await handlers.contextPack({
      task: 'change CLI path resolution in packages/cli/src/index.ts',
      budget: 20,
    });
    expect(pack).toContain('_Trimmed to budget._');
  });

  it('reads atlas resource URIs', async () => {
    const handlers = createAtlasMcpHandlers({
      atlasRoot: path.resolve('../../examples/personal-ops-sanitized'),
      profile: 'private',
    });

    const entity = await handlers.readResource('atlas://entity/document%3Aweekly-planning-system');
    expect(entity).toContain('notion://page/sanitized-weekly-planning');

    const root = await handlers.readResource('atlas://root');
    expect(root).toContain('# Atlas overview');

    const pathResource = await handlers.readResource('atlas://path/packages/planning/src/weeklyPlanner.ts');
    expect(pathResource).toContain('component:weekly-planner');
  });

  it('registers SDK MCP tools and resources', async () => {
    const server = createAtlasMcpServer({
      atlasRoot: path.resolve('../..'),
      profile: 'public',
    });
    const client = new Client({ name: 'agent-atlas-test', version: '0.0.0-test' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          'list_entities',
          'atlas_overview',
          'describe_entity',
          'resolve_path',
          'find_related',
          'context_pack',
        ]),
      );
      const listEntitiesTool = tools.tools.find((tool) => tool.name === 'list_entities');
      expect(JSON.stringify(listEntitiesTool?.inputSchema)).toContain('"domain"');
      expect(JSON.stringify(listEntitiesTool?.inputSchema)).toContain('"test-scope"');

      const findRelatedTool = tools.tools.find((tool) => tool.name === 'find_related');
      expect(JSON.stringify(findRelatedTool?.inputSchema)).toContain('"part-of"');
      expect(JSON.stringify(findRelatedTool?.inputSchema)).toContain('"tested-by"');

      const resourceTemplates = await client.listResourceTemplates();
      expect(resourceTemplates.resourceTemplates.map((resource) => resource.uriTemplate)).toEqual(
        expect.arrayContaining(['atlas://entity/{id}', 'atlas://path/{+path}']),
      );

      const toolResult = await client.callTool({
        name: 'list_entities',
        arguments: { query: 'mcp' },
      });
      expect(toolResult.content).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'text' })]),
      );
    } finally {
      await client.close();
      await server.close();
    }

    expect(server.isConnected()).toBe(false);
  });

  it('documents the overview tool in the package README', async () => {
    const readme = await readFile(path.resolve('README.md'), 'utf8');
    expect(readme).toContain('- `atlas_overview`');
  });

  it('smoke-tests resolve_path, context_pack, and read-only behavior', async () => {
    const result = await runAtlasMcpSmokeTest({
      atlasRoot: path.resolve('../..'),
      profile: 'public',
      pathToResolve: 'packages/cli/src/index.ts',
      task: 'change packages/cli/src/index.ts',
      budget: 1200,
    });

    expect(result.status).toBe('passed');
    expect(result.resolvePathOk).toBe(true);
    expect(result.contextPackOk).toBe(true);
    expect(result.readOnlyOk).toBe(true);
    expect(result.changedFiles).toEqual([]);
  });
});
