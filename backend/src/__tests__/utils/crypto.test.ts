import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, generateToken, hashToken } from '../../utils/crypto.js';

describe('Crypto Utils', () => {
  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'mySecurePassword123';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should produce different hashes for same password', async () => {
      const password = 'mySecurePassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should not expose plaintext password in hash', async () => {
      const password = 'mySecurePassword123';
      const hash = await hashPassword(password);

      expect(hash).not.toContain(password);
    });

    it('should handle long passwords', async () => {
      const longPassword = 'a'.repeat(256);
      const hash = await hashPassword(longPassword);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });

    it('should handle special characters', async () => {
      const password = '!@#$%^&*()_+-=[]{}|;:",.<>?/~`';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'correctPassword123';
      const hash = await hashPassword(password);

      const result = await verifyPassword(hash, password);
      expect(result).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'correctPassword123';
      const wrongPassword = 'wrongPassword456';
      const hash = await hashPassword(password);

      const result = await verifyPassword(hash, wrongPassword);
      expect(result).toBe(false);
    });

    it('should be case sensitive', async () => {
      const password = 'MyPassword123';
      const hash = await hashPassword(password);

      const result = await verifyPassword(hash, 'mypassword123');
      expect(result).toBe(false);
    });

    it('should reject empty password against hash', async () => {
      const password = 'correctPassword123';
      const hash = await hashPassword(password);

      const result = await verifyPassword(hash, '');
      expect(result).toBe(false);
    });

    it('should handle invalid hash gracefully', async () => {
      const invalidHash = 'not-a-valid-hash';
      const password = 'anyPassword';

      const result = await verifyPassword(invalidHash, password);
      expect(result).toBe(false);
    });

    it('should handle corrupted hash gracefully', async () => {
      const password = 'myPassword123';
      const hash = await hashPassword(password);
      const corruptedHash = hash.slice(0, -10) + 'corrupted!';

      const result = await verifyPassword(corruptedHash, password);
      expect(result).toBe(false);
    });

    it('should verify with special characters in password', async () => {
      const password = '!@#$%^&*()_+-=';
      const hash = await hashPassword(password);

      const result = await verifyPassword(hash, password);
      expect(result).toBe(true);
    });

    it('should reject similar but different passwords', async () => {
      const password = 'Password123';
      const hash = await hashPassword(password);

      expect(await verifyPassword(hash, 'Password124')).toBe(false);
      expect(await verifyPassword(hash, 'password123')).toBe(false);
      expect(await verifyPassword(hash, ' Password123')).toBe(false);
      expect(await verifyPassword(hash, 'Password123 ')).toBe(false);
    });
  });

  describe('generateToken', () => {
    it('should generate a token', () => {
      const token = generateToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate hex string', () => {
      const token = generateToken();

      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate unique tokens', () => {
      const token1 = generateToken();
      const token2 = generateToken();

      expect(token1).not.toBe(token2);
    });

    it('should generate 64 character tokens', () => {
      const token = generateToken();

      expect(token.length).toBe(64); // 32 bytes * 2 (hex)
    });

    it('should generate cryptographically random tokens', () => {
      const tokens = new Set<string>();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        tokens.add(generateToken());
      }

      expect(tokens.size).toBe(iterations);
    });
  });

  describe('hashToken', () => {
    it('should hash a token', () => {
      const token = generateToken();
      const hash = hashToken(token);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should produce consistent hash for same token', () => {
      const token = 'myTestToken123';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different tokens', () => {
      const token1 = generateToken();
      const token2 = generateToken();
      const hash1 = hashToken(token1);
      const hash2 = hashToken(token2);

      expect(hash1).not.toBe(hash2);
    });

    it('should produce SHA256 hex string', () => {
      const token = 'testToken';
      const hash = hashToken(token);

      expect(hash).toMatch(/^[0-9a-f]+$/);
      expect(hash.length).toBe(64); // SHA256 = 32 bytes = 64 hex chars
    });

    it('should not expose plaintext token in hash', () => {
      const token = 'mySecretToken123';
      const hash = hashToken(token);

      expect(hash).not.toContain(token);
    });

    it('should handle generated tokens', () => {
      const token = generateToken();
      const hash = hashToken(token);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });

    it('should be deterministic for same input', () => {
      const token = 'fixedToken';
      const hashes = [];

      for (let i = 0; i < 5; i++) {
        hashes.push(hashToken(token));
      }

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle password hashing and verification workflow', async () => {
      const password = 'userPassword123';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(hash, password);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword(hash, 'wrongPassword');
      expect(isInvalid).toBe(false);
    });

    it('should handle token generation and hashing workflow', () => {
      const token = generateToken();
      const hash = hashToken(token);

      expect(token).not.toBe(hash);
      expect(hashToken(token)).toBe(hash);
    });
  });
});
