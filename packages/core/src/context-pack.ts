import type { AtlasCommandReference, AtlasEntity, AtlasEntityId } from '@agent-atlas/schema';
import type { AtlasGraph, AtlasGraphEdge } from './graph.js';
import { resolvePathInGraph } from './path-resolution.js';

export interface ContextPackRequest {
  task: string;
  budget?: number;
  profile?: 'public' | 'private' | 'company';
  deterministic?: boolean;
}

export interface ContextPackEntity {
  entity: AtlasEntity;
  score: number;
  provenance: string[];
  via: AtlasGraphEdge[];
  estimatedTokens: number;
}

export interface ContextPackRead {
  value: string;
  sourceEntityId: AtlasEntityId;
  reason: string;
}

export interface ContextPackExternalReference {
  entity: AtlasEntity;
  reference: string;
  reason: string;
}

export interface ContextPackVerification {
  entity: AtlasEntity;
  commands: AtlasCommandReference[];
}

export interface ContextPack {
  task: string;
  budget: number;
  estimatedTokens: number;
  entities: ContextPackEntity[];
  recommendedReads: ContextPackRead[];
  externalReferences: ContextPackExternalReference[];
  verification: ContextPackVerification[];
  risks: string[];
  notes: string[];
}

const DEFAULT_BUDGET = 4000;
const MIN_ENTITY_SCORE = 15;
const TOKEN_RESERVE = 250;
const DIRECT_MATCH_SCORE = 100;
const PATH_OWNER_SCORE = 95;
const PATH_CONTEXT_SCORE = 70;
const NEIGHBOR_BASE_SCORE = 65;
const TEST_SCORE = 72;
const DOCUMENT_SCORE = 68;

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

export function createContextPack(graph: AtlasGraph, request: ContextPackRequest): ContextPack {
  const budget = request.budget ?? DEFAULT_BUDGET;
  const entities = filterEntitiesByProfile(graph.entities, request.profile ?? 'public');
  const entityIds = new Set(entities.map((entity) => entity.id));
  const candidateMap = new Map<AtlasEntityId, ContextPackEntity>();
  const terms = tokenizeTask(request.task);

  addTextMatches(candidateMap, entities, terms);
  addPathMatches(candidateMap, graph, request.task, entityIds);
  addGraphContext(candidateMap, graph, entityIds);
  addTargetedDocsAndTests(candidateMap, graph, entityIds);

  const ranked = [...candidateMap.values()]
    .filter((candidate) => candidate.score >= MIN_ENTITY_SCORE)
    .map((candidate) => ({
      ...candidate,
      estimatedTokens: estimateCandidateTokens(candidate),
    }))
    .sort(compareCandidates);
  const selected = fitCandidatesToBudget(ranked, budget);
  const selectedIds = new Set(selected.map((candidate) => candidate.entity.id));

  return {
    task: request.task,
    budget,
    estimatedTokens: estimatePackTokens(selected),
    entities: selected,
    recommendedReads: collectRecommendedReads(selected),
    externalReferences: collectExternalReferences(selected),
    verification: collectVerification(selected, graph, selectedIds),
    risks: collectRisks(selected),
    notes: [
      'Budget is approximate and uses deterministic character-based estimation.',
      'External resources are listed as references only; content is not copied into the pack.',
    ],
  };
}

export function renderContextPackMarkdown(pack: ContextPack): string {
  const lines = [
    '# Context pack',
    '',
    `Task: ${pack.task}`,
    `Budget: ${pack.budget} tokens`,
    `Estimated: ${pack.estimatedTokens} tokens`,
    '',
    '## Likely relevant entities',
    '',
    ...renderEntityLines(pack.entities),
    '',
    '## Read first',
    '',
    ...renderReadLines(pack.recommendedReads),
    '',
    '## External context',
    '',
    ...renderExternalLines(pack.externalReferences),
    '',
    '## Verification',
    '',
    ...renderVerificationLines(pack.verification),
    '',
    '## Risks',
    '',
    ...renderRiskLines(pack.risks),
    '',
    '## Notes',
    '',
    ...pack.notes.map((note) => `- ${note}`),
  ];

  return `${lines.join('\n')}\n`;
}

