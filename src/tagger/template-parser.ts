// Thin wrapper around @angular/compiler's template parser (FR-1.5).
// Uses the Angular parser so @if/@for/@switch work on v18+.

import {
  parseTemplate,
  type TmplAstNode,
  type TmplAstElement,
  type TmplAstTemplate,
  type TmplAstTextAttribute,
  type TmplAstBoundAttribute,
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

/**
 * Walk the AST, invoking `visit` for every element-like node.
 *
 * Handles control-flow blocks (`@if`/`@for`/`@switch`/`@defer`) and the
 * `<ng-template>` template node.
 */
export function walkElements(
  nodes: readonly TmplAstNode[] | undefined,
  visit: (node: VisitedElement) => void
): void {
  if (!nodes) {
    return;
  }
  for (const node of nodes) {
    walkNode(node, visit);
  }
}

function walkNode(node: TmplAstNode, visit: (node: VisitedElement) => void): void {
  if (isElementLike(node)) {
    visit(node);
    walkElements(node.children, visit);
    return;
  }

  if (isIfBlock(node)) {
    for (const branch of node.branches) {
      walkElements(branch.children, visit);
    }
    return;
  }

  if (isForLoop(node)) {
    walkElements(node.children, visit);
    if (node.empty) {
      walkElements(node.empty.children, visit);
    }
    return;
  }

  if (isSwitchBlock(node)) {
    for (const c of node.cases) {
      walkElements(c.children, visit);
    }
    return;
  }

  if (isDeferredBlock(node)) {
    walkElements(node.children, visit);
    if (node.placeholder) walkElements(node.placeholder.children, visit);
    if (node.loading) walkElements(node.loading.children, visit);
    if (node.error) walkElements(node.error.children, visit);
    return;
  }

  // Other nodes (Text, BoundText, Comment, Icu, LetDeclaration, ...) have no children.
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
