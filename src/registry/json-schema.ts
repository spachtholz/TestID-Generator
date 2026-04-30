/**
 * JSON Schema for the testid registry (FR-2.5).
 *
 * Exported as a plain object so it can be dropped directly into Ajv:
 *
 *   import { registryJsonSchema } from '@testid/registry/json-schema';
 *   const validate = new Ajv({ allErrors: true }).compile(registryJsonSchema);
 */

export const registryJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://testid-automation.dev/schemas/testid-registry.schema.json',
  title: 'TestId Registry',
  type: 'object',
  additionalProperties: false,
  required: [
    'version',
    'generated_at',
    'framework_versions',
    'entries'
  ],
  properties: {
    $schema: { type: 'string' },
    version: { type: 'integer', minimum: 1 },
    generated_at: { type: 'string', format: 'date-time' },
    build_id: { type: ['string', 'null'] },
    app_version: { type: ['string', 'null'] },
    framework_versions: {
      type: 'object',
      additionalProperties: { type: 'string' }
    },
    entries: {
      type: 'object',
      additionalProperties: { $ref: '#/definitions/entry' }
    }
  },
  definitions: {
    entry: {
      type: 'object',
      additionalProperties: false,
      required: [
        'component',
        'tag',
        'element_type',
        'fingerprint',
        'semantic',
        'first_seen_version',
        'last_seen_version'
      ],
      properties: {
        component: { type: 'string' },
        tag: { type: 'string' },
        element_type: { type: 'string' },
        fingerprint: { type: 'string' },
        semantic: { $ref: '#/definitions/semantic' },
        dynamic_children: {
          oneOf: [
            { type: 'null' },
            { $ref: '#/definitions/dynamicChildren' }
          ]
        },
        source: { type: 'string', enum: ['generated', 'manual'] },
        locator_name: { type: 'string', minLength: 1 },
        first_seen_version: { type: 'integer', minimum: 1 },
        last_seen_version: { type: 'integer', minimum: 1 },
        last_generated_at: { type: 'string', format: 'date-time' },
        generation_history: {
          type: 'array',
          items: { type: 'integer', minimum: 1 },
          minItems: 1
        }
      }
    },
    semantic: {
      type: 'object',
      // Tier 1-5 fields are optional and may be absent in old registries; we
      // accept additional unknown keys so the registry can be loaded across
      // mismatched tooling versions without validation failures.
      additionalProperties: true,
      properties: {
        // Tier 0
        formcontrolname: { type: ['string', 'null'] },
        name: { type: ['string', 'null'] },
        routerlink: { type: ['string', 'null'] },
        aria_label: { type: ['string', 'null'] },
        placeholder: { type: ['string', 'null'] },
        text_content: { type: ['string', 'null'] },
        type: { type: ['string', 'null'] },
        role: { type: ['string', 'null'] },
        // Tier 1
        title: { type: ['string', 'null'] },
        alt: { type: ['string', 'null'] },
        value: { type: ['string', 'null'] },
        html_id: { type: ['string', 'null'] },
        href: { type: ['string', 'null'] },
        src: { type: ['string', 'null'] },
        html_for: { type: ['string', 'null'] },
        label: { type: ['string', 'null'] },
        // Tier 2
        static_attributes: {
          oneOf: [
            { type: 'null' },
            { type: 'object', additionalProperties: { type: 'string' } }
          ]
        },
        // Tier 3
        bound_identifiers: {
          oneOf: [
            { type: 'null' },
            { type: 'object', additionalProperties: { type: 'string' } }
          ]
        },
        // Tier 4
        event_handlers: {
          oneOf: [
            { type: 'null' },
            { type: 'object', additionalProperties: { type: 'string' } }
          ]
        },
        // Tier 5
        i18n_keys: {
          oneOf: [
            { type: 'null' },
            { type: 'array', items: { type: 'string' } }
          ]
        },
        bound_text_paths: {
          oneOf: [
            { type: 'null' },
            { type: 'array', items: { type: 'string' } }
          ]
        },
        // Tier 8: surrounding context
        context: {
          oneOf: [
            { type: 'null' },
            { $ref: '#/definitions/context' }
          ]
        }
      }
    },
    context: {
      type: 'object',
      additionalProperties: false,
      properties: {
        label_for: { type: ['string', 'null'] },
        wrapper_label: { type: ['string', 'null'] },
        fieldset_legend: { type: ['string', 'null'] },
        preceding_heading: { type: ['string', 'null'] },
        wrapper_formcontrolname: { type: ['string', 'null'] },
        aria_labelledby_text: { type: ['string', 'null'] }
      }
    },
    dynamicChildren: {
      type: 'object',
      additionalProperties: false,
      required: ['pattern', 'addressing'],
      properties: {
        pattern: { type: 'string' },
        addressing: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['by_index', 'by_text', 'by_value', 'by_date']
          }
        }
      }
    }
  }
} as const;

export default registryJsonSchema;