function addTextMatches(
  candidateMap: Map<AtlasEntityId, ContextPackEntity>,
  entities: AtlasEntity[],
  terms: string[],
): void {
  if (terms.length === 0) {
    return;
  }

  for (const entity of entities) {
    const searchable = entitySearchText(entity);
    const matchCount = terms.filter((term) => searchable.includes(term)).length;
    if (matchCount === 0) {
      continue;
    }

    const exactIdMatch = terms.some((term) => entity.id.includes(term));
    const score = DIRECT_MATCH_SCORE + matchCount * 8 + (exactIdMatch ? 20 : 0);
    upsertCandidate(candidateMap, entity, score, `text match: ${matchedTerms(terms, searchable)}`, []);
  }
}

function addPathMatches(
  candidateMap: Map<AtlasEntityId, ContextPackEntity>,
  graph: AtlasGraph,
  task: string,
  allowedIds: Set<AtlasEntityId>,
): void {
  for (const pathCandidate of extractPathCandidates(task)) {
    const resolution = resolvePathInGraph(graph, pathCandidate);
    for (const owner of resolution.owners) {
      if (!allowedIds.has(owner.entity.id)) {
        continue;
      }
      upsertCandidate(
        candidateMap,
        owner.entity,
        PATH_OWNER_SCORE + owner.confidence * 20,
        `path owner: ${resolution.normalizedPath} via ${owner.pattern}`,
        [],
      );
    }

    for (const match of [
      ...resolution.workflows,
      ...resolution.domains,
      ...resolution.documents,
      ...resolution.tests,
    ]) {
      if (!allowedIds.has(match.entity.id)) {
        continue;
      }
      upsertCandidate(
        candidateMap,
        match.entity,
        PATH_CONTEXT_SCORE + match.confidence * 15,
        `path context: ${resolution.normalizedPath}`,
        match.via,
      );
    }
  }
}

function addGraphContext(
  candidateMap: Map<AtlasEntityId, ContextPackEntity>,
  graph: AtlasGraph,
  allowedIds: Set<AtlasEntityId>,
): void {
  const seeds = [...candidateMap.values()].sort(compareCandidates).slice(0, 8);

  for (const seed of seeds) {
    const outgoing = graph.index.outgoingById.get(seed.entity.id) ?? [];
    for (const edge of outgoing) {
      if (!allowedIds.has(edge.target)) {
        continue;
      }

      const entity = graph.index.entitiesById.get(edge.target);
      if (!entity) {
        continue;
      }

      const relationScore = relationWeight(edge.type);
      upsertCandidate(
        candidateMap,
        entity,
        NEIGHBOR_BASE_SCORE + relationScore + seed.score * 0.08,
        `neighbor of ${seed.entity.id} via ${edge.type}`,
        [edge],
      );
    }
  }
}

function addTargetedDocsAndTests(
  candidateMap: Map<AtlasEntityId, ContextPackEntity>,
  graph: AtlasGraph,
  allowedIds: Set<AtlasEntityId>,
): void {
  const candidates = [...candidateMap.values()];
  for (const candidate of candidates) {
    for (const edge of graph.index.outgoingById.get(candidate.entity.id) ?? []) {
      if (!allowedIds.has(edge.target)) {
        continue;
      }

      const target = graph.index.entitiesById.get(edge.target);
      if (!target) {
        continue;
      }

      if (edge.type === 'tested-by' || target.kind === 'test-scope') {
        upsertCandidate(
          candidateMap,
          target,
          TEST_SCORE + candidate.score * 0.05,
          `verification for ${candidate.entity.id}`,
          [edge],
        );
      }

      if (edge.type === 'documented-in' || target.kind === 'document') {
        upsertCandidate(
          candidateMap,
          target,
          DOCUMENT_SCORE + candidate.score * 0.05,
          `documentation for ${candidate.entity.id}`,
          [edge],
        );
      }
    }
  }
}

function upsertCandidate(
  candidateMap: Map<AtlasEntityId, ContextPackEntity>,
  entity: AtlasEntity,
  score: number,
  provenance: string,
  via: AtlasGraphEdge[],
): void {
  const estimatedTokens = estimateEntityTokens(entity);
  const existing = candidateMap.get(entity.id);

  if (!existing) {
    candidateMap.set(entity.id, {
      entity,
      score: roundScore(score),
      provenance: [provenance],
      via,
      estimatedTokens,
    });
    return;
  }

  existing.score = roundScore(Math.max(existing.score, score));
  if (!existing.provenance.includes(provenance)) {
    existing.provenance.push(provenance);
    existing.provenance.sort();
  }
  existing.via = mergeEdges(existing.via, via);
}

