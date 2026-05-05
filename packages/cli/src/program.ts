import { Command } from 'commander';

interface AtlasCliCommandDefinition {
  path: string[];
  summary: string;
  description: string;
  usage?: string;
  arguments?: string[];
  options?: Array<{ flags: string; description: string }>;
  group?: string;
}

const COMMON_ROOT_OPTIONS = [
  { flags: '--path <root>', description: 'Atlas root path; use instead of positional root.' },
  { flags: '--profile <profile>', description: 'Atlas profile: public, private, or company.' },
  { flags: '--json', description: 'Print machine-readable JSON output.' },
];

const COMMANDS: AtlasCliCommandDefinition[] = [
  {
    path: ['validate'],
    summary: 'Validate atlas metadata.',
    description: 'Loads atlas YAML, applies the selected profile, and reports schema, relation, and safety diagnostics.',
    usage: '[path] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['[path]'],
    options: COMMON_ROOT_OPTIONS,
    group: 'Graph Commands',
  },
  {
    path: ['overview'],
    summary: 'Print an overview of the atlas graph.',
    description: 'Renders the high-level domain, workflow, component, document, and verification map for a repository.',
    usage: '[path] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['[path]'],
    options: COMMON_ROOT_OPTIONS,
    group: 'Graph Commands',
  },
  {
    path: ['show'],
    summary: 'Show one atlas entity.',
    description: 'Prints one entity with incoming and outgoing relations.',
    usage: '<entity-id> [path] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['<entity-id>', '[path]'],
    options: COMMON_ROOT_OPTIONS,
    group: 'Graph Commands',
  },
  {
    path: ['neighbors'],
    summary: 'Traverse nearby graph context.',
    description: 'Walks relations around an entity for a bounded depth and optional relation filter.',
    usage: '<entity-id> [path] [--depth <n>] [--relation <types>] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['<entity-id>', '[path]'],
    options: [
      ...COMMON_ROOT_OPTIONS,
      { flags: '--depth <n>', description: 'Traversal depth.' },
      { flags: '--relation <types>', description: 'Comma-separated relation types to traverse.' },
    ],
    group: 'Graph Commands',
  },
  {
    path: ['resolve-path'],
    summary: 'Resolve a file path to atlas owners.',
    description: 'Matches a source path against component paths and entrypoints, then returns relevant surrounding context.',
    usage: '<file-path> [path] [--depth <n>] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['<file-path>', '[path]'],
    options: [...COMMON_ROOT_OPTIONS, { flags: '--depth <n>', description: 'Related-context traversal depth.' }],
    group: 'Graph Commands',
  },
  {
    path: ['context-pack'],
    summary: 'Build a task-focused context pack.',
    description: 'Selects task-relevant entities, source reads, external references, verification commands, and risk notes within a token budget.',
    usage: '<task> [path] [--budget <tokens>] [--deterministic] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['<task>', '[path]'],
    options: [
      ...COMMON_ROOT_OPTIONS,
      { flags: '--budget <tokens>', description: 'Approximate token budget.' },
      { flags: '--deterministic', description: 'Use deterministic selection.' },
    ],
    group: 'Graph Commands',
  },
  {
    path: ['generate', 'markdown'],
    summary: 'Generate atlas Markdown views.',
    description: 'Writes generated Markdown cards for the atlas graph and optionally checks for drift.',
    usage: '[path] [--output <path>] [--check] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['[path]'],
    options: [
      ...COMMON_ROOT_OPTIONS,
      { flags: '--output <path>', description: 'Generated docs output directory.' },
      { flags: '--check', description: 'Check drift without writing files.' },
    ],
    group: 'Generated Artifact Commands',
  },
  {
    path: ['cli', 'docs', 'generate'],
    summary: 'Generate the CLI command reference.',
    description: 'Writes the Commander-derived CLI reference Markdown.',
    usage: '[--output <path>] [--check]',
    options: [
      { flags: '--output <path>', description: 'Reference Markdown output path.' },
      { flags: '--check', description: 'Check drift without writing files.' },
    ],
    group: 'Generated Artifact Commands',
  },
  {
    path: ['cli', 'docs', 'check'],
    summary: 'Check the CLI command reference.',
    description: 'Fails when the Commander-derived CLI reference is stale or missing.',
    usage: '[--output <path>]',
    options: [{ flags: '--output <path>', description: 'Reference Markdown output path.' }],
    group: 'Generated Artifact Commands',
  },
  {
    path: ['sources', 'docs', 'generate'],
    summary: 'Generate the source-derived Atlas reference.',
    description: 'Writes the reference for entities derived from package scripts, packages, tests, docs, config, routes, and dependencies.',
    usage: '[path] [--path <root>] [--output <path>] [--check] [--profile <profile>]',
    arguments: ['[path]'],
    options: [
      { flags: '--path <root>', description: 'Atlas root path.' },
      { flags: '--output <path>', description: 'Reference Markdown output path.' },
      { flags: '--check', description: 'Check drift without writing files.' },
      { flags: '--profile <profile>', description: 'Atlas profile.' },
    ],
    group: 'Generated Artifact Commands',
  },
  {
    path: ['sources', 'docs', 'check'],
    summary: 'Check the source-derived Atlas reference.',
    description: 'Fails when the source-derived reference is stale or missing.',
    usage: '[path] [--path <root>] [--output <path>] [--profile <profile>]',
    arguments: ['[path]'],
    options: [
      { flags: '--path <root>', description: 'Atlas root path.' },
      { flags: '--output <path>', description: 'Reference Markdown output path.' },
      { flags: '--profile <profile>', description: 'Atlas profile.' },
    ],
    group: 'Generated Artifact Commands',
  },
  {
    path: ['maintain', 'check'],
    summary: 'Check Atlas maintenance state.',
    description: 'Runs validation, optional boundary checks, metadata drift checks, generated docs checks, README checks, and generated CLI reference checks.',
    usage: '[path] [--path <root>] [--policy <path>] [--profile <profile>] [--json]',
    arguments: ['[path]'],
    options: [...COMMON_ROOT_OPTIONS, { flags: '--policy <path>', description: 'Maintenance policy path.' }],
    group: 'Maintenance Commands',
  },
  {
    path: ['maintain', 'fix'],
    summary: 'Refresh maintained Atlas surfaces.',
    description: 'Applies allowed metadata fixes and regenerates configured docs, README, and CLI reference artifacts.',
    usage: '[path] [--path <root>] [--policy <path>] [--profile <profile>] [--json]',
    arguments: ['[path]'],
    options: [...COMMON_ROOT_OPTIONS, { flags: '--policy <path>', description: 'Maintenance policy path.' }],
    group: 'Maintenance Commands',
  },
  {
    path: ['maintain', 'agent-instructions'],
    summary: 'Print maintenance instructions.',
    description: 'Prints the effective maintenance policy as agent-facing instructions.',
    usage: '[path] [--path <root>] [--policy <path>] [--profile <profile>] [--json]',
    arguments: ['[path]'],
    options: [...COMMON_ROOT_OPTIONS, { flags: '--policy <path>', description: 'Maintenance policy path.' }],
    group: 'Maintenance Commands',
  },
  {
    path: ['diff'],
    summary: 'Report stale Atlas metadata and generated artifacts.',
    description: 'Compares source files, atlas metadata, generated docs, README, and generated CLI reference for drift.',
    usage: '[path] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['[path]'],
    options: COMMON_ROOT_OPTIONS,
    group: 'Maintenance Commands',
  },
  {
    path: ['suggest-card'],
    summary: 'Suggest an atlas card for a file.',
    description: 'Drafts a small component or test-scope card for a source file.',
    usage: '--path <file> [--json]',
    options: [
      { flags: '--path <file>', description: 'File path to cover.' },
      { flags: '--json', description: 'Print machine-readable JSON output.' },
    ],
    group: 'Maintenance Commands',
  },
  {
    path: ['discover-gaps'],
    summary: 'Discover Atlas coverage gaps.',
    description: 'Reports missing cards, misleading cards, broad-search fallback evidence, stale references, and under-modeled CLI capabilities.',
    usage: '[path] [--receipts <path>] [--budget <tokens>] [--output <path>] [--no-static] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['[path]'],
    options: [
      ...COMMON_ROOT_OPTIONS,
      { flags: '--receipts <path>', description: 'Usage receipt directory.' },
      { flags: '--budget <tokens>', description: 'Context budget for gap reporting.' },
      { flags: '--output <path>', description: 'Write report JSON.' },
      { flags: '--no-static', description: 'Disable static gap checks.' },
    ],
    group: 'Maintenance Commands',
  },
  {
    path: ['propose-cards'],
    summary: 'Generate card proposals from a gap report.',
    description: 'Creates deterministic Atlas card proposals from a discovery report.',
    usage: '--report <file> [--output <dir>] [--llm] [--llm-provider <provider>] [--json]',
    options: [
      { flags: '--report <file>', description: 'Gap report JSON path.' },
      { flags: '--output <dir>', description: 'Proposal output directory.' },
      { flags: '--llm', description: 'Enable bounded enrichment.' },
      { flags: '--llm-provider <provider>', description: 'LLM provider name.' },
      { flags: '--json', description: 'Print machine-readable JSON output.' },
    ],
    group: 'Maintenance Commands',
  },
  {
    path: ['proposal', 'validate'],
    summary: 'Validate an Atlas card proposal.',
    description: 'Checks a proposal file before applying generated card metadata.',
    usage: '<proposal> [path] [--path <root>] [--json]',
    arguments: ['<proposal>', '[path]'],
    options: [
      { flags: '--path <root>', description: 'Atlas root path.' },
      { flags: '--json', description: 'Print machine-readable JSON output.' },
    ],
    group: 'Maintenance Commands',
  },
  {
    path: ['proposal', 'apply'],
    summary: 'Apply selected Atlas proposal entities.',
    description: 'Writes selected proposed card metadata into the atlas.',
    usage: '<proposal> --select <entity-id> [--json]',
    arguments: ['<proposal>'],
    options: [
      { flags: '--select <entity-id>', description: 'Entity ID to apply; repeatable.' },
      { flags: '--json', description: 'Print machine-readable JSON output.' },
    ],
    group: 'Maintenance Commands',
  },
  {
    path: ['migrate'],
    summary: 'Run Atlas metadata migrations.',
    description: 'Reports or writes metadata migrations for a repository atlas.',
    usage: '[path] --to <version> [--write] [--json]',
    arguments: ['[path]'],
    options: [
      { flags: '--to <version>', description: 'Target migration version.' },
      { flags: '--write', description: 'Write migration changes.' },
      { flags: '--json', description: 'Print machine-readable JSON output.' },
    ],
    group: 'Maintenance Commands',
  },
  {
    path: ['benchmark'],
    summary: 'Benchmark Atlas context-pack selection.',
    description: 'Runs context-pack benchmark iterations for the atlas graph.',
    usage: '[path] [--iterations <n>] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['[path]'],
    options: [...COMMON_ROOT_OPTIONS, { flags: '--iterations <n>', description: 'Benchmark iterations.' }],
    group: 'Evaluation Commands',
  },
  {
    path: ['doctor'],
    summary: 'Check local Agent Atlas setup.',
    description: 'Reports CLI build state, package versions, supported commands, atlas input, generated docs, and MCP availability.',
    usage: '[path] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['[path]'],
    options: COMMON_ROOT_OPTIONS,
    group: 'Evaluation Commands',
  },
  {
    path: ['boundary-check'],
    summary: 'Check profile boundary safety.',
    description: 'Scans atlas metadata and generated docs for public/private boundary issues and secret-shaped values.',
    usage: '[path] [--policy <path>] [--include-generated] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['[path]'],
    options: [
      ...COMMON_ROOT_OPTIONS,
      { flags: '--policy <path>', description: 'Boundary policy path.' },
      { flags: '--include-generated', description: 'Include generated Markdown in the boundary scan.' },
    ],
    group: 'Evaluation Commands',
  },
  {
    path: ['usage-note'],
    summary: 'Record local Atlas usage evidence.',
    description: 'Writes a local usage receipt for context-pack, path-resolution, or fallback evidence.',
    usage: '<task> [--command <command>] [--entity <id>] [--file <path>] [--test <command>] [--missing-card <note>] [--misleading-card <note>] [--out <path>] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['<task>'],
    options: [
      ...COMMON_ROOT_OPTIONS,
      { flags: '--command <command>', description: 'Atlas command used.' },
      { flags: '--entity <id>', description: 'Selected entity; repeatable.' },
      { flags: '--file <path>', description: 'Selected file; repeatable.' },
      { flags: '--test <command>', description: 'Selected verification command; repeatable.' },
      { flags: '--missing-card <note>', description: 'Missing card observation.' },
      { flags: '--misleading-card <note>', description: 'Misleading card observation.' },
      { flags: '--out <path>', description: 'Usage receipt output path.' },
    ],
    group: 'Evaluation Commands',
  },
  {
    path: ['evaluate'],
    summary: 'Evaluate Atlas usage evidence.',
    description: 'Aggregates local usage receipts and reports recall and adoption evidence.',
    usage: '[path] [--receipts <path>] [--budget <tokens>] [--evaluation-version <id>] [--out <path>] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['[path]'],
    options: [
      ...COMMON_ROOT_OPTIONS,
      { flags: '--receipts <path>', description: 'Usage receipt directory.' },
      { flags: '--budget <tokens>', description: 'Context budget.' },
      { flags: '--evaluation-version <id>', description: 'Caller-owned evaluation version.' },
      { flags: '--out <path>', description: 'Write evaluation JSON.' },
    ],
    group: 'Evaluation Commands',
  },
  {
    path: ['mcp', 'smoke-test'],
    summary: 'Run MCP smoke tests.',
    description: 'Checks the read-only MCP path-resolution and context-pack tools against the atlas.',
    usage: '[path] [--path <root>] [--profile <profile>] [--resolve-path <path>] [--task <task>] [--budget <tokens>] [--json]',
    arguments: ['[path]'],
    options: [
      ...COMMON_ROOT_OPTIONS,
      { flags: '--resolve-path <path>', description: 'Path to resolve through MCP.' },
      { flags: '--task <task>', description: 'Task text for context-pack smoke test.' },
      { flags: '--budget <tokens>', description: 'Context-pack budget.' },
    ],
    group: 'Integration Commands',
  },
  {
    path: ['ui'],
    summary: 'Start the local Atlas review UI.',
    description: 'Serves the read-only local UI for graph browsing, diagnostics, path resolution, and context-pack previews.',
    usage: '[path] [--host <host>] [--port <port>] [--path <root>] [--profile <profile>]',
    arguments: ['[path]'],
    options: [
      { flags: '--path <root>', description: 'Atlas root path.' },
      { flags: '--profile <profile>', description: 'Atlas profile.' },
      { flags: '--host <host>', description: 'Server host.' },
      { flags: '--port <port>', description: 'Server port.' },
    ],
    group: 'Integration Commands',
  },
  {
    path: ['global', 'validate'],
    summary: 'Validate a global Atlas registry.',
    description: 'Loads registry imports and validates the merged cross-repo graph.',
    usage: '[path] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['[path]'],
    options: COMMON_ROOT_OPTIONS,
    group: 'Global Registry Commands',
  },
  {
    path: ['global', 'list'],
    summary: 'List global Atlas registry entities.',
    description: 'Prints entities from the merged cross-repo registry graph.',
    usage: '[path] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['[path]'],
    options: COMMON_ROOT_OPTIONS,
    group: 'Global Registry Commands',
  },
  {
    path: ['global', 'manifest'],
    summary: 'Print a global registry manifest.',
    description: 'Renders a compact manifest for cross-repo registry imports.',
    usage: '[path] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['[path]'],
    options: COMMON_ROOT_OPTIONS,
    group: 'Global Registry Commands',
  },
  {
    path: ['global', 'context-pack'],
    summary: 'Build a global registry context pack.',
    description: 'Selects task context across merged cross-repo Atlas imports.',
    usage: '<task> [path] [--budget <tokens>] [--deterministic] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['<task>', '[path]'],
    options: [
      ...COMMON_ROOT_OPTIONS,
      { flags: '--budget <tokens>', description: 'Approximate token budget.' },
      { flags: '--deterministic', description: 'Use deterministic selection.' },
    ],
    group: 'Global Registry Commands',
  },
  {
    path: ['global', 'generate', 'markdown'],
    summary: 'Generate global registry Markdown.',
    description: 'Writes generated Markdown views for a merged global registry graph.',
    usage: '[path] [--output <path>] [--check] [--path <root>] [--profile <profile>] [--json]',
    arguments: ['[path]'],
    options: [
      ...COMMON_ROOT_OPTIONS,
      { flags: '--output <path>', description: 'Generated docs output directory.' },
      { flags: '--check', description: 'Check drift without writing files.' },
    ],
    group: 'Global Registry Commands',
  },
];

