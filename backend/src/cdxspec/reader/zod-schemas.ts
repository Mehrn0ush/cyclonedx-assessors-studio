/**
 * Lightweight zod schemas for parsing incoming CycloneDX BOMs.
 *
 * These are intentionally loose: the top-level envelope is checked
 * (bomFormat, specVersion) and the structural containers are walked
 * enough to surface obviously-malformed input, but deeply nested
 * subtrees are typed as z.any() because the route code reads them
 * dynamically. Callers that need strict validation against the
 * upstream JSON Schema should pair parseBom() with validateBom()
 * from ../validator.
 */

import { z } from 'zod';

export const cyclonedxBomSchema = z
  .object({
    bomFormat: z.literal('CycloneDX', {
      message: 'Invalid CycloneDX document: bomFormat must be "CycloneDX"',
    }),
    specVersion: z.string().min(1, 'specVersion is required'),
    version: z.number().optional(),
    serialNumber: z.string().optional(),
    metadata: z.any().optional(),
    components: z.array(z.any()).optional(),
    services: z.array(z.any()).optional(),
    externalReferences: z.array(z.any()).optional(),
    definitions: z
      .object({
        standards: z.array(z.any()).optional(),
      })
      .passthrough()
      .optional(),
    declarations: z
      .object({
        assessors: z.array(z.any()).optional(),
        targets: z.any().optional(),
        evidence: z.array(z.any()).optional(),
        claims: z.array(z.any()).optional(),
        affirmation: z.any().optional(),
        attestations: z.array(z.any()).optional(),
      })
      .optional(),
    properties: z.array(z.any()).optional(),
  })
  .passthrough();

export type ParsedCyclonedxBom = z.infer<typeof cyclonedxBomSchema>;
