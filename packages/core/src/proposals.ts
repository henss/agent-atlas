import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse, stringify } from 'yaml';

import type { AtlasEntity, AtlasEntityId } from '@agent-atlas/schema';
import { createContextPack } from './context-pack.js';
import type { AtlasDiagnostic } from './diagnostics.js';
import { loadAtlasGraph, type AtlasGraph } from './graph.js';
import type { AtlasProfile } from './profile.js';
import { analyzeAtlasMaintenance } from './authoring.js';
import { evaluateUsageEvidence, type UsageEvidenceReceiptResult } from './usage-evidence.js';

export type AtlasGapType =
  | 'missing-card'
  | 'misleading-card'
  | 'low-recall'
  | 'resolve-path-miss'
  | 'broad-search-fallback'
  | 'maintenance-diagnostic'
  | 'untracked-document'
  | 'stale-summary'
  | 'weak-relation-coverage'
  | 'under-modeled-capability';

export interface AtlasGapSource {
  kind: 'usage-receipt' | 'resolve-path' | 'diff' | 'static';
  path?: string;
  task?: string;
  detail: string;
}

export interface AtlasGap {
  id: string;
  type: AtlasGapType;
  taskLabels: string[];
  affectedPaths: string[];
  expectedEntities: AtlasEntityId[];
  expectedFiles: string[];
  expectedTests: string[];
  confidence: number;
  recommendedAction: 'propose-card' | 'observe' | 'fix-existing-card';
  sources: AtlasGapSource[];
  blockedReasons: string[];
}

export interface AtlasGapReport {
  version: 1;
  generatedAt: string;
  repo: string;
  profile: AtlasProfile;
  receiptCount: number;
  gaps: AtlasGap[];
  notes: string[];
}

export interface DiscoverAtlasGapsOptions {
  profile?: AtlasProfile;
  receiptsPath?: string;
  budget?: number;
  recallThreshold?: number;
  resolvePathMisses?: string[];
  static?: boolean;
  now?: Date;
}

export interface ProposedAtlasEntity {
  id: AtlasEntityId;
  kind: 'component' | 'workflow' | 'test-scope' | 'document';
  filePath: string;
  yaml: string;
  sourceGapIds: string[];
}

export interface AtlasCardProposal {
  version: 1;
  generatedAt: string;
  repo: string;
  profile: AtlasProfile;
  gapSources: AtlasGapSource[];
  proposedEntities: ProposedAtlasEntity[];
  sourceEvidence: {
    gapIds: string[];
    taskLabels: string[];
    affectedPaths: string[];
  };
  confidence: number;
  blockedReasons: string[];
  validationCommands: string[];
  boundaryCheckRequired: boolean;
  llm?: {
    provider: string;
    status: 'not-requested' | 'enriched' | 'unsupported';
    notes: string[];
  };
}

export interface ProposeAtlasCardsOptions {
  llm?: boolean;
  llmProvider?: string;
  now?: Date;
}

export interface AtlasProposalValidationResult {
  proposalPath: string;
  repo: string;
  profile: AtlasProfile;
  proposedEntityCount: number;
  diagnostics: AtlasDiagnostic[];
  status: 'passed' | 'failed';
}

export interface ApplyAtlasProposalOptions {
  selectEntityIds: AtlasEntityId[];
  now?: Date;
}

export interface ApplyAtlasProposalResult {
  proposalPath: string;
  appliedFiles: string[];
  skippedEntityIds: AtlasEntityId[];
}

const DEFAULT_RECALL_THRESHOLD = 0.67;
const DOCUMENT_INVENTORY_ROOTS = [
  'README.md',
  'ROADMAP.md',
  'docs/concepts',
  'docs/guides',
  'docs/spec',
  'docs/ci',
  'packages',
];
const CLI_CAPABILITY_CHECKS: Array<{ id: string; commands: string[]; keywords: string[] }> = [
  { id: 'graph-navigation', commands: ['validate', 'overview', 'show', 'neighbors', 'resolve-path'], keywords: ['navigate', 'graph'] },
  { id: 'context-packs', commands: ['context-pack'], keywords: ['context', 'pack'] },
  { id: 'generated-docs', commands: ['generate markdown'], keywords: ['generate', 'docs'] },
  { id: 'metadata-maintenance', commands: ['suggest-card', 'discover-gaps', 'propose-cards', 'maintain', 'diff'], keywords: ['maintain', 'metadata'] },
  { id: 'boundary-safety', commands: ['boundary-check'], keywords: ['boundary'] },
  { id: 'adoption-evidence', commands: ['usage-note', 'evaluate'], keywords: ['adoption'] },
  { id: 'mcp', commands: ['mcp smoke-test'], keywords: ['mcp'] },
  { id: 'review-ui', commands: ['ui'], keywords: ['review', 'graph'] },
  { id: 'cross-repo-registry', commands: ['global validate', 'global list', 'global manifest', 'global context-pack', 'global generate markdown'], keywords: ['cross-repo', 'registry'] },
  { id: 'downstream-onboarding', commands: ['doctor'], keywords: ['downstream'] },
];

