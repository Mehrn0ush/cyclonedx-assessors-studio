/**
 * Target resolution for claims.
 *
 * CycloneDX Claim.target must be a refLinkType pointing at a target
 * somewhere in the BOM (organizationalEntity, component, or service).
 * The DB claim row carries only a free-form string (`target`) and an
 * optional FK to an entity row (`target_entity_id`). This resolver
 * turns those two pieces of information into a deterministic bom-ref
 * and tracks the synthetic organizationalEntity records that must be
 * emitted into `declarations.targets.organizations` so the bom-ref
 * actually resolves within the BOM.
 *
 * Dedupe is keyed on target_entity_id when present, otherwise on a
 * slug of the free-form name. Two claims that name the same target
 * therefore share a single organizationalEntity entry.
 */

import { refFor, slugify } from '../bomref.js';
import type { OrganizationalEntity } from '../types.js';

export interface TargetInput {
  target: string;
  targetEntityId?: string | null;
}

export class TargetResolver {
  private readonly byKey: Map<string, OrganizationalEntity> = new Map();

  /**
   * Resolve a claim's target to a bom-ref and register the synthetic
   * organizationalEntity if it has not been seen before. Returns the
   * bom-ref string suitable for `Claim.target`.
   */
  resolve(input: TargetInput): string {
    const name = (input.target ?? '').trim();
    const key = input.targetEntityId
      ? `entity:${input.targetEntityId}`
      : `name:${slugify(name) || 'unknown'}`;

    const existing = this.byKey.get(key);
    if (existing && existing['bom-ref']) {
      return existing['bom-ref'];
    }

    const idPart = input.targetEntityId
      ? input.targetEntityId
      : slugify(name) || 'unknown';
    const bomRef = refFor('target', idPart);

    const entity: OrganizationalEntity = {
      'bom-ref': bomRef,
      name: name || 'Unknown target',
    };
    this.byKey.set(key, entity);
    return bomRef;
  }

  /**
   * All organizationalEntity records accumulated so far. Callers
   * merge these into `declarations.targets.organizations`.
   */
  organizations(): OrganizationalEntity[] {
    return Array.from(this.byKey.values());
  }
}
