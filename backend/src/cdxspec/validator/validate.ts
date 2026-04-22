/**
 * Strict schema validation of a CycloneDX BOM against the upstream
 * JSON Schema for the selected specification version. Produces a
 * structured result object so callers can format errors without
 * needing to speak Ajv's shape.
 */

import type { ErrorObject } from 'ajv';

import type { Bom, CdxSpecVersion } from '../types.js';
import { getValidator } from './ajv.js';

export interface BomValidationError {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message: string;
  params?: Record<string, unknown>;
}

export interface BomValidationResult {
  valid: boolean;
  errors: BomValidationError[];
}

function toValidationError(err: ErrorObject): BomValidationError {
  return {
    instancePath: err.instancePath ?? '',
    schemaPath: err.schemaPath ?? '',
    keyword: err.keyword ?? 'unknown',
    message: err.message ?? 'validation failed',
    params: (err.params as Record<string, unknown>) ?? undefined,
  };
}

/**
 * Validate a BOM against the JSON Schema for its specVersion. If no
 * version is passed explicitly, the BOM's own `specVersion` field is
 * used; unknown versions fall back to 1.7.
 */
export function validateBom(
  bom: unknown,
  version?: CdxSpecVersion
): BomValidationResult {
  let spec: CdxSpecVersion = version ?? '1.7';
  if (!version && bom && typeof bom === 'object') {
    const raw = (bom as { specVersion?: unknown }).specVersion;
    if (raw === '1.6' || raw === '1.7') spec = raw;
  }

  const validator = getValidator(spec);
  const ok = validator(bom);
  if (ok) return { valid: true, errors: [] };

  const errors = (validator.errors ?? []).map(toValidationError);
  return { valid: false, errors };
}

/**
 * Convenience wrapper that takes a typed Bom and returns the same
 * result as validateBom. Exists so callers with a typed value can
 * avoid the `unknown` cast at the call site.
 */
export function validateTypedBom(
  bom: Bom,
  version?: CdxSpecVersion
): BomValidationResult {
  return validateBom(bom, version ?? bom.specVersion);
}
