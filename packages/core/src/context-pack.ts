import type { AtlasEntity } from '@agent-atlas/schema';

export interface ContextPackRequest {
  task: string;
  budget?: number;
  profile?: string;
}

export interface ContextPack {
  task: string;
  budget: number;
  entities: AtlasEntity[];
  recommendedReads: string[];
  verificationCommands: string[];
  notes: string[];
}

export function createEmptyContextPack(request: ContextPackRequest): ContextPack {
  return {
    task: request.task,
    budget: request.budget ?? 4000,
    entities: [],
    recommendedReads: [],
    verificationCommands: [],
    notes: [
      'Context pack generation is not implemented yet. Use this type as the contract for M5.',
    ],
  };
}
