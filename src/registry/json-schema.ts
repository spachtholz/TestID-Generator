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
      additionalProperties: { type: ['string', 'null'] },
      properties: {
        formcontrolname: { type: ['string', 'null'] },
        name: { type: ['string', 'null'] },
        routerlink: { type: ['string', 'null'] },
        aria_label: { type: ['string', 'null'] },
        placeholder: { type: ['string', 'null'] },
        text_content: { type: ['string', 'null'] },
        type: { type: ['string', 'null'] },
        role: { type: ['string', 'null'] }
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
