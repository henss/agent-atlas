import path from 'node:path';
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

    const pack = await handlers.contextPack({ task: '' });
    expect(pack).toContain('# MCP error: Invalid task');
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
