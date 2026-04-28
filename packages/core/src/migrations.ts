import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadAtlasDocuments } from './loader.js';

export interface AtlasMigrationOptions {
  toVersion?: number;
  write?: boolean;
  includeYamlRoot?: boolean;
}

export interface AtlasMigrationChange {
  path: string;
  action: 'add-schema-version' | 'update-schema-version' | 'skip';
  fromVersion?: number | string;
  toVersion: number;
  written: boolean;
}

export interface AtlasMigrationResult {
  rootPath: string;
  toVersion: number;
  write: boolean;
  scanned: number;
  changed: number;
  changes: AtlasMigrationChange[];
}

export async function migrateAtlas(
  rootPath: string,
  options: AtlasMigrationOptions = {},
): Promise<AtlasMigrationResult> {
  const absoluteRoot = path.resolve(rootPath);
  const toVersion = options.toVersion ?? 1;
  if (toVersion !== 1) {
    throw new Error(`Unsupported atlas schema migration target: ${toVersion}.`);
  }

  const documents = await loadAtlasDocuments(absoluteRoot, {
    includeYamlRoot: options.includeYamlRoot,
  });
  const changes: AtlasMigrationChange[] = [];

  for (const document of documents) {
    if (document.parseError || !isRecord(document.data)) {
      continue;
    }

    const currentVersion = document.data.schema_version;
    if (currentVersion === toVersion) {
      continue;
    }

    const text = await readFile(document.path, 'utf8');
    const action =
      currentVersion === undefined
        ? 'add-schema-version'
        : 'update-schema-version';
    const change: AtlasMigrationChange = {
      path: document.path,
      action,
      fromVersion:
        currentVersion === undefined || typeof currentVersion === 'number'
          ? currentVersion
          : String(currentVersion),
      toVersion,
      written: false,
    };

    if (options.write) {
      await writeFile(
        document.path,
        updateSchemaVersion(text, toVersion),
        'utf8',
      );
      change.written = true;
    }

    changes.push(change);
  }

  return {
    rootPath: absoluteRoot,
    toVersion,
    write: options.write ?? false,
    scanned: documents.length,
    changed: changes.length,
    changes,
  };
}

function updateSchemaVersion(text: string, toVersion: number): string {
  if (/^schema_version:\s*.+$/m.test(text)) {
    return text.replace(
      /^schema_version:\s*.+$/m,
      `schema_version: ${toVersion}`,
    );
  }

  return `schema_version: ${toVersion}\n${text}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
