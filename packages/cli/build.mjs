import { rm } from 'node:fs/promises';
import { build } from 'esbuild';

await rm('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  external: [
    '@modelcontextprotocol/sdk',
    '@modelcontextprotocol/sdk/*',
    'yaml',
    'zod',
    'zod/*',
  ],
});
