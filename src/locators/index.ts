/**
 * Public entry point for the Robot Framework locator generator.
 *
 * The generator reads a `testids.latest.json` registry and emits one Python
 * module per Angular component, each holding flat `camelCase` constants that
 * resolve to an XPath selector like
 *   xpath://*[@data-testid='order-list__table--auftragsliste']
 *
 * Generated files carry a `# testid-managed` marker on each line so the
 * existing Python replacer can rewrite them when an id is renamed.
 */

export { renderLocatorModule, filenameForComponent } from './render.js';
export { generateLocators } from './generator.js';
export type {
  GenerateLocatorsOptions,
  GenerateLocatorsResult,
  LocatorEntry,
  LocatorModule
} from './types.js';