export async function discoverAtlasGaps(
  rootPath: string,
  options: DiscoverAtlasGapsOptions = {},
): Promise<AtlasGapReport> {
  const repo = path.resolve(rootPath);
  const profile = options.profile ?? 'public';
  const recallThreshold = options.recallThreshold ?? DEFAULT_RECALL_THRESHOLD;
  const evaluation = await evaluateUsageEvidence(repo, {
    profile,
    receiptsPath: options.receiptsPath,
    budget: options.budget,
  });
  const graph = await loadAtlasGraph(repo, { profile });
  const gaps = new Map<string, AtlasGap>();

  collectReceiptGaps(gaps, evaluation.receipts, recallThreshold);
  await collectResolvePathMisses(gaps, repo, graph, options.resolvePathMisses ?? []);
  await collectMaintenanceGaps(gaps, graph);
  if (options.static !== false) {
    await collectStaticMetadataGaps(gaps, repo, graph);
  }

  return {
    version: 1,
    generatedAt: (options.now ?? new Date()).toISOString(),
    repo,
    profile,
    receiptCount: evaluation.receiptCount,
    gaps: [...gaps.values()].sort((left, right) => left.id.localeCompare(right.id)),
    notes: [
      'Discovery is read-only and local-only.',
      options.static === false ? 'Static metadata coverage checks were disabled.' : 'Static metadata coverage checks are enabled.',
      'Only actionable repeated or low-recall gaps should be passed to card proposals.',
    ],
  };
}

export function proposeAtlasCards(
  report: AtlasGapReport,
  options: ProposeAtlasCardsOptions = {},
): AtlasCardProposal {
  const actionable = report.gaps.filter(isActionableGap);
  const taskLabels = uniqueSorted(actionable.flatMap((gap) => gap.taskLabels));
  const affectedPaths = uniqueSorted(actionable.flatMap((gap) => gap.affectedPaths));
  const gapIds = actionable.map((gap) => gap.id);
  const proposedEntities = buildProposedEntities(report, actionable);
  const blockedReasons = uniqueSorted([
    ...actionable.flatMap((gap) => gap.blockedReasons),
    ...(proposedEntities.length === 0 ? ['No concrete affected paths or repeated task family to propose.'] : []),
  ]);
  const llm = createLlmProposalMetadata(options, proposedEntities);

  return {
    version: 1,
    generatedAt: (options.now ?? new Date()).toISOString(),
    repo: report.repo,
    profile: report.profile,
    gapSources: actionable.flatMap((gap) => gap.sources),
    proposedEntities,
    sourceEvidence: {
      gapIds,
      taskLabels,
      affectedPaths,
    },
    confidence: actionable.length === 0 ? 0 : round(average(actionable.map((gap) => gap.confidence))),
    blockedReasons,
    validationCommands: [
      `atlas proposal validate <proposal> --path ${quoteForCommand(report.repo)}`,
      `atlas validate ${quoteForCommand(report.repo)} --profile ${report.profile}`,
      `atlas boundary-check ${quoteForCommand(report.repo)} --profile ${report.profile}`,
      `atlas generate markdown ${quoteForCommand(report.repo)} --output ${quoteForCommand(path.join(report.repo, 'docs', 'agents'))} --profile ${report.profile} --check`,
    ],
    boundaryCheckRequired: true,
    llm,
  };
}

export async function writeAtlasCardProposal(
  proposal: AtlasCardProposal,
  outputDirectory: string,
): Promise<string> {
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, `${slugify(proposal.sourceEvidence.taskLabels.join(' ') || 'atlas-proposal')}.yaml`);
  await writeFile(outputPath, stringify(proposal), 'utf8');
  return outputPath;
}

export async function readAtlasCardProposal(proposalPath: string): Promise<AtlasCardProposal> {
  const parsed = parse(await readFile(proposalPath, 'utf8')) as unknown;
  if (!isRecord(parsed) || parsed.version !== 1) {
    throw new Error('Invalid Atlas proposal: expected version 1.');
  }
  return parsed as unknown as AtlasCardProposal;
}

