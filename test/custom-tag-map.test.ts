import { describe, it, expect } from 'vitest';
import { tagTemplateSource } from '../src/tagger/tagger.js';
import { DEFAULT_CONFIG } from '../src/tagger/config-loader.js';

describe('customTagMap', () => {
  it('maps a custom tag to the configured shortType and longType', () => {
    const out = tagTemplateSource(
      `<app-user-menu></app-user-menu>`,
      {
        componentName: 'layout',
        componentPath: 'layout.component.html',
        hashLength: 6,
        config: {
          ...DEFAULT_CONFIG,
          customTagMap: {
            'app-user-menu': { shortType: 'menu', longType: 'custom_user_menu' }
          }
        }
      }
    );
    const [id, entry] = Object.entries(out.entries)[0]!;
    expect(id).toMatch(/^layout__menu--/);
    expect(entry.element_type).toBe('custom_user_menu');
  });

  it('can override a native tag', () => {
    const out = tagTemplateSource(
      `<button>Click</button>`,
      {
        componentName: 'x',
        componentPath: 'x.html',
        hashLength: 6,
        config: {
          ...DEFAULT_CONFIG,
          customTagMap: {
            button: { shortType: 'cta', longType: 'custom_cta' }
          }
        }
      }
    );
    const [id, entry] = Object.entries(out.entries)[0]!;
    expect(id).toContain('__cta--');
    expect(entry.element_type).toBe('custom_cta');
  });

  it('leaves non-matching tags untouched', () => {
    const out = tagTemplateSource(
      `<div></div>`,
      {
        componentName: 'x',
        componentPath: 'x.html',
        hashLength: 6,
        config: {
          ...DEFAULT_CONFIG,
          customTagMap: {
            'my-widget': { shortType: 'widget', longType: 'custom_widget' }
          }
        }
      }
    );
    const [id, entry] = Object.entries(out.entries)[0]!;
    expect(id).toMatch(/^x__div--/);
    expect(entry.element_type).toBe('dom_div');
  });
});
