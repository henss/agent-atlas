import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { benchmarkAtlas } from './benchmark.js';

describe('benchmarkAtlas', () => {
  it('measures atlas load performance', async () => {
    const result = await benchmarkAtlas(path.resolve('../..'), {
      iterations: 1,
    });

    expect(result.entityCount).toBeGreaterThan(0);
    expect(result.relationCount).toBeGreaterThan(0);
    expect(result.loadMs.avg).toBeGreaterThanOrEqual(0);
  });
});
