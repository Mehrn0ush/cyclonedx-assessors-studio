/**
 * Registry of SignatureProviders.
 *
 * The registry is the only place the route code needs to look up a
 * provider by name. Today the JSF provider is registered at boot;
 * the JSS provider (ITU-T X.590) is scaffolded but throws until
 * CycloneDX v2 ships. Tests can swap in their own providers for
 * deterministic verification by calling register() before the route
 * imports.
 */

import type { SignatureProvider } from './types.js';

export class SignatureProviderRegistry {
  private readonly providers = new Map<string, SignatureProvider>();
  private defaultName: string | null = null;

  register(provider: SignatureProvider, options: { asDefault?: boolean } = {}): void {
    if (!provider.name) {
      throw new Error('SignatureProvider.name is required');
    }
    this.providers.set(provider.name, provider);
    if (options.asDefault || this.defaultName === null) {
      this.defaultName = provider.name;
    }
  }

  unregister(name: string): void {
    this.providers.delete(name);
    if (this.defaultName === name) {
      this.defaultName = this.providers.keys().next().value ?? null;
    }
  }

  /** Return the provider by name, or undefined. */
  get(name: string): SignatureProvider | undefined {
    return this.providers.get(name);
  }

  /** Return the provider by name; throw if missing. */
  require(name: string): SignatureProvider {
    const p = this.providers.get(name);
    if (!p) {
      throw new Error(
        `SignatureProvider "${name}" is not registered. Registered: ${
          Array.from(this.providers.keys()).join(', ') || '(none)'
        }`,
      );
    }
    return p;
  }

  /** Return the default provider (the first one registered, unless overridden). */
  getDefault(): SignatureProvider {
    if (!this.defaultName) {
      throw new Error('No SignatureProvider registered');
    }
    const p = this.providers.get(this.defaultName);
    if (!p) {
      throw new Error(`Default SignatureProvider "${this.defaultName}" is missing`);
    }
    return p;
  }

  /** All registered providers, in registration order. */
  list(): SignatureProvider[] {
    return Array.from(this.providers.values());
  }

  /** True when the registry has a provider by this name. */
  has(name: string): boolean {
    return this.providers.has(name);
  }
}
