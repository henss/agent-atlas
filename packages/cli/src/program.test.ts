import { describe, expect, it } from 'vitest';
import { Command } from 'commander';

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

  it('extracts Commander group summaries from non-executable group commands', () => {
    const program = new Command()
      .name('example')
      .exitOverride();
    program
      .command('extract')
      .summary('Extraction command group.')
      .description('Commands for extracting code and docs into a separate repository.')
      .helpGroup('Extraction Commands:');
    program
      .command('extract:scan')
      .summary('Scan extraction candidates.')
      .description('Scans source files before extraction.')
      .helpGroup('Extraction Commands:')
      .option('--path <path>', 'Path to scan.');

    const records = extractCommanderCliCommands(program, {
      id: 'example-cli',
      module: 'dist/program.js',
      export: 'createProgram',
      owner_component: 'component:cli-package',
      command_id_prefix: 'example-cli',
      cliName: 'example',
      defaultVisibility: 'public',
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: 'example-cli.extract-scan',
      group: 'Extraction Commands:',
      groupSummary: 'Extraction command group.',
      groupDescription: 'Commands for extracting code and docs into a separate repository.',
    });

    const markdown = renderCliReferenceMarkdown(records);
    expect(markdown).toContain('## Extraction Commands');
    expect(markdown).toContain('Commands for extracting code and docs into a separate repository.');
  });
});