export async function validateAtlasProposal(
  proposalPath: string,
  rootPath?: string,
): Promise<AtlasProposalValidationResult> {
  const proposal = await readAtlasCardProposal(proposalPath);
  const repo = path.resolve(rootPath ?? proposal.repo);
  const graph = await loadAtlasGraph(repo, { profile: proposal.profile });
  const existingIds = new Set(graph.entities.map((entity) => entity.id));
  const diagnostics: AtlasDiagnostic[] = [];

  for (const entity of proposal.proposedEntities) {
    if (existingIds.has(entity.id)) {
      diagnostics.push(makeDiagnostic('error', 'PROPOSAL_DUPLICATE_ENTITY', `Proposed entity ${entity.id} already exists.`, 'Choose a different ID or update the existing card.', entity.id));
    }
    if (!entity.yaml.includes(`id: ${entity.id}`) || !entity.yaml.includes(`kind: ${entity.kind}`)) {
      diagnostics.push(makeDiagnostic('error', 'PROPOSAL_ENTITY_YAML_MISMATCH', `Proposed entity ${entity.id} YAML does not match proposal metadata.`, 'Regenerate or repair the proposal.', entity.id));
    }
    for (const codePath of extractYamlList(entity.yaml, 'paths')) {
      if (!isSafeRelativePath(codePath)) {
        diagnostics.push(makeDiagnostic('error', 'PROPOSAL_UNSAFE_PATH', `Proposed path ${codePath} is not repo-relative.`, 'Use repo-relative paths only.', entity.id));
      }
    }
    if (proposal.profile === 'public') {
      checkPublicProposalBoundary(entity, diagnostics);
    }
  }

  if (proposal.proposedEntities.length === 0) {
    diagnostics.push(makeDiagnostic('error', 'PROPOSAL_EMPTY', 'Proposal contains no entities to apply.', 'Regenerate from actionable gaps.'));
  }

  return {
    proposalPath: path.resolve(proposalPath),
    repo,
    profile: proposal.profile,
    proposedEntityCount: proposal.proposedEntities.length,
    diagnostics,
    status: diagnostics.some((diagnostic) => diagnostic.level === 'error') ? 'failed' : 'passed',
  };
}

export async function applyAtlasProposal(
  proposalPath: string,
  options: ApplyAtlasProposalOptions,
): Promise<ApplyAtlasProposalResult> {
  const proposal = await readAtlasCardProposal(proposalPath);
  const validation = await validateAtlasProposal(proposalPath, proposal.repo);
  if (validation.status === 'failed') {
    throw new Error('Atlas proposal validation failed; refusing to apply.');
  }
  if (options.selectEntityIds.length === 0) {
    throw new Error('Select at least one proposed entity with --select <entity-id>.');
  }

  const selected = new Set(options.selectEntityIds);
  const appliedFiles: string[] = [];
  const skippedEntityIds: AtlasEntityId[] = [];

  for (const entity of proposal.proposedEntities) {
    if (!selected.has(entity.id)) {
      skippedEntityIds.push(entity.id);
      continue;
    }
    const outputPath = path.join(proposal.repo, '.agent-atlas', proposal.profile, entity.filePath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, entity.yaml.endsWith('\n') ? entity.yaml : `${entity.yaml}\n`, 'utf8');
    appliedFiles.push(outputPath);
  }

  return {
    proposalPath: path.resolve(proposalPath),
    appliedFiles,
    skippedEntityIds,
  };
}

