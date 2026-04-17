import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateStartupConfig, resetConfig } from '../../config/index.js';

/**
 * These tests exercise the startup config guard directly. They do not
 * launch the Express app because the guard is meant to catch unsafe
 * configurations before any route is mounted.
 */
describe('validateStartupConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    // Restore the full environment so a single test does not leak
    // variables into unrelated test files.
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
    resetConfig();
  });

  it('passes when METRICS_ENABLED is false, regardless of token', () => {
    process.env.NODE_ENV = 'production';
    process.env.METRICS_ENABLED = 'false';
    process.env.METRICS_TOKEN = '';
    expect(() => validateStartupConfig()).not.toThrow();
  });

  it('throws when METRICS_ENABLED=true in production and token is empty', () => {
    process.env.NODE_ENV = 'production';
    process.env.METRICS_ENABLED = 'true';
    process.env.METRICS_TOKEN = '';
    process.env.JWT_SECRET = 'x'.repeat(32);
    expect(() => validateStartupConfig()).toThrow(/METRICS_TOKEN/);
  });

  it('throws when METRICS_ENABLED=true in production and token is too short', () => {
    process.env.NODE_ENV = 'production';
    process.env.METRICS_ENABLED = 'true';
    process.env.METRICS_TOKEN = 'short';
    process.env.JWT_SECRET = 'x'.repeat(32);
    expect(() => validateStartupConfig()).toThrow(/16 characters/);
  });

  it('passes when METRICS_ENABLED=true in production and token is long enough', () => {
    process.env.NODE_ENV = 'production';
    process.env.METRICS_ENABLED = 'true';
    process.env.METRICS_TOKEN = 'a-sufficiently-long-metrics-bearer-token';
    process.env.JWT_SECRET = 'x'.repeat(32);
    expect(() => validateStartupConfig()).not.toThrow();
  });

  it('passes in test env even when token is empty', () => {
    process.env.NODE_ENV = 'test';
    process.env.METRICS_ENABLED = 'true';
    process.env.METRICS_TOKEN = '';
    expect(() => validateStartupConfig()).not.toThrow();
  });

  it('throws in development env when token is empty', () => {
    process.env.NODE_ENV = 'development';
    process.env.METRICS_ENABLED = 'true';
    process.env.METRICS_TOKEN = '';
    expect(() => validateStartupConfig()).toThrow(/METRICS_TOKEN/);
  });
});
