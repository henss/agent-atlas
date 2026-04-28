#!/usr/bin/env node

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

switch (command) {
  case undefined:
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  default:
    console.error(`Atlas CLI command not implemented yet: ${command}`);
    printHelp();
    process.exitCode = 1;
}
