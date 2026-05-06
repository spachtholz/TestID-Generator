// Registry loader + AJV validator.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { Registry } from './schema.js';
import { registryJsonSchema } from './json-schema.js';

let cachedValidator: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
  if (cachedValidator) {
    return cachedValidator;
  }
  const ajv = new Ajv({ allErrors: true, strict: false });
  try {
    // ajv-formats is optional at runtime; if it's not installed we still
    // validate structurally (date-time format is then treated as a pass).
    addFormats(ajv);
  } catch {
    /* ignore - ajv-formats optional */
  }
  cachedValidator = ajv.compile(registryJsonSchema);
  return cachedValidator;
}

export class RegistryValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: ErrorObject[]
  ) {
    super(message);
    this.name = 'RegistryValidationError';
  }
}

/** Parse + validate a registry from a JSON string. */
export function parseRegistry(raw: string): Registry {
  const data = JSON.parse(raw) as unknown;
  const validate = getValidator();
  if (!validate(data)) {
    const errors = validate.errors ?? [];
    throw new RegistryValidationError(
      `Invalid registry: ${errors.map((e) => `${e.instancePath} ${e.message}`).join('; ')}`,
      errors
    );
  }
  const registry = data as Registry;
  // Pre-v0.1.2 registries are missing `source`, `last_generated_at` and
  // `generation_history`. Backfill each with a sensible default so downstream
  // consumers can rely on the fields always being present.
  for (const entry of Object.values(registry.entries)) {
    if (entry.source === undefined) entry.source = 'generated';
    if (entry.generation_history === undefined) {
      entry.generation_history = [entry.first_seen_version];
    }
    // `last_generated_at` stays undefined for legacy entries - we cannot
    // invent a timestamp we didn't capture. New runs will set it next time
    // the entry is (re-)established.
  }
  return registry;
}

/** Load + validate a registry from a file path. */
export async function loadRegistry(filePath: string): Promise<Registry> {
  const raw = await fs.readFile(filePath, 'utf8');
  return parseRegistry(raw);
}

/** Attempt to load `testids.latest.json` from a directory, or null if absent. */
export async function loadLatestRegistry(dir: string): Promise<Registry | null> {
  const latestPath = path.join(dir, 'testids.latest.json');
  try {
    return await loadRegistry(latestPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}