function collectReceiptGaps(
  gaps: Map<string, AtlasGap>,
  receipts: UsageEvidenceReceiptResult[],
  recallThreshold: number,
): void {
  const missingPhraseCounts = countPhrases(receipts.flatMap((receipt) => receipt.missingCards));
  const misleadingPhraseCounts = countPhrases(receipts.flatMap((receipt) => receipt.misleadingCards));
  const fallbackTaskCounts = countPhrases(
    receipts.filter((receipt) => receipt.broadSearchFallback).map((receipt) => taskFamily(receipt.task)),
  );

  for (const receipt of receipts) {
    for (const phrase of receipt.missingCards) {
      const repeated = (missingPhraseCounts.get(normalizePhrase(phrase)) ?? 0) >= 2;
      addGap(gaps, {
        id: `missing-card:${slugify(phrase)}`,
        type: 'missing-card',
        taskLabels: [receipt.task],
        affectedPaths: receipt.expectedFiles,
        expectedEntities: receipt.expectedEntities,
        expectedFiles: receipt.expectedFiles,
        expectedTests: receipt.expectedTests,
        confidence: repeated ? 0.82 : 0.42,
        recommendedAction: repeated ? 'propose-card' : 'observe',
        sources: [{ kind: 'usage-receipt', path: receipt.path, task: receipt.task, detail: phrase }],
        blockedReasons: repeated ? [] : ['Missing-card phrase has not repeated yet.'],
      });
    }

    for (const phrase of receipt.misleadingCards) {
      const repeated = (misleadingPhraseCounts.get(normalizePhrase(phrase)) ?? 0) >= 2;
      addGap(gaps, {
        id: `misleading-card:${slugify(phrase)}`,
        type: 'misleading-card',
        taskLabels: [receipt.task],
        affectedPaths: receipt.expectedFiles,
        expectedEntities: receipt.expectedEntities,
        expectedFiles: receipt.expectedFiles,
        expectedTests: receipt.expectedTests,
        confidence: repeated ? 0.78 : 0.48,
        recommendedAction: repeated ? 'fix-existing-card' : 'observe',
        sources: [{ kind: 'usage-receipt', path: receipt.path, task: receipt.task, detail: phrase }],
        blockedReasons: repeated ? [] : ['Misleading-card phrase has not repeated yet.'],
      });
    }

    addLowRecallGap(gaps, receipt, 'entities', receipt.entityRecall, receipt.expectedEntities, recallThreshold);
    addLowRecallGap(gaps, receipt, 'files', receipt.fileRecall, receipt.expectedFiles, recallThreshold);
    addLowRecallGap(gaps, receipt, 'tests', receipt.testRecall, receipt.expectedTests, recallThreshold);

    if (receipt.broadSearchFallback) {
      const family = taskFamily(receipt.task);
      const repeated = (fallbackTaskCounts.get(normalizePhrase(family)) ?? 0) >= 2;
      addGap(gaps, {
        id: `broad-search-fallback:${slugify(family)}`,
        type: 'broad-search-fallback',
        taskLabels: [receipt.task],
        affectedPaths: receipt.expectedFiles,
        expectedEntities: receipt.expectedEntities,
        expectedFiles: receipt.expectedFiles,
        expectedTests: receipt.expectedTests,
        confidence: repeated ? 0.72 : 0.38,
        recommendedAction: repeated ? 'propose-card' : 'observe',
        sources: [{ kind: 'usage-receipt', path: receipt.path, task: receipt.task, detail: 'Broad search fallback was still needed.' }],
        blockedReasons: repeated ? [] : ['Broad-search fallback has not repeated for this task family yet.'],
      });
    }
  }
}

function addLowRecallGap(
  gaps: Map<string, AtlasGap>,
  receipt: UsageEvidenceReceiptResult,
  category: 'entities' | 'files' | 'tests',
  recall: number | null,
  expected: string[],
  threshold: number,
): void {
  if (recall === null || recall >= threshold || expected.length === 0) {
    return;
  }
  addGap(gaps, {
    id: `low-recall:${category}:${slugify(taskFamily(receipt.task))}`,
    type: 'low-recall',
    taskLabels: [receipt.task],
    affectedPaths: category === 'files' ? expected : receipt.expectedFiles,
    expectedEntities: receipt.expectedEntities,
    expectedFiles: receipt.expectedFiles,
    expectedTests: receipt.expectedTests,
    confidence: 0.86,
    recommendedAction: 'propose-card',
    sources: [{ kind: 'usage-receipt', path: receipt.path, task: receipt.task, detail: `${category} recall ${recall} below ${threshold}.` }],
    blockedReasons: [],
  });
}

async function collectResolvePathMisses(
  gaps: Map<string, AtlasGap>,
  repo: string,
  graph: AtlasGraph,
  misses: string[],
): Promise<void> {
  for (const miss of misses) {
    const absolute = path.resolve(repo, miss);
    const relative = normalizePath(path.relative(repo, absolute));
    const alreadyCovered = graph.entities.some((entity) =>
      (entity.code?.paths ?? []).some((candidate) => candidate === relative || candidate === `${path.dirname(relative)}/**`),
    );
    if (alreadyCovered) {
      continue;
    }
    addGap(gaps, {
      id: `resolve-path-miss:${slugify(relative)}`,
      type: 'resolve-path-miss',
      taskLabels: [],
      affectedPaths: [relative],
      expectedEntities: [],
      expectedFiles: [relative],
      expectedTests: [],
      confidence: 0.76,
      recommendedAction: 'propose-card',
      sources: [{ kind: 'resolve-path', path: relative, detail: 'resolve-path returned no owning card.' }],
      blockedReasons: [],
    });
  }
}