function fitCandidatesToBudget(
  candidates: ContextPackEntity[],
  budget: number,
): ContextPackEntity[] {
  const limit = Math.max(300, budget - TOKEN_RESERVE);
  const selected: ContextPackEntity[] = [];
  let used = 0;

  for (const candidate of candidates) {
    if (selected.length > 0 && used + candidate.estimatedTokens > limit) {
      continue;
    }
    selected.push(candidate);
    used += candidate.estimatedTokens;
  }

  return selected;
}

function collectRecommendedReads(candidates: ContextPackEntity[]): ContextPackRead[] {
  const reads = new Map<string, ContextPackRead>();

  for (const candidate of candidates) {
    const entity = candidate.entity;
    for (const entrypoint of entity.code?.entrypoints ?? []) {
      reads.set(entrypoint, {
        value: entrypoint,
        sourceEntityId: entity.id,
        reason: `entrypoint for ${entity.id}`,
      });
    }
    for (const codePath of entity.code?.paths ?? []) {
      reads.set(codePath, {
        value: codePath,
        sourceEntityId: entity.id,
        reason: `code path for ${entity.id}`,
      });
    }
    if (entity.uri && isLocalReference(entity.uri)) {
      reads.set(entity.uri, {
        value: entity.uri,
        sourceEntityId: entity.id,
        reason: `document reference for ${entity.id}`,
      });
    }
  }

  return [...reads.values()].sort((left, right) => left.value.localeCompare(right.value));
}

function collectExternalReferences(
  candidates: ContextPackEntity[],
): ContextPackExternalReference[] {
  return candidates
    .filter((candidate) => candidate.entity.uri && !isLocalReference(candidate.entity.uri))
    .map((candidate) => ({
      entity: candidate.entity,
      reference: candidate.entity.uri as string,
      reason: `external reference for ${candidate.entity.id}`,
    }))
    .sort((left, right) => left.entity.id.localeCompare(right.entity.id));
}

function collectVerification(
  candidates: ContextPackEntity[],
  graph: AtlasGraph,
  selectedIds: Set<AtlasEntityId>,
): ContextPackVerification[] {
  const verification = new Map<AtlasEntityId, AtlasEntity>();

  for (const candidate of candidates) {
    if (candidate.entity.kind === 'test-scope') {
      verification.set(candidate.entity.id, candidate.entity);
    }

    for (const edge of graph.index.outgoingById.get(candidate.entity.id) ?? []) {
      if (edge.type !== 'tested-by' && edge.type !== 'verifies') {
        continue;
      }

      const testId = edge.type === 'tested-by' ? edge.target : edge.source;
      if (!selectedIds.has(testId)) {
        continue;
      }

      const entity = graph.index.entitiesById.get(testId);
      if (entity?.kind === 'test-scope') {
        verification.set(entity.id, entity);
      }
    }
  }

  return [...verification.values()]
    .filter((entity) => entity.commands?.length)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((entity) => ({
      entity,
      commands: entity.commands ?? [],
    }));
}

function collectRisks(candidates: ContextPackEntity[]): string[] {
  const risks = new Set<string>();
  for (const candidate of candidates) {
    for (const risk of candidate.entity.agent?.risk_notes ?? []) {
      risks.add(`${candidate.entity.id}: ${risk}`);
    }
  }
  return [...risks].sort();
}

function renderEntityLines(entities: ContextPackEntity[]): string[] {
  if (entities.length === 0) {
    return ['- No relevant entities selected.'];
  }

  return entities.map((candidate) => {
    const provenance = formatProvenanceList(candidate.provenance);
    return `- \`${candidate.entity.id}\` (${candidate.entity.kind}, score ${candidate.score.toFixed(1)}): ${candidate.entity.summary} _${provenance}_`;
  });
}

function renderReadLines(reads: ContextPackRead[]): string[] {
  if (reads.length === 0) {
    return ['- No source reads selected.'];
  }

  return reads.map((read, index) => `${index + 1}. \`${read.value}\` - ${read.reason}`);
}

function renderExternalLines(references: ContextPackExternalReference[]): string[] {
  if (references.length === 0) {
    return ['- No external context selected.'];
  }

  return references.map(
    (reference) =>
      `- \`${reference.entity.id}\`: fetch \`${reference.reference}\` if needed. ${reference.reason}.`,
  );
}

