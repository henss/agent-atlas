#!/usr/bin/env node

import path from 'node:path';
import { startAtlasMcpStdioServer } from './index.js';
import { parseAtlasProfile } from '@agent-atlas/core';

const args = process.argv.slice(2);
let atlasRoot = process.cwd();
let profile = parseAtlasProfile(undefined);

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--path') {
    atlasRoot = path.resolve(args[index + 1] ?? atlasRoot);
    index += 1;
    continue;
  }

  if (arg === '--profile') {
    profile = parseAtlasProfile(args[index + 1]);
    index += 1;
    continue;
  }

  atlasRoot = path.resolve(arg);
}

await startAtlasMcpStdioServer({ atlasRoot, profile });
