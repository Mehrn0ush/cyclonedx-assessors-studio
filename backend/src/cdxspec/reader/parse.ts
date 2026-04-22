/**
 * Thin facade around the zod reader schema. Returns a discriminated
 * union so callers can react uniformly to both malformed JSON input
 * and schema-shape failures without threading try/catch.
 */

import { cyclonedxBomSchema } from './zod-schemas.js';
import type { ParsedCyclonedxBom } from './zod-schemas.js';

export interface ParseBomSuccess {
  ok: true;
  bom: ParsedCyclonedxBom;
}

export interface ParseBomFailure {
  ok: false;
  errors: Array<{ path: string; message: string }>;
}

export type ParseBomResult = ParseBomSuccess | ParseBomFailure;

/**
 * Validate an incoming BOM against the lightweight zod envelope schema.
 * Does NOT enforce the full JSON Schema — pair with validateBom() for
 * strict validation. Accepts either a string (which will be JSON.parsed)
 * or an already-parsed object.
 */
export function parseBom(input: unknown): ParseBomResult {
  let candidate: unknown = input;
  if (typeof input === 'string') {
    try {
      candidate = JSON.parse(input);
    } catch (err) {
      return {
        ok: false,
        errors: [
          {
            path: '',
            message: err instanceof Error ? err.message : 'Input is not valid JSON',
          },
        ],
      };
    }
  }

  const result = cyclonedxBomSchema.safeParse(candidate);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    };
  }

  return { ok: true, bom: result.data };
}
