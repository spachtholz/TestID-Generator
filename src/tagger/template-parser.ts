// Thin wrapper around @angular/compiler's template parser (FR-1.5).
// Uses the Angular parser so @if/@for/@switch work on v18+.

import {
  parseTemplate,
  type TmplAstNode,
  type TmplAstElement,
  type TmplAstTemplate,
  type TmplAstTextAttribute,
  type TmplAstBoundAttribute,
  type TmplAstBoundEvent,
  type TmplAstBoundText,
  type TmplAstText,
  type TmplAstIfBlock,
  type TmplAstForLoopBlock,
  type TmplAstSwitchBlock,
  type TmplAstDeferredBlock,
  type ParseError
} from '@angular/compiler';

export interface ParsedTemplate {
  ast: TmplAstNode[];
  errors: ParseError[];
  source: string;
}

export interface ParseOptions {
  /** Identifier used in Angular parse error messages. */
  url?: string;
}

/**
 * Parse an Angular template source string into an AST.
 *
 * Throws only on catastrophic failures; recoverable errors are returned in
 * `result.errors` so the caller can decide whether to continue.
 */
export function parseAngularTemplate(source: string, options: ParseOptions = {}): ParsedTemplate {
  const url = options.url ?? 'inline-template.html';
  const result = parseTemplate(source, url, {
    preserveWhitespaces: true,
    preserveLineEndings: true,
    preserveSignificantWhitespace: true,
    // ensure @if / @for / @switch are recognised (Angular 17+ default, but
    // we set it explicitly for future-compat).
    enableBlockSyntax: true,
    enableLetSyntax: true
  });
  return {
    ast: result.nodes,
    errors: result.errors ?? [],
    source
  };
}

/* ---------------------------------------------------------------------- *
 * AST traversal helpers
 * ---------------------------------------------------------------------- */

export type VisitedElement = TmplAstElement | TmplAstTemplate;

export interface LoopContext {
  /** Where the loop comes from. Used in warning messages. */
  readonly kind: 'ngFor' | 'forBlock' | 'primeng-template';
  /** label, e.g. "*ngFor", "@for", "pTemplate=\"body\"". */
  readonly label: string;
}

/**
 * Visitor receives the visited element, the active loop context (if any),
 * and the chain of element parents from the document root down to the
 * direct parent. The chain is empty for top-level elements.
 *
 * `parents` is provided as a fresh array per call; callers may keep a
 * reference but should treat it as immutable.
 */
export type VisitFn = (
  node: VisitedElement,
  loop: LoopContext | null,
  parents: readonly VisitedElement[]
) => void;

/**
 * Walk the AST, invoking `visit` for every element-like node.
 *
 * Handles control-flow blocks (`@if`/`@for`/`@switch`/`@defer`) and the
 * `<ng-template>` template node. Tracks whether the current subtree is
 * rendered inside a loop (`*ngFor`, `@for`, PrimeNG body/item templates) and
 * passes that info to the visitor along with the parent chain.
 */
export function walkElements(
  nodes: readonly TmplAstNode[] | undefined,
  visit: VisitFn,
  loop: LoopContext | null = null,
  parents: readonly VisitedElement[] = []
): void {
  if (!nodes) return;
  for (const node of nodes) {
    walkNode(node, visit, loop, parents);
  }
}

function walkNode(
  node: TmplAstNode,
  visit: VisitFn,
  loop: LoopContext | null,
  parents: readonly VisitedElement[]
): void {
  if (isElementLike(node)) {
    // ng-template wrappers may themselves introduce a loop for their children.
    const childLoop = isTemplateNode(node) ? detectTemplateLoop(node) ?? loop : loop;
    visit(node, loop, parents);
    walkElements(node.children, visit, childLoop, [...parents, node]);
    return;
  }

  if (isIfBlock(node)) {
    for (const branch of node.branches) {
      walkElements(branch.children, visit, loop, parents);
    }
    return;
  }

  if (isForLoop(node)) {
    const forLoop: LoopContext = { kind: 'forBlock', label: '@for' };
    walkElements(node.children, visit, forLoop, parents);
    // the @empty block only renders once, so it's not a loop context
    if (node.empty) {
      walkElements(node.empty.children, visit, loop, parents);
    }
    return;
  }

  if (isSwitchBlock(node)) {
    for (const c of node.cases) {
      walkElements(c.children, visit, loop, parents);
    }
    return;
  }

  if (isDeferredBlock(node)) {
    walkElements(node.children, visit, loop, parents);
    if (node.placeholder) walkElements(node.placeholder.children, visit, loop, parents);
    if (node.loading) walkElements(node.loading.children, visit, loop, parents);
    if (node.error) walkElements(node.error.children, visit, loop, parents);
    return;
  }

  // Other nodes (Text, BoundText, Comment, Icu, LetDeclaration, ...) have no children.
}

