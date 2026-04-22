/**
 * Stable, URL-safe bom-ref builder.
 *
 * CycloneDX refType values must be unique within a BOM and should not
 * start with the reserved BOM-Link intro `urn:cdx:`. This module
 * centralises bom-ref construction so that refs for the same kind of
 * object follow a single convention across writer modules. Prior code
 * scattered expressions like `claim-${id}` and `requirement-${id}` at
 * call sites, which made it easy to get out of step when one writer
 * emitted a ref and another consumer expected it in a different form.
 */

export type RefKind =
  | 'assessor'
  | 'attestation'
  | 'claim'
  | 'evidence'
  | 'requirement'
  | 'standard'
  | 'target'
  | 'signatory';

/**
 * Build a bom-ref string for a given kind and identifier. The
 * identifier is not sanitised beyond a basic replacement of
 * whitespace, on the assumption that callers pass DB UUIDs. Callers
 * that synthesize refs from free-form strings should sanitise first.
 */
export function refFor(kind: RefKind, id: string): string {
  return `${kind}-${id}`;
}

/**
 * Sanitise a free-form string so it can be used as the identifier
 * portion of a bom-ref. Lower-cased, whitespace collapsed to dashes,
 * non-word characters stripped. Used when building target refs from
 * human-readable names.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