async function collectMaintenanceGaps(gaps: Map<string, AtlasGap>, graph: AtlasGraph): Promise<void> {
  const report = await analyzeAtlasMaintenance(graph);
  for (const diagnostic of report.diagnostics) {
    addGap(gaps, {
      id: `maintenance:${diagnostic.code}:${slugify(diagnostic.entityId ?? diagnostic.message)}`,
      type: 'maintenance-diagnostic',
      taskLabels: [],
      affectedPaths: [],
      expectedEntities: diagnostic.entityId ? [diagnostic.entityId as AtlasEntityId] : [],
      expectedFiles: [],
      expectedTests: [],
      confidence: diagnostic.level === 'error' ? 0.9 : 0.58,
      recommendedAction: diagnostic.level === 'error' ? 'fix-existing-card' : 'observe',
      sources: [{ kind: 'diff', detail: `${diagnostic.code}: ${diagnostic.message}` }],
      blockedReasons: diagnostic.level === 'error' ? [] : ['Maintenance diagnostic is a warning; inspect before proposing new cards.'],
    });
  }
}

async function collectStaticMetadataGaps(
  gaps: Map<string, AtlasGap>,
  repo: string,
  graph: AtlasGraph,
): Promise<void> {
  const documentEntities = graph.entities.filter((entity) => entity.kind === 'document');
  const trackedDocuments = new Set(documentEntities.flatMap(documentReferencePaths));

  for (const filePath of await collectSourceDocumentPaths(repo)) {
    if (trackedDocuments.has(filePath)) {
      continue;
    }
    addGap(gaps, {
      id: `untracked-document:${slugify(filePath)}`,
      type: 'untracked-document',
      taskLabels: [],
      affectedPaths: [filePath],
      expectedEntities: [],
      expectedFiles: [filePath],
      expectedTests: [],
      confidence: 0.84,
      recommendedAction: 'propose-card',
      sources: [{ kind: 'static', path: filePath, detail: `Document ${filePath} has no document entity card.` }],
      blockedReasons: [],
    });
  }

  await collectStaleSummaryGaps(gaps, repo, documentEntities);
  collectWeakRelationCoverageGaps(gaps, documentEntities);
  await collectUnderModeledCapabilityGaps(gaps, repo, graph);
}

async function collectStaleSummaryGaps(
  gaps: Map<string, AtlasGap>,
  repo: string,
  documentEntities: AtlasEntity[],
): Promise<void> {
  for (const entity of documentEntities) {
    for (const filePath of documentReferencePaths(entity)) {
      const source = await readTextFile(path.join(repo, filePath));
      if (!source) {
        continue;
      }
      const sourceMilestone = highestMilestone(source);
      const summaryMilestone = highestMilestone(entity.summary);
      if (sourceMilestone === undefined || summaryMilestone === undefined || sourceMilestone <= summaryMilestone) {
        continue;
      }
      addGap(gaps, {
        id: `stale-summary:${slugify(entity.id)}`,
        type: 'stale-summary',
        taskLabels: [],
        affectedPaths: [filePath],
        expectedEntities: [entity.id],
        expectedFiles: [filePath],
        expectedTests: [],
        confidence: 0.82,
        recommendedAction: 'fix-existing-card',
        sources: [{ kind: 'static', path: filePath, detail: `${entity.id} summary mentions M0-M${summaryMilestone}, but ${filePath} mentions M0-M${sourceMilestone}.` }],
        blockedReasons: [],
      });
    }
  }
}

function collectWeakRelationCoverageGaps(
  gaps: Map<string, AtlasGap>,
  documentEntities: AtlasEntity[],
): void {
  for (const entity of documentEntities) {
    if (isGeneratedSourceEntity(entity)) {
      continue;
    }
    const usefulRelations = (entity.relations ?? []).filter((relation) =>
      ['documents', 'documented-in', 'part-of'].includes(relation.type)
        && /^(workflow|component|domain|document):/.test(relation.target),
    );
    if (usefulRelations.length > 0) {
      continue;
    }
    addGap(gaps, {
      id: `weak-relation-coverage:${slugify(entity.id)}`,
      type: 'weak-relation-coverage',
      taskLabels: [],
      affectedPaths: documentReferencePaths(entity),
      expectedEntities: [entity.id],
      expectedFiles: documentReferencePaths(entity),
      expectedTests: [],
      confidence: 0.62,
      recommendedAction: 'fix-existing-card',
      sources: [{ kind: 'static', detail: `${entity.id} is not linked to a workflow, component, domain, or documenting document.` }],
      blockedReasons: [],
    });
  }
}

function isGeneratedSourceEntity(entity: AtlasEntity): boolean {
  const generatedSource = entity.metadata?.generated_source;
  return typeof generatedSource === 'object' && generatedSource !== null;
}

