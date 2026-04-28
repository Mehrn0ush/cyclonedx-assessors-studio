/**
 * Signature provider entry point.
 *
 * Imports of `@/signatures` resolve here. The module exports the
 * provider interface, the registry class, the JSF provider (CycloneDX
 * 1.x), the JSS provider (CycloneDX 2.x), and a lazily initialized
 * default registry pre-populated with both providers.
 *
 * Format / version mapping (mirrors @cyclonedx/sign):
 *
 *   CycloneDX 1.x  -> JSF (JSON Signature Format 0.82)
 *   CycloneDX 2.x  -> JSS (JSON Signature Scheme, ITU-T X.590)
 *
 * Routes that emit a signed envelope should pick the provider with
 * `getProviderForCycloneDxMajor(major)` rather than reaching for a
 * fixed name. Tests can import {createRegistry} or call
 * SignatureProviderRegistry directly to swap in a mock provider.
 */

import {
  verifyDetachedSignature,
  normalizeAlgorithm,
  type DetachedVerifyOptions,
  type DetachedVerifyResult,
} from './detached-verify.js';
import { JsfSignatureProvider, jsfCanonicalBytes } from './jsf-provider.js';
import { JssSignatureProvider, jssCanonicalBytes } from './jss-provider.js';
import { SignatureProviderRegistry } from './registry.js';
import type { SignatureProvider } from './types.js';

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
  jssCanonicalBytes,
  SignatureProviderRegistry,
  normalizeAlgorithm,
  verifyDetachedSignature,
};

/**
 * CycloneDX major version. Mirrors `@cyclonedx/sign`'s `CycloneDxMajor`
 * enum but stays as a plain numeric union so callers can write `1` or
 * `2` without importing the enum from the signing library.
 */
export type CycloneDxMajor = 1 | 2;

/** Provider name bound to a CycloneDX major version. */
const PROVIDER_BY_MAJOR: Readonly<Record<CycloneDxMajor, 'jsf' | 'jss'>> = {
  1: 'jsf',
  2: 'jss',
};

let defaultRegistry: SignatureProviderRegistry | null = null;

/**
 * Build a fresh registry pre-loaded with the providers shipping today.
 * Tests that need to swap providers in/out should call this and modify
 * the returned instance instead of mutating the singleton.
 */
export function createRegistry(): SignatureProviderRegistry {
  const registry = new SignatureProviderRegistry();
  // JSF is the default because the live export path emits CycloneDX
  // 1.6 / 1.7 documents. JSS is registered alongside so the v2 export
  // path can pick it up by major version when it lands.
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

/**
 * Pick the SignatureProvider that targets the given CycloneDX major
 * version.
 *
 * Throws when the requested provider has not been registered (which
 * should not happen in normal operation because `createRegistry()`
 * registers both today).
 *
 * Use this rather than `.getDefault()` whenever a route knows the
 * spec version it is producing — the v1 export path should always
 * receive the JSF provider, and the future v2 export path should
 * always receive JSS, regardless of which provider is currently the
 * registry default.
 */
export function getProviderForCycloneDxMajor(
  major: CycloneDxMajor,
  registry: SignatureProviderRegistry = getSignatureProviders(),
): SignatureProvider {
  const name = PROVIDER_BY_MAJOR[major];
  return registry.require(name);
}
