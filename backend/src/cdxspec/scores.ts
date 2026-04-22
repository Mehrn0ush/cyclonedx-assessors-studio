/**
 * Score coercion for CycloneDX conformance and confidence fields.
 *
 * Both fields are typed as JSON numbers in the CycloneDX schema
 * (bom-1.6 and bom-1.7), bounded to 0..1 inclusive. The underlying
 * DB columns are Postgres DECIMAL, which most drivers (node-postgres,
 * PGlite) return as strings like "1.00" or "0.95" to preserve
 * precision. If those strings are passed straight through to the BOM,
 * the output fails schema validation because the field type is
 * string instead of number. All writer code paths that emit a score
 * value MUST funnel through toScore() so the coercion happens in
 * exactly one place.
 */

/**
 * Coerce a score-like value to a JS number in the inclusive range
 * 0..1. Accepts number, numeric string, or null/undefined. Returns
 * undefined when the input is null/undefined. Throws when the input
 * is a non-numeric string or out of range, so callers get a loud
 * failure instead of silently emitting an invalid BOM.
 */
export function toScore(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;

  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    n = Number(trimmed);
  } else {
    throw new TypeError(
      `toScore: expected number, numeric string, null, or undefined, received ${typeof value}`
    );
  }

  if (!Number.isFinite(n)) {
    throw new RangeError(`toScore: value is not a finite number: ${String(value)}`);
  }
  if (n < 0 || n > 1) {
    throw new RangeError(`toScore: value out of 0..1 range: ${n}`);
  }
  return n;
}

/**
 * Strict variant of toScore() that throws on undefined. Use when the
 * spec requires a score to be present (conformance.score is required
 * in practice for every map entry we emit).
 */
export function requireScore(value: unknown, fieldName: string): number {
  const n = toScore(value);
  if (n === undefined) {
    throw new TypeError(`${fieldName} is required but was null/undefined`);
  }
  return n;
}
