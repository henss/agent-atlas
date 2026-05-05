import { describe, expect, it } from 'vitest';

import { extractCommanderCliCommands, renderCliReferenceMarkdown } from '../../core/src/generated-cli.js';
import { createAtlasCliProgram } from './program.js';

describe('Commander-derived Atlas CLI catalog', () => {
  it('extracts visible commands as stable interface records', () => {
    const records = extractCommanderCliCommands(createAtlasCliProgram(), {
      id: 'atlas-cli',
      module: 'packages/cli/dist/program.js',
      export: 'createAtlasCliProgram',
      owner_component: 'component:cli-package',
      command_id_prefix: 'atlas-cli',
      cliName: 'atlas',
      defaultVisibility: 'public',
      workflow_relations: {
        'context-pack': 'workflow:create-context-pack',
      },
    });

    const contextPack = records.find((record) => record.id === 'atlas-cli.context-pack');
    const generateMarkdown = records.find((record) => record.id === 'atlas-cli.generate-markdown');

    expect(records.length).toBeGreaterThan(20);
    expect(contextPack).toMatchObject({
      entityId: 'interface:atlas-cli.context-pack',
      usage: 'atlas context-pack <task> [path] [--budget <tokens>] [--deterministic] [--path <root>] [--profile <profile>] [--json]',
      ownerComponentId: 'component:cli-package',
      workflowId: 'workflow:create-context-pack',
      visibility: 'public',
    });
    expect(contextPack?.arguments.map((argument) => argument.name)).toContain('task');
    expect(contextPack?.options.map((option) => option.flags)).toContain('--budget <tokens>');
    expect(generateMarkdown?.entityId).toBe('interface:atlas-cli.generate-markdown');
    expect(records.some((record) => record.id === 'atlas-cli.help')).toBe(false);
  });

  it('renders a generated command reference', () => {
    const records = extractCommanderCliCommands(createAtlasCliProgram(), {
      id: 'atlas-cli',
      module: 'packages/cli/dist/program.js',
      export: 'createAtlasCliProgram',
      owner_component: 'component:cli-package',
      command_id_prefix: 'atlas-cli',
      cliName: 'atlas',
      defaultVisibility: 'public',
    });

    const markdown = renderCliReferenceMarkdown(records);

    expect(markdown).toContain('# CLI Command Reference');
    expect(markdown).toContain('### `atlas validate');
    expect(markdown).toContain('### `atlas cli docs generate');
    expect(markdown).toContain('Options:');
  });
});
