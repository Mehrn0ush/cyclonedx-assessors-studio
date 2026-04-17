import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveSecureFlag,
  buildSessionCookieOptions,
  buildClearCookieOptions,
} from '../../utils/cookies.js';
import { resetConfig } from '../../config/index.js';

describe('cookies helper', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear overrides from prior tests so resolveSecureFlag reads a
    // deterministic environment.
    delete process.env.COOKIE_SECURE;
    delete process.env.APP_URL;
    delete process.env.NODE_ENV;
    resetConfig();
  });

  afterEach(() => {
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

  describe('resolveSecureFlag', () => {
    it('returns true when COOKIE_SECURE=true regardless of other signals', () => {
      process.env.COOKIE_SECURE = 'true';
      process.env.NODE_ENV = 'development';
      process.env.APP_URL = 'http://localhost:5173';
      expect(resolveSecureFlag()).toBe(true);
    });

    it('returns false when COOKIE_SECURE=false regardless of other signals', () => {
      process.env.COOKIE_SECURE = 'false';
      process.env.NODE_ENV = 'production';
      process.env.APP_URL = 'https://example.com';
      expect(resolveSecureFlag()).toBe(false);
    });

    it('auto mode returns true when NODE_ENV=production', () => {
      process.env.COOKIE_SECURE = 'auto';
      process.env.NODE_ENV = 'production';
      process.env.APP_URL = 'http://internal.local';
      expect(resolveSecureFlag()).toBe(true);
    });

    it('auto mode returns true when APP_URL is https', () => {
      process.env.COOKIE_SECURE = 'auto';
      process.env.NODE_ENV = 'development';
      process.env.APP_URL = 'https://staging.example.com';
      expect(resolveSecureFlag()).toBe(true);
    });

    it('auto mode returns true when APP_URL is HTTPS in mixed case', () => {
      process.env.COOKIE_SECURE = 'auto';
      process.env.NODE_ENV = 'development';
      process.env.APP_URL = 'HTTPS://STAGING.example.com';
      expect(resolveSecureFlag()).toBe(true);
    });

    it('auto mode returns false for http dev loopback', () => {
      process.env.COOKIE_SECURE = 'auto';
      process.env.NODE_ENV = 'development';
      process.env.APP_URL = 'http://localhost:5173';
      expect(resolveSecureFlag()).toBe(false);
    });

    it('auto mode is the default when COOKIE_SECURE is unset', () => {
      process.env.NODE_ENV = 'production';
      expect(resolveSecureFlag()).toBe(true);
    });
  });

  describe('buildSessionCookieOptions', () => {
    it('includes httpOnly, sameSite strict, path /, and the supplied maxAge', () => {
      process.env.COOKIE_SECURE = 'true';
      const opts = buildSessionCookieOptions(60_000);
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe('strict');
      expect(opts.path).toBe('/');
      expect(opts.maxAge).toBe(60_000);
      expect(opts.secure).toBe(true);
    });
  });

  describe('buildClearCookieOptions', () => {
    it('mirrors the session cookie attributes without maxAge', () => {
      process.env.COOKIE_SECURE = 'true';
      const opts = buildClearCookieOptions();
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe('strict');
      expect(opts.path).toBe('/');
      expect(opts.secure).toBe(true);
      expect((opts as Record<string, unknown>).maxAge).toBeUndefined();
    });
  });
});
