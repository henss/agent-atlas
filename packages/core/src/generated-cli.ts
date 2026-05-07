import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';

import type { AtlasEntity, AtlasEntityId, AtlasVisibility } from '@agent-atlas/schema';

export interface GeneratedCliCommanderSource {
  id: string;
  module: string;
  export: string;
  owner_component: AtlasEntityId;
  command_id_prefix: string;
  cliName?: string;
  defaultVisibility?: AtlasVisibility;
  workflow_relations?: Record<string, AtlasEntityId>;
}

export interface GeneratedCliReferencePolicy {
  path: string;
  auto_regenerate: boolean;
}

export interface GeneratedCliPolicy {
  commander: GeneratedCliCommanderSource[];
  reference?: GeneratedCliReferencePolicy;
}

export interface AtlasCliCommandOption {
  flags: string;
  description?: string;
  required: boolean;
  variadic: boolean;
}

export interface AtlasCliCommandArgument {
  name: string;
  description?: string;
  required: boolean;
  variadic: boolean;
}

export type AtlasCommandImportance = 'primary' | 'common' | 'specialist' | 'maintenance' | 'internal';
export type AtlasCommandLifecycle = 'orient' | 'plan' | 'execute' | 'verify' | 'maintain';
export type AtlasCommandAudience = 'human' | 'agent' | 'automation';

export interface AtlasCommandMetadata {
  importance?: AtlasCommandImportance;
  lifecycle?: AtlasCommandLifecycle[];
  audience?: AtlasCommandAudience[];
  tasks?: string[];
  relatedDocs?: string[];
}

export const ATLAS_COMMAND_METADATA = Symbol.for('agent-atlas.commandMetadata');

export function withAtlasCommandMetadata<T extends object>(command: T, metadata: AtlasCommandMetadata): T {
  Object.defineProperty(command, ATLAS_COMMAND_METADATA, {
    value: normalizeAtlasCommandMetadata(metadata),
    enumerable: false,
    configurable: true,
  });
  return command;
}

export interface AtlasCliCommandRecord {
  id: string;
  entityId: AtlasEntityId;
  commandPath: string[];
  name: string;
  cliName: string;
  usage: string;
  summary: string;
  description: string;
  aliases: string[];
  options: AtlasCliCommandOption[];
  arguments: AtlasCliCommandArgument[];
  group: string;
  groupSummary?: string;
  groupDescription?: string;
  visibility: AtlasVisibility;
  ownerComponentId: AtlasEntityId;
  workflowId?: AtlasEntityId;
  metadata: AtlasCommandMetadata;
}

export interface GeneratedCliLoadResult {
  records: AtlasCliCommandRecord[];
  entities: AtlasEntity[];
  diagnostics: Array<{ level: 'warning' | 'error'; message: string }>;
}

interface CommanderLike {
  commands?: readonly CommanderLike[];
  options?: readonly CommanderOptionLike[];
  registeredArguments?: readonly CommanderArgumentLike[];
  hidden?: boolean;
  name(): string;
  aliases?(): string[];
  description?(): string;
  summary?(): string;
  usage?(): string;
  helpGroup?(): string | undefined;
}

interface CommanderOptionLike {
  flags: string;
  description?: string;
  required?: boolean;
  variadic?: boolean;
}

interface CommanderArgumentLike {
  name(): string;
  description?: string;
  required?: boolean;
  variadic?: boolean;
}

export async function loadGeneratedCliPolicy(rootPath: string): Promise<GeneratedCliPolicy | undefined> {
  const policyPath = await findMaintenancePolicyPath(rootPath);
  if (!policyPath) {
    return undefined;
  }
  const parsed = parse(await readFile(policyPath, 'utf8')) as unknown;
  return readGeneratedCliPolicy(parsed);
}