// PrimeNG pTemplate values that render their body once per item in a collection.
// Values like "header", "footer", "caption", "summary" render once and are not
// flagged.
const PRIMENG_LOOP_PTEMPLATES: ReadonlySet<string> = new Set([
  'body',
  'item',
  'rowexpansion',
  'groupheader',
  'groupfooter',
  'loadingbody'
]);

/**
 * Inspect an <ng-template> node and return a LoopContext if it represents a
 * per-item render (structural *ngFor or a known PrimeNG loop slot).
 */
function detectTemplateLoop(node: TmplAstTemplate): LoopContext | null {
  // *ngFor compiles to an ng-template whose templateAttrs contain "ngFor".
  for (const attr of node.templateAttrs ?? []) {
    const name = attr.name?.toLowerCase?.();
    if (name === 'ngfor' || name === 'ngforof') {
      return { kind: 'ngFor', label: '*ngFor' };
    }
  }
  // PrimeNG: <ng-template pTemplate="body" let-row>
  for (const attr of node.attributes ?? []) {
    if (attr.name?.toLowerCase() !== 'ptemplate') continue;
    const value = (attr.value ?? '').toLowerCase();
    if (PRIMENG_LOOP_PTEMPLATES.has(value)) {
      return { kind: 'primeng-template', label: `pTemplate="${value}"` };
    }
  }
  return null;
}

/* ---------------------------------------------------------------------- *
 * Narrow type guards - we treat these purely by their constructor name so
 * a slight Angular minor-version difference doesn't break us.
 * ---------------------------------------------------------------------- */

/**
 * Constructor names may come through as `Element`, `Element$1`, `Element_1`
 * etc. depending on Angular's internal bundling. We match the semantic name
 * with an optional `$N` / `_N` suffix so a minor-version bundler change
 * doesn't silently break detection.
 */
function ctorName(node: unknown): string {
  return (node as { constructor?: { name?: string } })?.constructor?.name ?? '';
}

function isCtor(node: unknown, ...bases: string[]): boolean {
  const name = ctorName(node);
  return bases.some((b) => name === b || name.startsWith(`${b}$`) || name.startsWith(`${b}_`));
}

export function isElementLike(node: TmplAstNode): node is VisitedElement {
  return isCtor(node, 'Element', 'Template');
}

export function isElement(node: TmplAstNode): node is TmplAstElement {
  return isCtor(node, 'Element');
}

export function isTemplateNode(node: TmplAstNode): node is TmplAstTemplate {
  return isCtor(node, 'Template');
}

function isIfBlock(node: TmplAstNode): node is TmplAstIfBlock {
  return isCtor(node, 'IfBlock');
}

function isForLoop(node: TmplAstNode): node is TmplAstForLoopBlock {
  return isCtor(node, 'ForLoopBlock');
}

function isSwitchBlock(node: TmplAstNode): node is TmplAstSwitchBlock {
  return isCtor(node, 'SwitchBlock');
}

function isDeferredBlock(node: TmplAstNode): node is TmplAstDeferredBlock {
  return isCtor(node, 'DeferredBlock');
}

export function isTextAttribute(x: unknown): x is TmplAstTextAttribute {
  return isCtor(x, 'TextAttribute');
}

export function isBoundAttribute(x: unknown): x is TmplAstBoundAttribute {
  return isCtor(x, 'BoundAttribute');
}

export function isBoundEvent(x: unknown): x is TmplAstBoundEvent {
  return isCtor(x, 'BoundEvent');
}

export function isText(x: unknown): x is TmplAstText {
  return isCtor(x, 'Text');
}

export function isBoundText(x: unknown): x is TmplAstBoundText {
  return isCtor(x, 'BoundText');
}

