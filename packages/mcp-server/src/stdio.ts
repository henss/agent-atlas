#!/usr/bin/env node

import path from 'node:path';
import { parseMcpProfile, startAtlasMcpStdioServer } from './index.js';
import type { AtlasProfile } from '@agent-atlas/core';

const args = process.argv.slice(2);
let atlasRoot = process.cwd();
let profile: AtlasProfile = 'public';
let atlasRootWasSet = false;

function readOptionValue(index: number, optionName: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${optionName}.`);
  }
  return value;
}

function setAtlasRoot(nextRoot: string): void {
  if (atlasRootWasSet) {
    throw new Error('Use either one positional path or --path <root>, not both.');
  }
  atlasRoot = path.resolve(nextRoot);
  atlasRootWasSet = true;
}

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--path') {
    setAtlasRoot(readOptionValue(index, '--path'));
    index += 1;
    continue;
  }

  if (arg === '--profile') {
    profile = parseMcpProfile(readOptionValue(index, '--profile'), profile);
    index += 1;
    continue;
  }

  if (arg.startsWith('-')) {
    throw new Error(`Unknown option: ${arg}`);
  }

  setAtlasRoot(arg);
}

await startAtlasMcpStdioServer({ atlasRoot, profile });
