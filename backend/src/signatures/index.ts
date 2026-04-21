/**
 * Signature provider entry point.
 *
 * Imports of `@/signatures` resolve here. The module exports the
 * provider interface, the registry class, the JSF provider, and a
 * lazily-initialized default registry pre-populated with the
 * providers Assessors Studio ships today.
 *
 * Tests can import {createRegistry} or call SignatureProviderRegistry
 * directly to swap in a mock provider.
 */

import {
  verifyDetachedSignature,
  normalizeAlgorithm,
  type DetachedVerifyOptions,
  type DetachedVerifyResult,
} from './detached-verify.js';
import { JsfSignatureProvider, jsfCanonicalBytes } from './jsf-provider.js';
import { JssSignatureProvider, JssNotImplementedError } from './jss-provider.js';
import { SignatureProviderRegistry } from './registry.js';

export type {
  CanonicalizedPayload,
  JsonObject,
  JsonValue,
  ProviderKeyInput,
  ProviderSignOptions,
  ProviderSignResult,
  ProviderVerifyOptions,
  ProviderVerifyResult,
  SignatureProvider,
} from './types.js';

export type { DetachedVerifyOptions, DetachedVerifyResult };

export {
  JsfSignatureProvider,
  jsfCanonicalBytes,
  JssSignatureProvider,
  JssNotImplementedError,
  SignatureProviderRegistry,
  normalizeAlgorithm,
  verifyDetachedSignature,
};

let defaultRegistry: SignatureProviderRegistry | null = null;

/**
 * Build a fresh registry pre-loaded with the providers shipping today.
 * Tests that need to swap providers in/out should call this and modify
 * the returned instance instead of mutating the singleton.
 */
export function createRegistry(): SignatureProviderRegistry {
  const registry = new SignatureProviderRegistry();
  registry.register(new JsfSignatureProvider(), { asDefault: true });
  registry.register(new JssSignatureProvider());
  return registry;
}

/** Process-wide default registry. Built on first access. */
export function getSignatureProviders(): SignatureProviderRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createRegistry();
  }
  return defaultRegistry;
}

/** Replace the default registry. Useful for tests. */
export function setSignatureProviders(registry: SignatureProviderRegistry): void {
  defaultRegistry = registry;
}
