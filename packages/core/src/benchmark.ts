import { performance } from 'node:perf_hooks';

import type { AtlasGraph } from './graph.js';
import { loadAtlasGraph } from './graph.js';
import type { AtlasProfile } from './profile.js';

export interface AtlasBenchmarkOptions {
  profile?: AtlasProfile;
  iterations?: number;
}

export interface AtlasBenchmarkResult {
  rootPath: string;
  profile: AtlasProfile;
  iterations: number;
  entityCount: number;
  relationCount: number;
  diagnosticsCount: number;
  loadMs: BenchmarkTiming;
  normalizeMs: BenchmarkTiming;
}

export interface BenchmarkTiming {
  min: number;
  max: number;
  avg: number;
}

export async function benchmarkAtlas(
  rootPath: string,
  options: AtlasBenchmarkOptions = {},
): Promise<AtlasBenchmarkResult> {
  const iterations = Math.max(1, options.iterations ?? 3);
  const profile = options.profile ?? 'public';
  const loadTimings: number[] = [];
  const normalizeTimings: number[] = [];
  let lastGraph: AtlasGraph | undefined;

  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    const graph = await loadAtlasGraph(rootPath, { profile });
    const loaded = performance.now();
    graph.index.entitiesById.size;
    const normalized = performance.now();

    loadTimings.push(loaded - start);
    normalizeTimings.push(normalized - loaded);
    lastGraph = graph;
  }

  if (!lastGraph) {
    throw new Error('Benchmark did not run.');
  }

  return {
    rootPath: lastGraph.rootPath,
    profile,
    iterations,
    entityCount: lastGraph.entities.length,
    relationCount: lastGraph.edges.filter(
      (edge) => edge.provenance === 'explicit',
    ).length,
    diagnosticsCount: lastGraph.diagnostics.length,
    loadMs: summarizeTimings(loadTimings),
    normalizeMs: summarizeTimings(normalizeTimings),
  };
}

function summarizeTimings(values: number[]): BenchmarkTiming {
  return {
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
    avg: round(
      values.reduce((total, value) => total + value, 0) / values.length,
    ),
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