export function createAtlasCliProgram(): Command {
  const program = new Command()
    .name('atlas')
    .description('Agent Atlas CLI')
    .helpCommand('help [command]', 'show help for a command')
    .showHelpAfterError('(add --help for additional information)');

  for (const definition of COMMANDS) {
    addCommandDefinition(program, definition);
  }

  return program;
}

function addCommandDefinition(program: Command, definition: AtlasCliCommandDefinition): void {
  let parent = program;
  for (const segment of definition.path.slice(0, -1)) {
    parent = ensureSubcommand(parent, segment);
  }

  const leafName = definition.path.at(-1);
  if (!leafName) {
    return;
  }

  const leaf = new Command(leafName)
    .summary(definition.summary)
    .description(definition.description)
    .usage(definition.usage ?? '')
    .helpGroup(definition.group ?? 'Commands');

  for (const argument of definition.arguments ?? []) {
    leaf.argument(argument);
  }
  for (const option of definition.options ?? []) {
    leaf.option(option.flags, option.description);
  }

  parent.addCommand(leaf);
}

function ensureSubcommand(parent: Command, name: string): Command {
  const existing = parent.commands.find((command) => command.name() === name);
  if (existing) {
    return existing;
  }
  const created = new Command(name)
    .summary(`${name} commands`)
    .description(`${name} commands`)
    .helpGroup('Command Groups');
  parent.addCommand(created);
  return created;
}
