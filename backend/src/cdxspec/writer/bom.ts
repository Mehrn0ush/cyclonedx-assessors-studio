/**
 * BOM envelope composer. Wraps a declarations subtree (and optional
 * definitions, metadata, document-level seal) into a complete
 * CycloneDX BOM suitable for serialization to JSON.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Bom,
  CdxSpecVersion,
  Declarations,
  Definitions,
  Metadata,
  Signature,
  ToolComponent,
} from '../types.js';

export interface ComposeBomInputs {
  specVersion: CdxSpecVersion;
  declarations?: Declarations;
  definitions?: Definitions;
  metadata?: Metadata;
  /**
   * Top level document seal. Produced by the affirmation cascade
   * signing flow. Emitted as `signature` on the BOM root.
   */
  documentSeal?: Signature;
  /**
   * Override the auto-generated serialNumber. Primarily for tests.
   */
  serialNumber?: string;
  /**
   * Override the BOM version counter. Defaults to 1.
   */
  version?: number;
  /**
   * Override the ISO timestamp used when no metadata is provided.
   */
  timestamp?: string;
  /**
   * Replace the default `CycloneDX Assessors Studio` tool component
   * when composing metadata. Ignored if `metadata` is explicitly
   * provided.
   */
  toolComponent?: ToolComponent;
}

function schemaUrlFor(version: CdxSpecVersion): string {
  return version === '1.6'
    ? 'http://cyclonedx.org/schema/bom-1.6.schema.json'
    : 'http://cyclonedx.org/schema/bom-1.7.schema.json';
}

function defaultMetadata(timestamp: string, tool?: ToolComponent): Metadata {
  const toolComponent: ToolComponent = tool ?? {
    type: 'application',
    name: 'CycloneDX Assessors Studio',
  };
  return {
    timestamp,
    tools: {
      components: [toolComponent],
    },
  };
}

export function composeBom(inputs: ComposeBomInputs): Bom {
  const timestamp = inputs.timestamp ?? new Date().toISOString();

  const bom: Bom = {
    $schema: schemaUrlFor(inputs.specVersion),
    bomFormat: 'CycloneDX',
    specVersion: inputs.specVersion,
    serialNumber: inputs.serialNumber ?? `urn:uuid:${uuidv4()}`,
    version: inputs.version ?? 1,
    metadata: inputs.metadata ?? defaultMetadata(timestamp, inputs.toolComponent),
  };

  if (inputs.declarations) bom.declarations = inputs.declarations;
  if (inputs.definitions) bom.definitions = inputs.definitions;
  if (inputs.documentSeal) bom.signature = inputs.documentSeal;

  return bom;
}