async function collectUnderModeledCapabilityGaps(
  gaps: Map<string, AtlasGap>,
  repo: string,
  graph: AtlasGraph,
): Promise<void> {
  const cliReadme = await readTextFile(path.join(repo, 'packages', 'cli', 'README.md'));
  if (!cliReadme) {
    return;
  }

  const implementedCommands = extractCliCommands(cliReadme);
  const workflowText = graph.entities
    .filter((entity) => entity.kind === 'workflow')
    .map((entity) => [
      entity.id,
      entity.title,
      entity.summary,
      ...(entity.agent?.load_when ?? []),
      ...(entity.relations ?? []).map((relation) => relation.target),
    ].join(' ').toLowerCase())
    .join('\n');

  for (const capability of CLI_CAPABILITY_CHECKS) {
    if (!capability.commands.some((command) => implementedCommands.has(command))) {
      continue;
    }
    if (capability.keywords.every((keyword) => workflowText.includes(keyword))) {
      continue;
    }
    addGap(gaps, {
      id: `under-modeled-capability:${capability.id}`,
      type: 'under-modeled-capability',
      taskLabels: [],
      affectedPaths: ['packages/cli/README.md'],
      expectedEntities: [],
      expectedFiles: ['packages/cli/README.md'],
      expectedTests: [],
      confidence: 0.6,
      recommendedAction: 'observe',
      sources: [{ kind: 'static', path: 'packages/cli/README.md', detail: `CLI capability ${capability.id} appears implemented but lacks a clear workflow route.` }],
      blockedReasons: ['Semantic capability gaps need human review or repeated usage evidence before proposing workflow cards.'],
    });
  }
}

function buildProposedEntities(report: AtlasGapReport, gaps: AtlasGap[]): ProposedAtlasEntity[] {
  const proposed: ProposedAtlasEntity[] = [];
  const documentGaps = gaps.filter((gap) => gap.type === 'untracked-document' && gap.recommendedAction === 'propose-card');
  for (const gap of documentGaps) {
    const filePath = gap.affectedPaths[0];
    if (!filePath) {
      continue;
    }
    const slug = slugify(filePath.replace(/\.[^.]+$/, ''));
    const id = `document:${slug}` as AtlasEntityId;
    const title = titleFromSlug(slug.split('-').slice(-3).join('-') || slug);
    const yaml = [
      `id: ${id}`,
      'kind: document',
      `title: ${title}`,
      `summary: Documents ${filePath}.`,
      `visibility: ${report.profile}`,
      `uri: ${filePath}`,
      'relations:',
      '  - type: part-of',
      '    target: domain:agent-atlas',
      'agent:',
      '  risk_notes:',
      '    - Draft document proposal from static Atlas coverage discovery; connect it to the most specific workflow or component before applying.',
      '',
    ].join('\n');
    proposed.push({ id, kind: 'document', filePath: `documents/${slug}.yaml`, yaml, sourceGapIds: [gap.id] });
  }

  const pathGaps = gaps.filter((gap) =>
    gap.type !== 'untracked-document' && gap.affectedPaths.length > 0 && gap.recommendedAction === 'propose-card',
  );
  const groupedByDirectory = groupBy(pathGaps, (gap) => commonDirectory(gap.affectedPaths));

  for (const [directory, group] of groupedByDirectory) {
    const slug = slugify(directory === '.' ? taskFamily(group[0]?.taskLabels[0] ?? 'atlas seam') : directory);
    const title = titleFromSlug(slug);
    const id = `component:${slug}` as AtlasEntityId;
    const yaml = [
      `id: ${id}`,
      'kind: component',
      `title: ${title}`,
      `summary: Owns the Atlas coverage gap around ${directory === '.' ? taskFamily(group[0]?.taskLabels[0] ?? 'recent agent work') : directory}.`,
      `visibility: ${report.profile}`,
      'code:',
      '  paths:',
      ...uniqueSorted(group.flatMap((gap) => gap.affectedPaths)).map((filePath) => `    - ${directoryGlob(filePath)}`),
      'relations:',
      ...defaultRelationsForProposal(group),
      'agent:',
      '  load_when:',
      ...uniqueSorted(group.flatMap((gap) => gap.taskLabels)).slice(0, 4).map((task) => `    - ${escapeYamlString(task)}`),
      '  risk_notes:',
      '    - Draft proposal from local Atlas usage evidence; review scope before applying.',
      '',
    ].join('\n');
    proposed.push({
      id,
      kind: 'component',
      filePath: `components/${slug}.yaml`,
      yaml,
      sourceGapIds: group.map((gap) => gap.id),
    });
  }

  const taskOnlyGaps = gaps.filter((gap) => gap.affectedPaths.length === 0 && gap.recommendedAction === 'propose-card');
  for (const gap of taskOnlyGaps) {
    const slug = slugify(taskFamily(gap.taskLabels[0] ?? gap.id));
    const id = `workflow:${slug}` as AtlasEntityId;
    const yaml = [
      `id: ${id}`,
      'kind: workflow',
      `title: ${titleFromSlug(slug)}`,
      `summary: Routes recurring Atlas coverage gaps for ${taskFamily(gap.taskLabels[0] ?? gap.id)}.`,
      `visibility: ${report.profile}`,
      'relations: []',
      'agent:',
      '  load_when:',
      ...gap.taskLabels.slice(0, 4).map((task) => `    - ${escapeYamlString(task)}`),
      '  risk_notes:',
      '    - Draft workflow proposal from repeated Atlas usage evidence; connect concrete components before applying broadly.',
      '',
    ].join('\n');
    proposed.push({ id, kind: 'workflow', filePath: `workflows/${slug}.yaml`, yaml, sourceGapIds: [gap.id] });
  }

  return dedupeProposedEntities(proposed);
}

