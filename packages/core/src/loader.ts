import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

export interface LoadedAtlasDocument {
  path: string;
  data?: unknown;
  parseError?: string;
}

export interface LoadAtlasDocumentsOptions {
  includeYamlRoot?: boolean;
}

export async function loadAtlasDocuments(
  rootPath: string,
  options: LoadAtlasDocumentsOptions = {},
): Promise<LoadedAtlasDocument[]> {
  const absoluteRoot = path.resolve(rootPath);
  const documents: LoadedAtlasDocument[] = [];
  const atlasRoots = await findAtlasRoots(absoluteRoot);

  for (const atlasRoot of atlasRoots) {
    await collectYamlDocuments(atlasRoot, documents, {
      skipUsageReceipts: true,
    });
  }

  if (documents.length === 0 && options.includeYamlRoot) {
    await collectYamlDocuments(absoluteRoot, documents, {
      skipUsageReceipts: false,
    });
  }

  documents.sort((left, right) => left.path.localeCompare(right.path));
  return documents;
}

async function findAtlasRoots(rootPath: string): Promise<string[]> {
  const directAtlasRoot = path.join(rootPath, '.agent-atlas');
  if (await directoryExists(directAtlasRoot)) {
    return [directAtlasRoot];
  }

  const atlasRoots: string[] = [];

  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const entryPath = path.join(directory, entry.name);
      if (entry.name === '.agent-atlas') {
        atlasRoots.push(entryPath);
        continue;
      }

      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === 'dist'
      ) {
        continue;
      }

      await walk(entryPath);
    }
  }

  await walk(rootPath);
  return atlasRoots;
}

async function directoryExists(directory: string): Promise<boolean> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.length >= 0;
  } catch {
    return false;
  }
}

async function collectYamlDocuments(
  directory: string,
  documents: LoadedAtlasDocument[],
  options: { skipUsageReceipts: boolean },
): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (options.skipUsageReceipts && entry.name === 'usage') {
        continue;
      }
      await collectYamlDocuments(entryPath, documents, options);
      continue;
    }

    if (!entry.isFile() || !isYamlFile(entry.name)) {
      continue;
    }

    const content = await readFile(entryPath, 'utf8');
    try {
      documents.push({
        path: entryPath,
        data: parse(content),
      });
    } catch (error) {
      documents.push({
        path: entryPath,
        parseError: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function isYamlFile(fileName: string): boolean {
  return fileName.endsWith('.yaml') || fileName.endsWith('.yml');
}
