// Loads `testid.config.*`, falls back to legacy `testid-tagger.config.*`.

import { pathToFileURL } from 'node:url';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { TestidConfigSchema, type TestidConfig } from './schema.js';

export const TESTID_CONFIG_FILENAMES: readonly string[] = [
  'testid.config.json',
  'testid.config.mjs',
  'testid.config.js',
  'testid.config.ts'
];

export const LEGACY_TAGGER_CONFIG_FILENAMES: readonly string[] = [
  'testid-tagger.config.json',
  'testid-tagger.config.mjs',
  'testid-tagger.config.js',
  'testid-tagger.config.ts'
];

export interface LoadTestidConfigResult {
  config: TestidConfig;
  configPath: string | null;
  sourceDir: string;
  isLegacy: boolean;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function findFirst(
  searchDir: string,
  candidates: readonly string[]
): Promise<string | null> {
  for (const name of candidates) {
    const candidate = path.resolve(searchDir, name);
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

async function findUnifiedConfig(searchDir: string): Promise<string | null> {
  return findFirst(searchDir, TESTID_CONFIG_FILENAMES);
}

async function findLegacyTaggerConfig(searchDir: string): Promise<string | null> {
  return findFirst(searchDir, LEGACY_TAGGER_CONFIG_FILENAMES);
}

async function readRaw(absPath: string): Promise<unknown> {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.json') {
    const str = await fs.readFile(absPath, 'utf8');
    return JSON.parse(str);
  }
  const url = pathToFileURL(absPath).href;
  const mod = (await import(url)) as Record<string, unknown>;
  return mod.default ?? mod.config ?? mod;
}

function looksUnified(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const keys = Object.keys(raw as Record<string, unknown>);
  return keys.some((k) => k === 'tagger' || k === 'differ' || k === 'locators');
}

/** Search order: explicit path > testid.config.* > testid-tagger.config.* > defaults. */
export async function loadTestidConfig(
  configPath?: string,
  cwd: string = process.cwd()
): Promise<LoadTestidConfigResult> {
  let absPath: string | null = null;
  let isLegacy = false;

  if (configPath) {
    absPath = path.resolve(cwd, configPath);
    const base = path.basename(absPath);
    if (LEGACY_TAGGER_CONFIG_FILENAMES.some((n) => n === base)) {
      isLegacy = true;
    }
  } else {
    absPath = await findUnifiedConfig(cwd);
    if (!absPath) {
      absPath = await findLegacyTaggerConfig(cwd);
      if (absPath) isLegacy = true;
    }
  }

  if (!absPath) {
    return {
      config: TestidConfigSchema.parse({}),
      configPath: null,
      sourceDir: cwd,
      isLegacy: false
    };
  }

  const raw = await readRaw(absPath);
  const wrapped = isLegacy || !looksUnified(raw) ? { tagger: raw } : raw;

  const parsed = TestidConfigSchema.parse(wrapped);
  return {
    config: parsed,
    configPath: absPath,
    sourceDir: path.dirname(absPath),
    isLegacy: isLegacy || !looksUnified(raw)
  };
}