function createLlmProposalMetadata(
  options: ProposeAtlasCardsOptions,
  proposedEntities: ProposedAtlasEntity[],
): AtlasCardProposal['llm'] {
  if (!options.llm && !options.llmProvider) {
    return { provider: 'none', status: 'not-requested', notes: [] };
  }
  const provider = options.llmProvider ?? 'mock';
  if (provider !== 'mock') {
    return {
      provider,
      status: 'unsupported',
      notes: ['No live LLM provider is wired in this local-only implementation; proposal remains deterministic.'],
    };
  }
  for (const entity of proposedEntities) {
    entity.yaml = entity.yaml.replace(
      'Draft proposal from local Atlas usage evidence; review scope before applying.',
      'LLM-enrichment mock kept this draft local-only; review scope before applying.',
    );
  }
  return {
    provider,
    status: 'enriched',
    notes: ['Mock enrichment changed only reviewer-facing risk notes; no paths, IDs, relations, or commands were invented.'],
  };
}

function isActionableGap(gap: AtlasGap): boolean {
  return gap.recommendedAction === 'propose-card' && gap.confidence >= 0.6;
}

function addGap(gaps: Map<string, AtlasGap>, next: AtlasGap): void {
  const existing = gaps.get(next.id);
  if (!existing) {
    gaps.set(next.id, next);
    return;
  }
  existing.taskLabels = uniqueSorted([...existing.taskLabels, ...next.taskLabels]);
  existing.affectedPaths = uniqueSorted([...existing.affectedPaths, ...next.affectedPaths]);
  existing.expectedEntities = uniqueSorted([
    ...existing.expectedEntities,
    ...next.expectedEntities,
  ]) as AtlasEntityId[];
  existing.expectedFiles = uniqueSorted([...existing.expectedFiles, ...next.expectedFiles]);
  existing.expectedTests = uniqueSorted([...existing.expectedTests, ...next.expectedTests]);
  existing.confidence = Math.max(existing.confidence, next.confidence);
  existing.sources.push(...next.sources);
  existing.blockedReasons = uniqueSorted([...existing.blockedReasons, ...next.blockedReasons]);
  if (existing.recommendedAction === 'observe' && next.recommendedAction !== 'observe') {
    existing.recommendedAction = next.recommendedAction;
  }
}

function defaultRelationsForProposal(gaps: AtlasGap[]): string[] {
  const entityIds = uniqueSorted(gaps.flatMap((gap) => gap.expectedEntities));
  if (entityIds.length === 0) {
    return ['  []'];
  }
  return entityIds.slice(0, 3).flatMap((entityId) => ['  - type: related-to', `    target: ${entityId}`]);
}

async function collectSourceDocumentPaths(repo: string): Promise<string[]> {
  const documents = new Set<string>();
  for (const root of DOCUMENT_INVENTORY_ROOTS) {
    const absolute = path.join(repo, root);
    if (root.endsWith('.md')) {
      if (await fileExists(absolute)) {
        documents.add(root);
      }
      continue;
    }
    for (const filePath of await collectMarkdownFiles(repo, absolute)) {
      if (filePath.startsWith('docs/agents/')) {
        continue;
      }
      if (root === 'packages' && !/^packages\/[^/]+\/README\.md$/.test(filePath)) {
        continue;
      }
      documents.add(filePath);
    }
  }
  return [...documents].sort();
}

async function collectMarkdownFiles(repo: string, directory: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
        continue;
      }
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(normalizePath(path.relative(repo, entryPath)));
      }
    }
  }
  await walk(directory);
  return files;
}

function documentReferencePaths(entity: AtlasEntity): string[] {
  const references = new Set<string>();
  if (entity.uri && isRepoMarkdownPath(entity.uri)) {
    references.add(normalizePath(entity.uri));
  }
  const documentPaths = (entity as AtlasEntity & { document?: { paths?: string[] } }).document?.paths ?? [];
  for (const filePath of documentPaths) {
    if (isRepoMarkdownPath(filePath)) {
      references.add(normalizePath(filePath));
    }
  }
  return [...references].sort();
}

