/**
 * Top-level barrel for the cdxspec package.
 *
 * `cdxspec` is the CycloneDX specification layer for this
 * application: reading, writing, and validating CycloneDX
 * documents against the ECMA-424 JSON Schemas (bom-1.6 and bom-1.7).
 * It is the single place where the BOM shape is defined for this
 * codebase; route handlers and services that produce or consume a
 * BOM should import from here rather than hand-rolling the shape.
 *
 * The jsf signing primitives live in signatures/jsf-provider.ts and
 * remain separate: cdxspec owns the BOM shape, jsf-provider owns
 * cryptographic envelope production and verification. They compose
 * by cdxspec emitting or accepting an opaque `signature` value.
 */

export * from './types.js';
export * from './scores.js';
export * from './bomref.js';
export * from './writer/index.js';
export * from './reader/index.js';
export * from './validator/index.js';
