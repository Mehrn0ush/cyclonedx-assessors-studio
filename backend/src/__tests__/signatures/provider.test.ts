/**
 * SignatureProvider contract tests.
 *
 * These exercise the provider abstraction end-to-end against the
 * JSF provider, and confirm the registry behaves as advertised.
 * The JSS (ITU-T X.590) stub is validated to refuse every operation
 * with a recognizable error type until CycloneDX v2 lands.
 */

import { describe, it, expect } from 'vitest';
import {
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';

import {
  JsfSignatureProvider,
  JssNotImplementedError,
  JssSignatureProvider,
  SignatureProviderRegistry,
  createRegistry,
  getSignatureProviders,
} from '../../signatures/index.js';

interface KeyPair {
  privateKey: KeyObject;
  publicKey: KeyObject;
}

function ecPair(): KeyPair {
  return generateKeyPairSync('ec', { namedCurve: 'prime256v1' }) as unknown as KeyPair;
}

function samplePayload() {
  return {
    id: 'attestation-1',
    summary: 'compliance statement',
    requirements: [
      { id: 'r1', score: 'pass' },
      { id: 'r2', score: 'pass' },
    ],
  };
}

describe('JsfSignatureProvider', () => {
  const provider = new JsfSignatureProvider();

  it('advertises the JSF format and full algorithm set', () => {
    expect(provider.name).toBe('jsf');
    expect(provider.signatureFormat).toBe('jsf');
    expect(provider.supportedAlgorithms).toContain('ES256');
    expect(provider.supportedAlgorithms).toContain('RS256');
    expect(provider.supportedAlgorithms).toContain('Ed25519');
    expect(provider.supportedAlgorithms).toContain('HS256');
  });

  it('produces canonical bytes and a hash for a given payload', () => {
    const payload = samplePayload();
    const { bytes, sha256Hex } = provider.canonicalize(payload, { algorithm: 'ES256' });
    expect(bytes.length).toBeGreaterThan(0);
    expect(sha256Hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('canonicalize is deterministic across input key order', () => {
    const a = { id: '1', summary: 's', requirements: [] };
    const b = { requirements: [], summary: 's', id: '1' };
    const ca = provider.canonicalize(a, { algorithm: 'ES256' });
    const cb = provider.canonicalize(b, { algorithm: 'ES256' });
    expect(ca.sha256Hex).toBe(cb.sha256Hex);
  });

  it('signs and verifies a JSON payload', () => {
    const { privateKey } = ecPair();
    const signResult = provider.sign(samplePayload(), {
      algorithm: 'ES256',
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    });
    expect(signResult.algorithm).toBe('ES256');
    expect(signResult.signatureValue.length).toBeGreaterThan(0);
    expect(signResult.canonicalHashSha256).toMatch(/^[0-9a-f]{64}$/);

    const verifyResult = provider.verify(signResult.envelope);
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.algorithm).toBe('ES256');
    expect(verifyResult.reasons).toEqual([]);
  });

  it('rejects unsupported algorithms at sign time', () => {
    const { privateKey } = ecPair();
    expect(() =>
      provider.sign(samplePayload(), {
        algorithm: 'NOT-A-REAL-ALG',
        privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      }),
    ).toThrow(/does not support/);
  });

  it('honours excludes during sign and verify', () => {
    const { privateKey } = ecPair();
    const payload = { ...samplePayload(), transient: 'volatile' };
    const signed = provider.sign(payload, {
      algorithm: 'ES256',
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      excludes: ['transient'],
    });
    // Mutating an excluded field must not invalidate the signature.
    const mutated = { ...signed.envelope, transient: 'something else' };
    expect(provider.verify(mutated).valid).toBe(true);
  });

  it('returns structured reasons when verification fails', () => {
    const { privateKey } = ecPair();
    const signed = provider.sign(samplePayload(), {
      algorithm: 'ES256',
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    });
    const tampered = { ...signed.envelope, summary: 'different text' };
    const result = provider.verify(tampered);
    expect(result.valid).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/did not verify/);
  });
});

describe('JssSignatureProvider', () => {
  const provider = new JssSignatureProvider();

  it('identifies as jss with the x590 format and advertises no algorithms yet', () => {
    expect(provider.name).toBe('jss');
    expect(provider.signatureFormat).toBe('x590');
    expect(provider.supportedAlgorithms.length).toBe(0);
  });

  it('throws a recognizable error on every operation', () => {
    const payload = { a: 1 };
    expect(() => provider.canonicalize(payload, { algorithm: 'noop' })).toThrow(JssNotImplementedError);
    expect(() =>
      provider.sign(payload, { algorithm: 'noop', privateKey: 'does-not-matter' }),
    ).toThrow(JssNotImplementedError);
    expect(() => provider.verify(payload)).toThrow(JssNotImplementedError);
  });
});

describe('SignatureProviderRegistry', () => {
  it('registers providers and looks them up by name', () => {
    const reg = new SignatureProviderRegistry();
    const jsf = new JsfSignatureProvider();
    reg.register(jsf);
    expect(reg.get('jsf')).toBe(jsf);
    expect(reg.has('jsf')).toBe(true);
    expect(reg.list()).toEqual([jsf]);
  });

  it('throws on require() for a missing provider', () => {
    const reg = new SignatureProviderRegistry();
    expect(() => reg.require('missing')).toThrow(/not registered/);
  });

  it('promotes the first registered provider to default', () => {
    const reg = new SignatureProviderRegistry();
    const jsf = new JsfSignatureProvider();
    const jss = new JssSignatureProvider();
    reg.register(jsf);
    reg.register(jss);
    expect(reg.getDefault()).toBe(jsf);
  });

  it('lets callers override the default explicitly', () => {
    const reg = new SignatureProviderRegistry();
    const jsf = new JsfSignatureProvider();
    const jss = new JssSignatureProvider();
    reg.register(jsf);
    reg.register(jss, { asDefault: true });
    expect(reg.getDefault()).toBe(jss);
  });

  it('unregister removes a provider and fixes up the default', () => {
    const reg = new SignatureProviderRegistry();
    const jsf = new JsfSignatureProvider();
    const jss = new JssSignatureProvider();
    reg.register(jsf);
    reg.register(jss);
    reg.unregister('jsf');
    expect(reg.has('jsf')).toBe(false);
    // Removing the default should bump the next-registered provider up.
    expect(reg.getDefault()).toBe(jss);
  });
});

describe('createRegistry / getSignatureProviders', () => {
  it('createRegistry returns both shipped providers with JSF as default', () => {
    const reg = createRegistry();
    expect(reg.has('jsf')).toBe(true);
    expect(reg.has('jss')).toBe(true);
    expect(reg.getDefault().name).toBe('jsf');
  });

  it('getSignatureProviders caches a process-wide instance', () => {
    const a = getSignatureProviders();
    const b = getSignatureProviders();
    expect(a).toBe(b);
    expect(a.has('jsf')).toBe(true);
  });
});