export async function loadGeneratedCliEntities(rootPath: string): Promise<GeneratedCliLoadResult> {
  const policy = await loadGeneratedCliPolicy(rootPath);
  if (!policy) {
    return { records: [], entities: [], diagnostics: [] };
  }

  const records: AtlasCliCommandRecord[] = [];
  const diagnostics: GeneratedCliLoadResult['diagnostics'] = [];
  for (const source of policy.commander) {
    try {
      const imported = await import(pathToFileURL(path.resolve(rootPath, source.module)).href);
      const factory = imported[source.export] as unknown;
      if (typeof factory !== 'function') {
        diagnostics.push({
          level: 'error',
          message: `Generated CLI source ${source.id} export ${source.export} is not a function.`,
        });
        continue;
      }
      const program = factory() as CommanderLike;
      records.push(...extractCommanderCliCommands(program, source));
    } catch (error) {
      diagnostics.push({
        level: 'error',
        message: `Failed to load generated CLI source ${source.id}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const entities = records.map(commandRecordToEntity);
  return { records, entities, diagnostics };
}

export function extractCommanderCliCommands(
  program: CommanderLike,
  source: GeneratedCliCommanderSource,
): AtlasCliCommandRecord[] {
  const cliName = source.cliName ?? readCommanderName(program) ?? source.id;
  const defaultVisibility = source.defaultVisibility ?? 'public';
  const records: AtlasCliCommandRecord[] = [];
  const groupMetadata = collectCommanderGroupMetadata(program);

  function visit(command: CommanderLike, parentPath: string[]): void {
    const name = readCommanderName(command);
    if (!name) {
      return;
    }
    const commandPath = [...parentPath, name];
    const hasExecutableShape = isExecutableCommanderCommand(command);
    if (command !== program && !isHiddenCommand(command) && hasExecutableShape) {
      const commandId = commandPath.join('-');
      const entityId = `interface:${source.command_id_prefix}.${slugify(commandId)}` as AtlasEntityId;
      const group = readHelpGroup(command) ?? `${commandPath[0]} commands`;
      const groupInfo = groupMetadata.get(normalizeGroupTitle(group));
      const summary = readSummary(command);
      const description = readDescription(command);
      records.push({
        id: `${source.command_id_prefix}.${slugify(commandId)}`,
        entityId,
        commandPath,
        name,
        cliName,
        usage: renderUsage(cliName, commandPath, command),
        summary,
        description,
        aliases: readAliases(command),
        options: readOptions(command),
        arguments: readArguments(command),
        group,
        groupSummary: groupInfo?.summary,
        groupDescription: groupInfo?.description,
        visibility: defaultVisibility,
        ownerComponentId: source.owner_component,
        workflowId: source.workflow_relations?.[commandPath.join(' ')],
        metadata: inferAtlasCommandMetadata({
          commandPath,
          group,
          summary,
          description,
          explicit: readAtlasCommandMetadata(command),
        }),
      });
    }

    for (const child of command.commands ?? []) {
      visit(child, command === program ? [] : commandPath);
    }
  }

  visit(program, []);
  return records.sort((left, right) => left.id.localeCompare(right.id));
}

export function renderCliReferenceMarkdown(records: AtlasCliCommandRecord[]): string {
  const lines = [
    '# CLI Command Reference',
    '',
    '> Generated from Commander command definitions. Edit the CLI program metadata and rerun `atlas cli docs generate`.',
    '',
  ];
  let currentGroup: string | undefined;
  for (const record of [...records].sort(compareCommandRecords)) {
    if (record.group !== currentGroup) {
      currentGroup = record.group;
      lines.push(`## ${titleCase(record.group.replace(/:$/, ''))}`, '');
      const groupDescription = record.groupDescription ?? record.groupSummary;
      if (groupDescription) {
        lines.push(groupDescription, '');
      }
    }
    lines.push(`### \`${record.usage}\``, '', record.summary, '');
    if (record.description && record.description !== record.summary) {
      lines.push(record.description, '');
    }
    if (record.aliases.length > 0) {
      lines.push(`Aliases: ${record.aliases.map((alias) => `\`${alias}\``).join(', ')}`, '');
    }
    lines.push(
      `Relevance: \`${record.metadata.importance ?? 'specialist'}\`${record.metadata.lifecycle?.length ? `; lifecycle: ${record.metadata.lifecycle.map((item) => `\`${item}\``).join(', ')}` : ''}`,
      '',
    );
    if (record.arguments.length > 0) {
      lines.push('Arguments:');
      for (const argument of record.arguments) {
        lines.push(`- \`${argument.name}\`${argument.required ? ' (required)' : ''}${argument.variadic ? ' (variadic)' : ''}${argument.description ? ` - ${argument.description}` : ''}`);
      }
      lines.push('');
    }
    if (record.options.length > 0) {
      lines.push('Options:');
      for (const option of record.options) {
        lines.push(`- \`${option.flags}\`${option.required ? ' (value required)' : ''}${option.variadic ? ' (repeatable)' : ''}${option.description ? ` - ${option.description}` : ''}`);
      }
      lines.push('');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function commandRecordToEntity(record: AtlasCliCommandRecord): AtlasEntity {
  const relations: NonNullable<AtlasEntity['relations']> = [
    { type: 'part-of', target: record.ownerComponentId },
  ];
  if (record.workflowId) {
    relations.push({ type: 'implements', target: record.workflowId });
  }
  return {
    id: record.entityId,
    kind: 'interface',
    title: `${record.cliName} ${record.commandPath.join(' ')}`,
    summary: record.summary,
    visibility: record.visibility,
    aliases: record.aliases,
    tags: ['cli-command', record.cliName],
    uri: record.usage,
    relations,
    metadata: {
      cli: {
        id: record.id,
        cli_name: record.cliName,
        command: record.commandPath.join(' '),
        usage: record.usage,
        group: record.group,
        group_summary: record.groupSummary,
        group_description: record.groupDescription,
        description: record.description,
        aliases: record.aliases,
        arguments: record.arguments,
        options: record.options,
        importance: record.metadata.importance,
        lifecycle: record.metadata.lifecycle,
        audience: record.metadata.audience,
        tasks: record.metadata.tasks,
        related_docs: record.metadata.relatedDocs,
        generated: true,
      },
    },
  };
}

function readAtlasCommandMetadata(command: CommanderLike): AtlasCommandMetadata | undefined {
  const value = (command as unknown as Record<PropertyKey, unknown>)[ATLAS_COMMAND_METADATA];
  return normalizeAtlasCommandMetadata(value);
}

function inferAtlasCommandMetadata(input: {
  commandPath: string[];
  group: string;
  summary: string;
  description: string;
  explicit?: AtlasCommandMetadata;
}): AtlasCommandMetadata {
  const command = input.commandPath.join(' ');
  const text = `${command} ${input.group} ${input.summary} ${input.description}`.toLowerCase();
  const lifecycle = input.explicit?.lifecycle ?? inferLifecycle(text);
  const importance = input.explicit?.importance ?? inferImportance(command, input.group, text, lifecycle);
  const audience = input.explicit?.audience ?? inferAudience(importance, lifecycle);
  const tasks = input.explicit?.tasks ?? [normalizeTaskSummary(input.summary)].filter((item) => item.length > 0);
  const metadata = normalizeAtlasCommandMetadata({
    ...input.explicit,
    importance,
    lifecycle,
    audience,
    tasks,
  });
  if (input.explicit?.relatedDocs?.length) {
    metadata.relatedDocs = input.explicit.relatedDocs;
  }
  return metadata;
}

function inferLifecycle(text: string): AtlasCommandLifecycle[] {
  const lifecycle: AtlasCommandLifecycle[] = [];
  if (/\b(status|show|list|overview|resolve|context|inspect|doctor|preview|diff|discover)\b/.test(text)) {
    lifecycle.push('orient');
  }
  if (/\b(plan|proposal|propose|packet|contract)\b/.test(text)) {
    lifecycle.push('plan');
  }
  if (/\b(start|run|launch|apply|create|record|sync|ingest|serve)\b/.test(text)) {
    lifecycle.push('execute');
  }
  if (/\b(verify|validate|test|check|lint|smoke)\b/.test(text)) {
    lifecycle.push('verify');
  }
  if (/\b(maintain|maintenance|generate|generated|docs|refresh|migrate|fix|benchmark|evaluate)\b/.test(text)) {
    lifecycle.push('maintain');
  }
  return lifecycle.length > 0 ? [...new Set(lifecycle)] : ['execute'];
}

function inferImportance(
  command: string,
  group: string,
  text: string,
  lifecycle: AtlasCommandLifecycle[],
): AtlasCommandImportance {
  const normalizedCommand = command.replace(/\s+/g, ':');
  if (/\b(internal|hidden|debug)\b/.test(text)) {
    return 'internal';
  }
  if (/^(session:start|context-pack|resolve-path|project:status|verify:session)$/.test(normalizedCommand)) {
    return 'primary';
  }
  if (/^(validate|overview|doctor|maintain:check|maintain:fix)$/.test(normalizedCommand)) {
    return 'common';
  }
  if (/\b(maintenance|generated artifact|migration|benchmark|evaluation)\b/i.test(group)) {
    return lifecycle.includes('orient') || lifecycle.includes('verify') ? 'common' : 'maintenance';
  }
  if (lifecycle.includes('orient') || lifecycle.includes('verify')) {
    return 'common';
  }
  return 'specialist';
}

function inferAudience(
  importance: AtlasCommandImportance,
  lifecycle: AtlasCommandLifecycle[],
): AtlasCommandAudience[] {
  if (importance === 'internal') {
    return ['automation'];
  }
  if (lifecycle.includes('maintain') && !lifecycle.includes('orient')) {
    return ['agent', 'automation'];
  }
  return ['human', 'agent'];
}

function normalizeTaskSummary(value: string): string {
  return value.trim().replace(/\.$/, '');
}

function normalizeAtlasCommandMetadata(value: unknown): AtlasCommandMetadata {
  if (!isRecord(value)) {
    return {};
  }
  const importance = readCommandImportance(value.importance);
  const lifecycle = readCommandLifecycleList(value.lifecycle);
  const audience = readCommandAudienceList(value.audience);
  const tasks = readStringList(value.tasks);
  const relatedDocs = readStringList(value.relatedDocs ?? value.related_docs);
  return {
    ...(importance ? { importance } : {}),
    ...(lifecycle?.length ? { lifecycle } : {}),
    ...(audience?.length ? { audience } : {}),
    ...(tasks?.length ? { tasks } : {}),
    ...(relatedDocs?.length ? { relatedDocs } : {}),
  };
}

function readGeneratedCliPolicy(value: unknown): GeneratedCliPolicy | undefined {
  if (!isRecord(value) || !isRecord(value.generated_cli)) {
    return undefined;
  }
  const generatedCli = value.generated_cli;
  const commander = Array.isArray(generatedCli.commander)
    ? generatedCli.commander.map(readCommanderSource).filter((source): source is GeneratedCliCommanderSource => source !== undefined)
    : [];
  if (commander.length === 0) {
    return undefined;
  }
  const reference = isRecord(generatedCli.reference)
    ? {
        path: readString(generatedCli.reference.path, 'docs/generated/cli-command-reference.md'),
        auto_regenerate: readBoolean(generatedCli.reference.auto_regenerate, false),
      }
    : undefined;
  return { commander, reference };
}

function readCommanderSource(value: unknown): GeneratedCliCommanderSource | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = readString(value.id, '');
  const modulePath = readString(value.module, '');
  const exportName = readString(value.export, '');
  const ownerComponent = readString(value.owner_component, '') as AtlasEntityId;
  const commandIdPrefix = readString(value.command_id_prefix, id);
  if (!id || !modulePath || !exportName || !ownerComponent || !commandIdPrefix) {
    return undefined;
  }
  return {
    id,
    module: modulePath,
    export: exportName,
    owner_component: ownerComponent,
    command_id_prefix: commandIdPrefix,
    cliName: readString(value.cli_name, undefined),
    defaultVisibility: readVisibility(value.default_visibility),
    workflow_relations: readWorkflowRelations(value.workflow_relations),
  };
}

async function findMaintenancePolicyPath(rootPath: string): Promise<string | undefined> {
  for (const candidate of [
    path.join(rootPath, 'agent-atlas.maintenance.yaml'),
    path.join(rootPath, '.agent-atlas', 'maintenance.yaml'),
  ]) {
    try {
      await readFile(candidate, 'utf8');
      return candidate;
    } catch {
      // Try the next policy path.
    }
  }
  return undefined;
}

function readCommanderName(command: CommanderLike): string | undefined {
  try {
    const name = command.name();
    return name.trim().length > 0 ? name : undefined;
  } catch {
    return undefined;
  }
}

function readSummary(command: CommanderLike): string {
  const summary = readOptionalSummary(command);
  return summary || readDescription(command) || readCommanderName(command) || 'CLI command.';
}

function readOptionalSummary(command: CommanderLike): string | undefined {
  return safeRead(() => command.summary?.());
}

function readDescription(command: CommanderLike): string {
  return safeRead(() => command.description?.()) || readSummaryFromUsage(command) || '';
}

function readSummaryFromUsage(command: CommanderLike): string {
  return safeRead(() => command.usage?.()) || '';
}

function readUsageSuffix(command: CommanderLike): string {
  return safeRead(() => command.usage?.()) || '';
}

function readExplicitUsageSuffix(command: CommanderLike): string {
  const value = (command as unknown as { _usage?: unknown })._usage;
  return typeof value === 'string' ? value : '';
}

function isExecutableCommanderCommand(command: CommanderLike): boolean {
  return (
    (command.registeredArguments?.length ?? 0) > 0 ||
    (command.options?.length ?? 0) > 0 ||
    readExplicitUsageSuffix(command).trim().length > 0
  );
}

function readAliases(command: CommanderLike): string[] {
  const aliases = safeRead(() => command.aliases?.());
  return Array.isArray(aliases) ? aliases.filter((alias) => typeof alias === 'string' && alias.length > 0) : [];
}

function readHelpGroup(command: CommanderLike): string | undefined {
  return safeRead(() => command.helpGroup?.());
}

function isHiddenCommand(command: CommanderLike): boolean {
  return command.hidden === true || readCommanderName(command) === 'help';
}

function readOptions(command: CommanderLike): AtlasCliCommandOption[] {
  return (command.options ?? []).map((option) => ({
    flags: option.flags,
    description: option.description,
    required: option.required === true,
    variadic: option.variadic === true,
  }));
}

function readArguments(command: CommanderLike): AtlasCliCommandArgument[] {
  return (command.registeredArguments ?? []).map((argument) => ({
    name: argument.name(),
    description: argument.description,
    required: argument.required === true,
    variadic: argument.variadic === true,
  }));
}

function renderUsage(cliName: string, commandPath: string[], command: CommanderLike): string {
  const suffix = readUsageSuffix(command);
  return [cliName, ...commandPath, suffix].filter((part) => part.trim().length > 0).join(' ');
}

function compareCommandRecords(left: AtlasCliCommandRecord, right: AtlasCliCommandRecord): number {
  const groupCompare = left.group.localeCompare(right.group);
  if (groupCompare !== 0) {
    return groupCompare;
  }
  return left.usage.localeCompare(right.usage);
}

function collectCommanderGroupMetadata(program: CommanderLike): Map<string, { summary?: string; description?: string }> {
  const groups = new Map<string, { summary?: string; description?: string }>();

  function visit(command: CommanderLike): void {
    if (command !== program && !isHiddenCommand(command)) {
      const group = readHelpGroup(command);
      const hasExecutableShape = isExecutableCommanderCommand(command);
      if (group && !hasExecutableShape) {
        const summary = readOptionalSummary(command);
        const description = readDescription(command);
        groups.set(normalizeGroupTitle(group), {
          summary: summary && summary !== readCommanderName(command) ? summary : undefined,
          description: description && description !== summary ? description : undefined,
        });
      }
    }

    for (const child of command.commands ?? []) {
      visit(child);
    }
  }

  visit(program);
  return groups;
}

function normalizeGroupTitle(group: string): string {
  return group.replace(/:+$/g, '').trim().toLowerCase();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'command';
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function readWorkflowRelations(value: unknown): Record<string, AtlasEntityId> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const relations: Record<string, AtlasEntityId> = {};
  for (const [key, target] of Object.entries(value)) {
    if (typeof target === 'string') {
      relations[key] = target as AtlasEntityId;
    }
  }
  return Object.keys(relations).length > 0 ? relations : undefined;
}

function readVisibility(value: unknown): AtlasVisibility | undefined {
  return value === 'public' || value === 'private' || value === 'internal' || value === 'restricted'
    ? value
    : undefined;
}

function readCommandImportance(value: unknown): AtlasCommandImportance | undefined {
  return value === 'primary' ||
    value === 'common' ||
    value === 'specialist' ||
    value === 'maintenance' ||
    value === 'internal'
    ? value
    : undefined;
}

function readCommandLifecycleList(value: unknown): AtlasCommandLifecycle[] | undefined {
  const allowed = new Set<AtlasCommandLifecycle>(['orient', 'plan', 'execute', 'verify', 'maintain']);
  return readTypedStringList(value, allowed);
}

function readCommandAudienceList(value: unknown): AtlasCommandAudience[] | undefined {
  const allowed = new Set<AtlasCommandAudience>(['human', 'agent', 'automation']);
  return readTypedStringList(value, allowed);
}

function readTypedStringList<T extends string>(value: unknown, allowed: Set<T>): T[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((item): item is T => typeof item === 'string' && allowed.has(item as T));
  const unique = [...new Set(items)];
  return unique.length > 0 ? unique : undefined;
}

function readStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  const unique = [...new Set(items.map((item) => item.trim()))];
  return unique.length > 0 ? unique : undefined;
}

function readString(value: unknown, fallback: string | undefined): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : (fallback ?? '');
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function safeRead<T>(reader: () => T | undefined): T | undefined {
  try {
    return reader();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