function isRepoMarkdownPath(value: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && value.endsWith('.md') && isSafeRelativePath(value);
}

async function readTextFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, 'utf8');
    return true;
  } catch {
    return false;
  }
}

function highestMilestone(value: string): number | undefined {
  const milestones = [...value.matchAll(/\bM0\s*-\s*M(\d+)\b/gi)]
    .map((match) => Number(match[1]))
    .filter((milestone) => Number.isFinite(milestone));
  return milestones.length === 0 ? undefined : Math.max(...milestones);
}

function extractCliCommands(readme: string): Set<string> {
  const commands = new Set<string>();
  for (const match of readme.matchAll(/^\s*atlas\s+(.+)$/gm)) {
    const command = normalizeCliCommand(match[1]?.trim() ?? '');
    if (!command) {
      continue;
    }
    commands.add(command);
  }
  return commands;
}

function normalizeCliCommand(value: string): string {
  if (!value || value.startsWith('[')) {
    return '';
  }
  const parts = value.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? '';
  const second = parts[1] ?? '';
  if (['global', 'generate', 'mcp'].includes(first) && second && !second.startsWith('[') && !second.startsWith('<')) {
    return `${first} ${second}`;
  }
  return first;
}

function checkPublicProposalBoundary(entity: ProposedAtlasEntity, diagnostics: AtlasDiagnostic[]): void {
  const content = entity.yaml;
  const rules: Array<[string, RegExp, string]> = [
    ['PROPOSAL_PUBLIC_ISSUE_KEY', /\b[A-Z][A-Z0-9]{1,9}-\d+\b/, 'Remove tracker issue keys from public proposals.'],
    ['PROPOSAL_PUBLIC_LOCAL_USER_PATH', /\b(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/|file:\/\/)/, 'Use repo-relative paths only.'],
    ['PROPOSAL_PUBLIC_PRIVATE_MARKER', /(?:^|[\\/])(?:private|internal|restricted)(?:[\\/]|$)/im, 'Move private markers into private/company proposals.'],
    ['PROPOSAL_PUBLIC_INTERNAL_URL', /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|[^/\s`"')]+\.(?:internal|local|corp))\b/i, 'Remove internal URLs from public proposals.'],
  ];
  for (const [code, pattern, hint] of rules) {
    if (pattern.test(content)) {
      diagnostics.push(makeDiagnostic('error', code, `Proposed public entity ${entity.id} contains boundary-sensitive content.`, hint, entity.id));
    }
  }
}

function extractYamlList(yaml: string, key: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const values: string[] = [];
  let inKey = false;
  for (const line of lines) {
    if (line.trim() === `${key}:`) {
      inKey = true;
      continue;
    }
    if (inKey && /^\S/.test(line)) {
      break;
    }
    const match = inKey ? line.match(/^\s*-\s+(.+)$/) : undefined;
    if (match?.[1]) {
      values.push(match[1].trim());
    }
  }
  return values;
}

function makeDiagnostic(
  level: AtlasDiagnostic['level'],
  code: string,
  message: string,
  hint: string,
  entityId?: string,
): AtlasDiagnostic {
  return { level, code, message, hint, entityId };
}

function countPhrases(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const normalized = normalizePhrase(value);
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return counts;
}

function normalizePhrase(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function taskFamily(task: string): string {
  return task
    .split(/\s+/)
    .filter((word) => !/^(the|a|an|to|for|from|with|and|or|in|on|of)$/i.test(word))
    .slice(0, 7)
    .join(' ');
}

function commonDirectory(paths: string[]): string {
  const first = paths[0];
  if (!first) {
    return '.';
  }
  return normalizePath(path.dirname(first));
}

function directoryGlob(filePath: string): string {
  const directory = normalizePath(path.dirname(filePath));
  return directory === '.' ? filePath : `${directory}/**`;
}

function groupBy<T>(values: T[], keyFor: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return groups;
}

function dedupeProposedEntities(entities: ProposedAtlasEntity[]): ProposedAtlasEntity[] {
  const seen = new Set<string>();
  return entities.filter((entity) => {
    if (seen.has(entity.id)) {
      return false;
    }
    seen.add(entity.id);
    return true;
  });
}

function isSafeRelativePath(value: string): boolean {
  return !path.isAbsolute(value) && !value.startsWith('..') && !value.includes('\\..\\');
}

function quoteForCommand(value: string): string {
  return JSON.stringify(value);
}

function escapeYamlString(value: string): string {
  return JSON.stringify(value);
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'atlas-gap';
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((segment) => `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1)}`)
    .join(' ');
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