/* ---------------------------------------------------------------------- *
 * Attribute lookup helpers
 * ---------------------------------------------------------------------- */

/** Look up a plain static attribute by name (case-insensitive). */
export function findAttribute(
  element: VisitedElement,
  attrName: string
): TmplAstTextAttribute | undefined {
  const lc = attrName.toLowerCase();
  for (const attr of element.attributes ?? []) {
    if (attr.name.toLowerCase() === lc) {
      return attr;
    }
  }
  return undefined;
}

/**
 * Look up a bound attribute (e.g. `[attr.data-testid]="..."`) by its source
 * attribute name ignoring the Angular `attr.` prefix. Returns the first match.
 *
 * Angular parses `[attr.data-testid]="expr"` into a BoundAttribute whose
 * `name` is the bare `data-testid` (without `attr.`) and whose `type` is
 * `Attribute`. We match purely by lowercase name to stay compatible with
 * small Angular-compiler version differences.
 */
export function findBoundAttribute(
  element: VisitedElement,
  attrName: string
): TmplAstBoundAttribute | undefined {
  const lc = attrName.toLowerCase();
  for (const attr of element.inputs ?? []) {
    if (attr.name.toLowerCase() === lc) {
      return attr;
    }
  }
  return undefined;
}

/**
 * True if the element already carries a testid - either as a plain static
 * attribute (`data-testid="..."`) OR as a runtime binding
 * (`[attr.data-testid]="..."`). Both forms must be respected by the tagger
 * so we don't override a manually-authored binding (FR-1.3-analog).
 */
export function hasTestidBinding(element: VisitedElement): boolean {
  if (findAttribute(element, 'data-testid')) return true;
  if (findBoundAttribute(element, 'data-testid')) return true;
  return false;
}

/**
 * Return the element's immediate static text content - only returns a value
 * if all children are plain `Text` nodes (no interpolation) per FR-1.6 rule 6.
 */
