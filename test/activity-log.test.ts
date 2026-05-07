import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  buildActivityReport,
  renderActivityMarkdown,
  writeActivityReport
} from '../src/tagger/activity-log.js';
import type { MergedEntryInfo } from '../src/registry/merge.js';

function info(
  id: string,
  disposition: 'new' | 'regenerated' | 'carried-over',
  source: 'generated' | 'manual',
  extras: Partial<MergedEntryInfo['entry']> = {}
): [string, MergedEntryInfo] {
  return [
    id,
    {
      disposition,
      entry: {
        component: 'x.html',
        tag: 'input',
        element_type: 'native_input',
        fingerprint: 'f',
        semantic: {
          formcontrolname: null,
          aria_label: null,
          placeholder: null,
          text_content: null,
          type: null
        },
        first_seen_version: 1,
        last_seen_version: 1,
        source,
        ...extras
      },
      ...(disposition === 'regenerated' ? { previousVersion: 2 } : {})
    }
  ];
}

describe('buildActivityReport', () => {
  it('maps manual-override ids to the manual-override kind even when disposition is new', () => {
    const dispositions = new Map([info('x', 'new', 'manual')]);
    const report = buildActivityReport({
      version: 3,
      generatedAt: '2026-04-17T10:00:00Z',
      dispositions,
      manualOverrideIds: new Set(['x'])
    });
    expect(report.records[0]?.kind).toBe('manual-override');
  });

  it('emits a record for each disposition kind', () => {
    const dispositions = new Map([
      info('a', 'new', 'generated'),
      info('b', 'regenerated', 'generated'),
      info('c', 'carried-over', 'generated')
    ]);
    const report = buildActivityReport({
      version: 3,
      generatedAt: '2026-04-17T10:00:00Z',
      dispositions,
      manualOverrideIds: new Set()
    });
    const kinds = report.records.map((r) => r.kind).sort();
    expect(kinds).toEqual(['carried-over', 'new', 'regenerated']);
  });
});

describe('renderActivityMarkdown', () => {
  it('includes sections for kinds that have entries', () => {
    const report = buildActivityReport({
      version: 3,
      generatedAt: '2026-04-17T10:00:00Z',
      dispositions: new Map([info('new-one', 'new', 'generated')]),
      manualOverrideIds: new Set()
    });
    const md = renderActivityMarkdown(report);
    expect(md).toContain('# Tagger Activity - v3');
    expect(md).toContain('## New');
    expect(md).toContain('`new-one`');
    expect(md).not.toContain('## Regenerated');
  });
});

describe('writeActivityReport', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-activity-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes activity.v{N}.md + activity.v{N}.json side by side', async () => {
    const report = buildActivityReport({
      version: 5,
      generatedAt: '2026-04-17T10:00:00Z',
      dispositions: new Map([info('foo', 'new', 'generated')]),
      manualOverrideIds: new Set()
    });
    const { markdownPath, jsonPath } = await writeActivityReport({ dir, report });
    expect(markdownPath).not.toBeNull();
    expect(jsonPath).not.toBeNull();
    expect(path.basename(markdownPath!)).toBe('activity.v5.md');
    expect(path.basename(jsonPath!)).toBe('activity.v5.json');
    const json = JSON.parse(await fs.readFile(jsonPath!, 'utf8'));
    expect(json.version).toBe(5);
    expect(json.records[0].id).toBe('foo');
  });

  it('writes activity.latest.{md,json} pointers by default', async () => {
    const report = buildActivityReport({
      version: 7,
      generatedAt: '2026-04-17T10:00:00Z',
      dispositions: new Map([info('bar', 'new', 'generated')]),
      manualOverrideIds: new Set()
    });
    const result = await writeActivityReport({ dir, report });
    expect(path.basename(result.latestMarkdownPath!)).toBe('activity.latest.md');
    expect(path.basename(result.latestJsonPath!)).toBe('activity.latest.json');
    const latestJson = JSON.parse(await fs.readFile(result.latestJsonPath!, 'utf8'));
    expect(latestJson.version).toBe(7);
  });

  it('skips latest pointers when writeLatest=false', async () => {
    const report = buildActivityReport({
      version: 1,
      generatedAt: '2026-04-17T10:00:00Z',
      dispositions: new Map([info('a', 'new', 'generated')]),
      manualOverrideIds: new Set()
    });
    const result = await writeActivityReport({ dir, report, writeLatest: false });
    expect(result.latestMarkdownPath).toBeNull();
    expect(result.latestJsonPath).toBeNull();
    const entries = await fs.readdir(dir);
    expect(entries.some((n) => n.startsWith('activity.latest'))).toBe(false);
  });

  it('writes only markdown when json=false', async () => {
    const report = buildActivityReport({
      version: 2,
      generatedAt: '2026-04-17T10:00:00Z',
      dispositions: new Map([info('a', 'new', 'generated')]),
      manualOverrideIds: new Set()
    });
    const result = await writeActivityReport({ dir, report, json: false });
    expect(result.markdownPath).not.toBeNull();
    expect(result.latestMarkdownPath).not.toBeNull();
    expect(result.jsonPath).toBeNull();
    expect(result.latestJsonPath).toBeNull();
    const entries = await fs.readdir(dir);
    expect(entries.some((n) => n.endsWith('.json'))).toBe(false);
  });

  it('writes only json when markdown=false', async () => {
    const report = buildActivityReport({
      version: 3,
      generatedAt: '2026-04-17T10:00:00Z',
      dispositions: new Map([info('a', 'new', 'generated')]),
      manualOverrideIds: new Set()
    });
    const result = await writeActivityReport({ dir, report, markdown: false });
    expect(result.jsonPath).not.toBeNull();
    expect(result.latestJsonPath).not.toBeNull();
    expect(result.markdownPath).toBeNull();
    expect(result.latestMarkdownPath).toBeNull();
    const entries = await fs.readdir(dir);
    expect(entries.some((n) => n.endsWith('.md'))).toBe(false);
  });

  it('prunes old versioned activity files when retention is set', async () => {
    for (let v = 1; v <= 5; v++) {
      const report = buildActivityReport({
        version: v,
        generatedAt: '2026-04-17T10:00:00Z',
        dispositions: new Map([info(`x-${v}`, 'new', 'generated')]),
        manualOverrideIds: new Set()
      });
      await writeActivityReport({ dir, report, retention: 2 });
    }
    const entries = await fs.readdir(dir);
    const versionedMd = entries.filter((n) => /^activity\.v\d+\.md$/.test(n)).sort();
    const versionedJson = entries.filter((n) => /^activity\.v\d+\.json$/.test(n)).sort();
    expect(versionedMd).toEqual(['activity.v4.md', 'activity.v5.md']);
    expect(versionedJson).toEqual(['activity.v4.json', 'activity.v5.json']);
    // Latest pointers must survive the prune.
    expect(entries).toContain('activity.latest.md');
    expect(entries).toContain('activity.latest.json');
  });
});
