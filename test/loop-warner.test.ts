import { describe, it, expect } from 'vitest';
import { tagTemplateSource } from '../src/tagger/tagger.js';
import { DEFAULT_CONFIG } from '../src/tagger/config-loader.js';
import { formatLoopWarnings } from '../src/tagger/loop-warner.js';

function tag(source: string) {
  return tagTemplateSource(source, {
    componentName: 'list',
    componentPath: 'list.component.html',
    hashLength: 6,
    config: DEFAULT_CONFIG
  });
}

describe('loop warnings', () => {
  it('warns for a <tr> inside *ngFor without [attr.data-testid]', () => {
    const source = `
      <table>
        <tr *ngFor="let row of rows">
          <td>{{ row.id }}</td>
        </tr>
      </table>
    `;
    const out = tag(source);
    expect(out.loopWarnings.length).toBeGreaterThan(0);
    const kinds = out.loopWarnings.map((w) => w.loop.kind);
    expect(kinds).toContain('ngFor');
  });

  it('warns for an element inside @for', () => {
    const source = `
      <ul>
        @for (item of items; track item.id) {
          <li>{{ item.name }}</li>
        }
      </ul>
    `;
    const out = tag(source);
    expect(out.loopWarnings.some((w) => w.loop.kind === 'forBlock')).toBe(true);
    expect(out.loopWarnings.some((w) => w.tag === 'li')).toBe(true);
  });

  it('warns for elements inside pTemplate="body"', () => {
    const source = `
      <p-table [value]="orders">
        <ng-template pTemplate="body" let-order>
          <tr>
            <td>{{ order.id }}</td>
          </tr>
        </ng-template>
      </p-table>
    `;
    const out = tag(source);
    expect(out.loopWarnings.some((w) => w.loop.kind === 'primeng-template')).toBe(true);
    expect(out.loopWarnings.some((w) => w.tag === 'tr')).toBe(true);
  });

  it('does not warn when [attr.data-testid] is present', () => {
    const source = `
      <table>
        <tr *ngFor="let row of rows" [attr.data-testid]="'row-' + row.id">
          <td [attr.data-testid]="'cell-' + row.id">{{ row.id }}</td>
        </tr>
      </table>
    `;
    const out = tag(source);
    expect(out.loopWarnings).toHaveLength(0);
  });

  it('does not warn for elements outside any loop', () => {
    const source = `<section><h1>Title</h1><button>Go</button></section>`;
    const out = tag(source);
    expect(out.loopWarnings).toHaveLength(0);
  });

  it('does not warn for pTemplate slots that render once (header/footer)', () => {
    const source = `
      <p-table [value]="orders">
        <ng-template pTemplate="header">
          <tr><th>ID</th></tr>
        </ng-template>
      </p-table>
    `;
    const out = tag(source);
    // header is rendered once, so the <tr> inside should not be flagged
    expect(out.loopWarnings.every((w) => w.loop.kind !== 'primeng-template')).toBe(true);
  });

  it('reports line and column from the source span', () => {
    const source = `<div>\n  <ul>\n    <li *ngFor="let x of xs">{{ x }}</li>\n  </ul>\n</div>`;
    const out = tag(source);
    const liWarn = out.loopWarnings.find((w) => w.tag === 'li');
    expect(liWarn).toBeDefined();
    expect(liWarn?.line).toBe(3);
    expect(liWarn?.column).toBeGreaterThan(0);
  });

  it('does not warn for a manually set (source=manual) testid', () => {
    const source = `
      <table>
        <tr *ngFor="let row of rows" data-testid="fixed-id">
          <td>x</td>
        </tr>
      </table>
    `;
    const out = tag(source);
    // the <tr> carries a manually set id, should not trigger a loop warning
    expect(out.loopWarnings.every((w) => w.tag !== 'tr')).toBe(true);
  });
});

describe('formatLoopWarnings', () => {
  it('returns empty string when there are no warnings', () => {
    expect(formatLoopWarnings([])).toBe('');
  });

  it('includes file, line, column, tag and id', () => {
    const out = formatLoopWarnings([
      {
        componentPath: 'x/y.component.html',
        line: 12,
        column: 3,
        id: 'list__li--item',
        tag: 'li',
        loop: { kind: 'ngFor', label: '*ngFor' }
      }
    ]);
    expect(out).toContain('x/y.component.html:12:3');
    expect(out).toContain('<li>');
    expect(out).toContain('*ngFor');
    expect(out).toContain('list__li--item');
  });

  it('truncates when above the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      componentPath: 'f.html',
      line: i + 1,
      column: 1,
      id: `id-${i}`,
      tag: 'div',
      loop: { kind: 'ngFor' as const, label: '*ngFor' }
    }));
    const out = formatLoopWarnings(many, { limit: 5 });
    expect(out).toContain('and 25 more');
  });
});