export function getStaticTextContent(element: VisitedElement): string | null {
  const children = element.children ?? [];
  if (children.length === 0) {
    return null;
  }
  let out = '';
  for (const child of children) {
    if (isText(child)) {
      out += child.value;
    } else if (isBoundText(child)) {
      return null; // interpolation present - skip per FR-1.6
    } else if (isElementLike(child)) {
      // element children are fine - we only care about our own text.
      continue;
    } else {
      return null;
    }
  }
  const trimmed = out.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Tag name of an element-like node. */
export function getTagName(element: VisitedElement): string {
  if (isElement(element)) return element.name;
  // ng-template
  return 'ng-template';
}

/* ---------------------------------------------------------------------- *
 * Immediate child-element shape
 * ---------------------------------------------------------------------- */

/**
 * Tag names of the element's direct element-like children, in source order.
 * Two structurally identical wrappers around different content (e.g. one
 * containing `<button>` and one containing `<input>`) get different shape
 * lists and stop colliding on the fingerprint.
 *
 * Order is preserved (not sorted): an icon-then-label row is structurally
 * different from a label-then-icon row even when both children are the same
 * tags.
 */
export function getChildShape(element: VisitedElement): string[] {
  const out: string[] = [];
  for (const child of element.children ?? []) {
    if (isElementLike(child)) {
      out.push(getTagName(child).toLowerCase());
    }
  }
  return out;
}

/* ---------------------------------------------------------------------- *
 * CSS classes
 * ---------------------------------------------------------------------- */

/**
 * Class tokens of the element. Lowercased, deduplicated, alphabetically
 * sorted so re-ordering classes in source doesn't change the fingerprint.
 *
 * All classes are included — utility classes (Tailwind `mt-4`, `flex`) are
 * noisy, but on real-world Angular templates the class string is often the
 * only thing distinguishing two structurally identical wrapper elements.
 */
export function getCssClasses(element: VisitedElement): string[] {
  const raw = findAttribute(element, 'class')?.value;
  if (!raw) return [];
  const seen = new Set<string>();
  for (const tok of raw.split(/\s+/)) {
    if (tok.length > 0) seen.add(tok.toLowerCase());
  }
  return [...seen].sort();
}

/* ---------------------------------------------------------------------- *
 * Structural directives carried on a synthetic <ng-template>
 * ---------------------------------------------------------------------- */

/**
 * Angular rewrites `*ngIf="cond"` into `<ng-template [ngIf]="cond">…</ng-template>`,
 * which means the wrapped element loses the directive info from its own
 * attributes. This helper digs into the immediate parent — when it's a
 * synthetic Template node — and pulls the structural-directive raw values
 * back out (`ngIf=cond`, `ngForOf=orders`, `ngSwitchCase=...`).
 *
 * Keys are lowercased; values are the raw expression text from source.
 */
export function getStructuralDirectives(
  parents: readonly VisitedElement[]
): Map<string, string> {
  const result = new Map<string, string>();
  if (parents.length === 0) return result;
  const direct = parents[parents.length - 1]!;
  if (!isTemplateNode(direct)) return result;
  const tmpl = direct as TmplAstTemplate;
  // templateAttrs entries have `value` as either a plain string (TextAttribute)
  // or an ASTWithSource (BoundAttribute) — the latter is what `*ngIf="cond"`
  // produces. Use the raw source text in both cases so we get exactly what
  // the developer wrote ("cond", "user.isAdmin && !disabled", etc.).
  for (const attr of tmpl.templateAttrs ?? []) {
    const name = typeof attr.name === 'string' ? attr.name.toLowerCase() : '';
    if (!name) continue;
    const v = readAttrValueText((attr as { value: unknown }).value);
    if (v) result.set(name, v);
  }
  // Bound `[ngIf]="…"` form — same idea. Falls back to '<expr>' marker so the
  // presence of a directive at least disambiguates from a wrapper-less sibling.
  for (const input of tmpl.inputs ?? []) {
    const name = typeof input.name === 'string' ? input.name.toLowerCase() : '';
    if (!name || result.has(name)) continue;
    const v = readAttrValueText((input as { value: unknown }).value);
    if (v) {
      result.set(name, v);
    } else {
      const path = extractDottedPath(input.value);
      result.set(name, path ?? '<expr>');
    }
  }
  return result;
}

/** Read either a string or an `ASTWithSource.source` field as a plain string. */
function readAttrValueText(value: unknown): string | null {
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (value && typeof value === 'object' && 'source' in value) {
    const src = (value as { source: unknown }).source;
    if (typeof src === 'string' && src.length > 0) return src;
  }
  return null;
}

/* ---------------------------------------------------------------------- *
 * Static attribute snapshots
 * ---------------------------------------------------------------------- */

/**
 * All statically-authored attributes on the element as `name → value` pairs.
 * Names are lowercased. The attribute that holds the testid itself
 * (`attributeName`, default `data-testid`) is excluded so it never feeds
 * back into its own fingerprint.
 *
 * Bound `[input]="'literal'"` is also collected here when the bound value is
 * a plain string literal, because semantically that's identical to a static
 * attribute - the developer just wrote it with a binding for type-correctness.
 */
export function getAllStaticAttributes(
  element: VisitedElement,
  options: { excludeName?: string } = {}
): Map<string, string> {
  const exclude = options.excludeName?.toLowerCase();
  const result = new Map<string, string>();
  for (const attr of element.attributes ?? []) {
    const name = attr.name.toLowerCase();
    if (exclude && name === exclude) continue;
    if (typeof attr.value === 'string') {
      result.set(name, attr.value);
    }
  }
  // [input]="'literal'" — Angular parses the value as a LiteralPrimitive.
  for (const input of element.inputs ?? []) {
    const name = input.name.toLowerCase();
    if (exclude && name === exclude) continue;
    if (result.has(name)) continue;
    const literal = extractStringLiteral(input.value);
    if (literal !== null) result.set(name, literal);
  }
  return result;
}

/* ---------------------------------------------------------------------- *
 * Bound-input identifiers
 * ---------------------------------------------------------------------- */

/**
 * For each bound `[input]="expression"`, return the input name mapped to the
 * dotted identifier path the binding reads. Function calls, operations,
 * literals, etc. are skipped — only "this is a variable" expressions are
 * extracted because a renamed variable is a strong, intentional signal.
 *
 * Two-way bindings `[(model)]="value"` are exposed to Angular as a
 * BoundAttribute whose `name` ends in `Change` plus a regular property; we
 * collect the property only.
 */
export function getBoundIdentifiers(element: VisitedElement): Map<string, string> {
  const result = new Map<string, string>();
  for (const input of element.inputs ?? []) {
    const name = input.name.toLowerCase();
    // Skip the `Change`-half of two-way bindings.
    if (name.endsWith('change')) continue;
    // Skip Angular structural / styling bindings — they generate noise without
    // distinguishing usage sites.
    if (name === 'ngclass' || name === 'ngstyle' || name === 'ngfor' || name === 'ngif') {
      continue;
    }
    const path = extractDottedPath(input.value);
    if (path !== null) result.set(name, path);
  }
  return result;
}

/* ---------------------------------------------------------------------- *
 * Event handler function names
 * ---------------------------------------------------------------------- */

/**
 * For each `(event)="handler(...)"`, return the event name mapped to the
 * function name. Lambdas, assignments, `$event.stopPropagation()`-style
 * meta-calls are skipped — only named function calls count.
 */
export function getEventHandlerNames(element: VisitedElement): Map<string, string> {
  const result = new Map<string, string>();
  const outputs = (element as TmplAstElement).outputs ?? [];
  for (const output of outputs) {
    if (!isBoundEvent(output)) continue;
    const fn = extractCallTarget(output.handler);
    if (fn !== null) result.set(output.name.toLowerCase(), fn);
  }
  return result;
}

/* ---------------------------------------------------------------------- *
 * Interpolation data (i18n keys + bound-text paths)
 * ---------------------------------------------------------------------- */

export interface InterpolationData {
  /** String literals fed into translation pipes (e.g. `'order.save'`). */
  i18nKeys: string[];
  /** Property paths from interpolations (e.g. `order.id`). */
  boundTextPaths: string[];
}

/**
 * Pipe names treated as "translation": their first input is taken as a key.
 * Includes ngx-translate (`translate`), Transloco (`transloco`/`t`) and the
 * Angular built-in i18n directive name as a defensive fallback.
 */
const I18N_PIPE_NAMES: ReadonlySet<string> = new Set([
  'translate',
  'transloco',
  't',
  'i18n'
]);

/** Inspect every BoundText child of `element` for interpolation expressions. */
export function getInterpolationData(element: VisitedElement): InterpolationData {
  const i18nKeys: string[] = [];
  const boundTextPaths: string[] = [];
  for (const child of element.children ?? []) {
    if (!isBoundText(child)) continue;
    collectFromExpression(child.value, i18nKeys, boundTextPaths);
  }
  return {
    i18nKeys: dedup(i18nKeys),
    boundTextPaths: dedup(boundTextPaths)
  };
}

function dedup(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/* ---------------------------------------------------------------------- *
 * Surrounding-context anchors
 * ---------------------------------------------------------------------- */

export interface ContextAnchors {
  label_for: string | null;
  wrapper_label: string | null;
  fieldset_legend: string | null;
  preceding_heading: string | null;
  wrapper_formcontrolname: string | null;
  aria_labelledby_text: string | null;
}

/** Element + immediate parent chain → surrounding-context anchors. */
export function resolveContextAnchors(
  element: VisitedElement,
  parents: readonly VisitedElement[],
  rootNodes: readonly TmplAstNode[]
): ContextAnchors {
  const result: ContextAnchors = {
    label_for: null,
    wrapper_label: null,
    fieldset_legend: null,
    preceding_heading: null,
    wrapper_formcontrolname: null,
    aria_labelledby_text: null
  };

  const ownId = findAttribute(element, 'id')?.value;
  if (ownId) {
    result.label_for = findLabelForId(rootNodes, ownId);
  }

  const ariaLabelledBy = findAttribute(element, 'aria-labelledby')?.value;
  if (ariaLabelledBy) {
    const referenced = ariaLabelledBy.split(/\s+/).filter(Boolean);
    const texts: string[] = [];
    for (const refId of referenced) {
      const text = findElementTextById(rootNodes, refId);
      if (text) texts.push(text);
    }
    if (texts.length > 0) result.aria_labelledby_text = texts.join(' ');
  }

  // walk up the parent chain looking for wrapper-level anchors. We stop at
  // logical section boundaries (form / section / fieldset / dialog / card /
  // role=region) so a heading on the page header isn't claimed by every
  // form field on the page.
  for (let i = parents.length - 1; i >= 0; i--) {
    const parent = parents[i]!;
    const tag = getTagName(parent).toLowerCase();

    // wrapper-level form-control name
    if (result.wrapper_formcontrolname === null) {
      const fcn = findAttribute(parent, 'formcontrolname')?.value;
      if (fcn) result.wrapper_formcontrolname = fcn;
    }

    // wrapper-component label/title/header/caption inputs
    if (result.wrapper_label === null) {
      const wrapperLabel = pickFirst(parent, [
        'label',
        'title',
        'header',
        'caption'
      ]);
      if (wrapperLabel) result.wrapper_label = wrapperLabel;
    }

    // <fieldset><legend>…</legend></fieldset>
    if (result.fieldset_legend === null && tag === 'fieldset') {
      const legend = findChildText(parent, 'legend');
      if (legend) result.fieldset_legend = legend;
    }

    // <mat-form-field><mat-label>…</mat-label></…>
    if (result.wrapper_label === null) {
      const matLabel = findChildText(parent, 'mat-label');
      if (matLabel) result.wrapper_label = matLabel;
    }

    // <p-floatlabel> with a child <label>
    if (result.wrapper_label === null && tag === 'p-floatlabel') {
      const lbl = findChildText(parent, 'label');
      if (lbl) result.wrapper_label = lbl;
    }

    // hard stop: don't propagate past these section boundaries
    if (isSectionBoundary(parent, tag)) break;
  }

  // preceding heading — search direct sibling list of the immediate parent.
  // No parent → we're at the root of the template; use the rootNodes themselves.
  const siblings = parents.length > 0
    ? (parents[parents.length - 1]!.children ?? [])
    : rootNodes;
  result.preceding_heading = findPrecedingHeading(siblings, element);

  return result;
}

/* ---------------------------------------------------------------------- *
 * AST expression helpers (private)
 * ---------------------------------------------------------------------- */

interface AstLike {
  ast?: unknown;
  receiver?: unknown;
  name?: unknown;
  expressions?: unknown;
  exp?: unknown;
  value?: unknown;
  args?: unknown;
}

/** Strip the ASTWithSource wrapper if present. */
function unwrapAst(node: unknown): unknown {
  if (node && typeof node === 'object' && 'ast' in (node as object) && (node as AstLike).ast) {
    return (node as AstLike).ast;
  }
  return node;
}

/**
 * Return the dotted identifier the expression reads (`order.customer.name`)
 * or null if the expression is anything more complex than a property chain.
 */
function extractDottedPath(node: unknown): string | null {
  let cur = unwrapAst(node);
  const segments: string[] = [];
  while (cur && typeof cur === 'object') {
    if (isCtor(cur, 'PropertyRead')) {
      const c = cur as AstLike;
      if (typeof c.name === 'string') segments.unshift(c.name);
      cur = c.receiver;
      continue;
    }
    if (isCtor(cur, 'ImplicitReceiver', 'ThisReceiver')) {
      // root of the chain — done
      return segments.length > 0 ? segments.join('.') : null;
    }
    return null;
  }
  return null;
}

/**
 * If the expression is a single-arg function call against `this`/the
 * implicit receiver (`saveOrder()`, `saveOrder($event)`), return the
 * function name; otherwise null.
 */
function extractCallTarget(node: unknown): string | null {
  const inner = unwrapAst(node);
  if (!isCtor(inner, 'Call')) return null;
  const c = inner as AstLike;
  const receiver = unwrapAst(c.receiver);
  if (!isCtor(receiver, 'PropertyRead')) return null;
  const r = receiver as AstLike;
  if (!isCtor(r.receiver, 'ImplicitReceiver', 'ThisReceiver')) {
    // method on a member like `service.save()` — accept and use the method name
  }
  return typeof r.name === 'string' ? r.name : null;
}

/** If the bound expression is a string literal, return its value. */
function extractStringLiteral(node: unknown): string | null {
  const inner = unwrapAst(node);
  if (!isCtor(inner, 'LiteralPrimitive')) return null;
  const v = (inner as AstLike).value;
  return typeof v === 'string' ? v : null;
}

/**
 * Walk the (Interpolation/expression) AST collecting i18n keys (string
 * literals fed into known translation pipes) and property paths.
 */
function collectFromExpression(
  node: unknown,
  i18nKeys: string[],
  boundTextPaths: string[]
): void {
  const cur = unwrapAst(node);
  if (!cur || typeof cur !== 'object') return;

  if (isCtor(cur, 'Interpolation')) {
    const exprs = (cur as AstLike).expressions;
    if (Array.isArray(exprs)) {
      for (const e of exprs) collectFromExpression(e, i18nKeys, boundTextPaths);
    }
    return;
  }

  if (isCtor(cur, 'BindingPipe')) {
    const c = cur as AstLike;
    const pipeName = typeof c.name === 'string' ? c.name.toLowerCase() : '';
    const inner = unwrapAst(c.exp);
    if (I18N_PIPE_NAMES.has(pipeName) && isCtor(inner, 'LiteralPrimitive')) {
      const v = (inner as AstLike).value;
      if (typeof v === 'string') i18nKeys.push(v);
      return; // don't descend further; the literal is the entire payload
    }
    // unknown pipe — descend into the input expression so e.g.
    // `{{ user.name | uppercase }}` still yields `user.name`.
    collectFromExpression(c.exp, i18nKeys, boundTextPaths);
    return;
  }

  if (isCtor(cur, 'PropertyRead')) {
    const path = extractDottedPath(cur);
    if (path) boundTextPaths.push(path);
    return;
  }
}

/* ---------------------------------------------------------------------- *
 * Context-resolver helpers (private)
 * ---------------------------------------------------------------------- */

const SECTION_BOUNDARY_TAGS: ReadonlySet<string> = new Set([
  'form',
  'section',
  'fieldset',
  'dialog',
  'mat-card',
  'p-card',
  'p-dialog',
  'p-confirmdialog',
  'p-dynamicdialog',
  'mat-dialog-content'
]);

function isSectionBoundary(element: VisitedElement, tagLower: string): boolean {
  if (SECTION_BOUNDARY_TAGS.has(tagLower)) return true;
  const role = findAttribute(element, 'role')?.value?.toLowerCase();
  if (role === 'region' || role === 'group') return true;
  return false;
}

function pickFirst(element: VisitedElement, names: readonly string[]): string | null {
  for (const name of names) {
    const v = findAttribute(element, name)?.value;
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

function findChildText(element: VisitedElement, childTag: string): string | null {
  const target = childTag.toLowerCase();
  for (const child of element.children ?? []) {
    if (!isElementLike(child)) continue;
    if (getTagName(child).toLowerCase() === target) {
      const text = getStaticTextContent(child);
      if (text) return text;
    }
  }
  return null;
}

function findPrecedingHeading(
  siblings: readonly TmplAstNode[],
  target: VisitedElement
): string | null {
  let lastHeading: string | null = null;
  for (const sib of siblings) {
    if (sib === target) return lastHeading;
    if (!isElementLike(sib)) continue;
    const tag = getTagName(sib).toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const text = getStaticTextContent(sib);
      if (text) lastHeading = text;
    }
  }
  return lastHeading;
}

function findLabelForId(nodes: readonly TmplAstNode[], id: string): string | null {
  let result: string | null = null;
  const visit = (children: readonly TmplAstNode[]): void => {
    if (result !== null) return;
    for (const child of children) {
      if (result !== null) return;
      if (isElementLike(child)) {
        if (getTagName(child).toLowerCase() === 'label') {
          const forAttr = findAttribute(child, 'for')?.value;
          if (forAttr === id) {
            const text = getStaticTextContent(child);
            if (text) {
              result = text;
              return;
            }
          }
        }
        visit(child.children ?? []);
      }
    }
  };
  visit(nodes);
  return result;
}

function findElementTextById(nodes: readonly TmplAstNode[], id: string): string | null {
  let result: string | null = null;
  const visit = (children: readonly TmplAstNode[]): void => {
    if (result !== null) return;
    for (const child of children) {
      if (result !== null) return;
      if (isElementLike(child)) {
        const elId = findAttribute(child, 'id')?.value;
        if (elId === id) {
          const text = getStaticTextContent(child);
          if (text) {
            result = text;
            return;
          }
        }
        visit(child.children ?? []);
      }
    }
  };
  visit(nodes);
  return result;
}
