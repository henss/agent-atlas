#!/usr/bin/env node

import { validateAtlas } from '@agent-atlas/core';
import type { AtlasDiagnostic, AtlasValidationResult } from '@agent-atlas/core';

const [, , command, ...args] = process.argv;

function printHelp(): void {
  console.log(`# Agent Atlas CLI

Status: seed implementation

Planned commands:

- atlas init
- atlas validate [path]
- atlas list [kind]
- atlas show <entity-id>
- atlas neighbors <entity-id> --depth 2
- atlas resolve-path <path>
- atlas context-pack "<task>" --budget 4000
- atlas generate markdown

Current command: ${command ?? '(none)'}
Args: ${args.join(' ')}
`);
}

function parseValidateArgs(args: string[]): { rootPath: string; json: boolean } {
  let rootPath = process.cwd();
  let json = false;

  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }

    rootPath = arg;
  }

  return { rootPath, json };
}

function printValidationMarkdown(result: AtlasValidationResult): void {
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.level === 'error');
  const warnings = result.diagnostics.filter((diagnostic) => diagnostic.level === 'warning');

  console.log(`# Atlas validation

Status: ${result.status}

Entities: ${result.entityCount}
Relations: ${result.relationCount}
Warnings: ${warnings.length}
Errors: ${errors.length}`);

  printDiagnosticSection('Errors', errors);
  printDiagnosticSection('Warnings', warnings);
}

function printDiagnosticSection(title: string, diagnostics: AtlasDiagnostic[]): void {
  if (diagnostics.length === 0) {
    return;
  }

  console.log(`\n## ${title}\n`);
  for (const diagnostic of diagnostics) {
    const subject = diagnostic.entityId ? `\`${diagnostic.entityId}\`` : '`atlas`';
    console.log(`- ${subject}: ${diagnostic.message} \`${diagnostic.code}\``);
  }
}

switch (command) {
  case undefined:
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  case 'validate': {
    const options = parseValidateArgs(args);
    const result = await validateAtlas(options.rootPath);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printValidationMarkdown(result);
    }
    process.exitCode = result.status === 'failed' ? 1 : 0;
    break;
  }
  default:
    console.error(`Atlas CLI command not implemented yet: ${command}`);
    printHelp();
    process.exitCode = 1;
}