function renderVerificationLines(verification: ContextPackVerification[]): string[] {
  if (verification.length === 0) {
    return ['- No verification commands selected.'];
  }

  return verification.flatMap((item) => [
    `- \`${item.entity.id}\`: ${item.entity.summary}`,
    ...item.commands.map((command) => `  - \`${command.command}\`${command.purpose ? ` - ${command.purpose}` : ''}`),
  ]);
}

function renderRiskLines(risks: string[]): string[] {
  if (risks.length === 0) {
    return ['- No risk notes selected.'];
  }
  return risks.map((risk) => `- ${risk}`);
}

function tokenizeTask(task: string): string[] {
  return [
    ...new Set(
      task
        .toLowerCase()
        .split(/[^a-z0-9:_./-]+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3 && !STOP_WORDS.has(term)),
    ),
  ].sort();
}

function extractPathCandidates(task: string): string[] {
  return [
    ...new Set(
      task
        .split(/\s+/)
        .map((term) => term.replace(/^["'`]+|["'`,.]+$/g, ''))
        .filter((term) => term.includes('/') || term.includes('\\'))
        .filter((term) => /\.[a-z0-9]+$/i.test(term) || term.includes('*')),
    ),
  ].sort();
}

function entitySearchText(entity: AtlasEntity): string {
  return [
    entity.id,
    entity.kind,
    entity.title,
    entity.summary,
    ...(entity.aliases ?? []),
    ...(entity.tags ?? []),
    ...(entity.code?.paths ?? []),
    ...(entity.code?.entrypoints ?? []),
  ]
    .join(' ')
    .toLowerCase();
}

function matchedTerms(terms: string[], searchable: string): string {
  return terms.filter((term) => searchable.includes(term)).join(', ');
}

function relationWeight(type: AtlasGraphEdge['type']): number {
  switch (type) {
    case 'tested-by':
    case 'verifies':
      return 20;
    case 'documented-in':
    case 'documents':
      return 18;
    case 'implements':
    case 'implemented-by':
    case 'part-of':
    case 'contains':
      return 14;
    case 'uses':
    case 'used-by':
    case 'depends-on':
    case 'dependency-of':
      return 10;
    default:
      return 4;
  }
}

function filterEntitiesByProfile(
  entities: AtlasEntity[],
  profile: ContextPackRequest['profile'],
): AtlasEntity[] {
  if (profile === 'private' || profile === 'company') {
    return [...entities].sort(compareEntities);
  }

  return entities
    .filter((entity) => entity.visibility === undefined || entity.visibility === 'public')
    .sort(compareEntities);
}

function estimateEntityTokens(entity: AtlasEntity): number {
  return estimateTokens(`${entity.id} ${entity.kind} ${entity.title} ${entity.summary}`) + 18;
}

function estimateCandidateTokens(candidate: ContextPackEntity): number {
  return (
    estimateEntityTokens(candidate.entity) +
    estimateTokens(formatProvenanceList(candidate.provenance)) +
    8
  );
}

function estimatePackTokens(entities: ContextPackEntity[]): number {
  return entities.reduce((total, candidate) => total + estimateCandidateTokens(candidate), 180);
}

function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

function isLocalReference(uri: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(uri);
}

function mergeEdges(left: AtlasGraphEdge[], right: AtlasGraphEdge[]): AtlasGraphEdge[] {
  const edges = new Map<string, AtlasGraphEdge>();
  for (const edge of [...left, ...right]) {
    edges.set(`${edge.source}|${edge.type}|${edge.target}`, edge);
  }
  return [...edges.values()].sort((a, b) => {
    const sourceCompare = a.source.localeCompare(b.source);
    if (sourceCompare !== 0) return sourceCompare;
    const typeCompare = a.type.localeCompare(b.type);
    if (typeCompare !== 0) return typeCompare;
    return a.target.localeCompare(b.target);
  });
}

function compareCandidates(left: ContextPackEntity, right: ContextPackEntity): number {
  const scoreCompare = right.score - left.score;
  if (scoreCompare !== 0) return scoreCompare;
  return left.entity.id.localeCompare(right.entity.id);
}

function compareEntities(left: AtlasEntity, right: AtlasEntity): number {
  return left.id.localeCompare(right.id);
}

function roundScore(score: number): number {
  return Math.round(score * 10) / 10;
}

function formatProvenanceList(provenance: string[]): string {
  const shown = provenance.slice(0, 3);
  const remaining = provenance.length - shown.length;
  return remaining > 0 ? `${shown.join('; ')}; +${remaining} more` : shown.join('; ');
}
