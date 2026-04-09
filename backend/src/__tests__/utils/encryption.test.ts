/**
 * Unit and integration tests for the encryption at rest service.
 *
 * Covers envelope encoding/decoding, encrypt/decrypt round trips,
 * passthrough mode, tamper detection, key rotation, and migration
 * from plaintext to encrypted values.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import {
  encryptionService,
  isEncryptedEnvelope,
  parseEnvelope,
  FORMAT_VERSION,
  _resetForTesting,
  _setKeyVersionForTesting,
  initializeEncryption,
  rotateKeyVersion,
} from '../../utils/encryption.js';
import {
  setupTestDb,
  teardownTestDb,
  getTestDatabase,
  createTestUser,
} from '../helpers/setup.js';
import { v4 as uuidv4 } from 'uuid';

// A deterministic test master key (64 hex chars = 256-bit)
const TEST_MASTER_KEY = 'a'.repeat(64);
const WRONG_MASTER_KEY = 'b'.repeat(64);

describe('Encryption Service', () => {
  describe('Passthrough Mode (no master key)', () => {
    beforeEach(() => {
      delete process.env.MASTER_ENCRYPTION_KEY;
      _resetForTesting();
    });

    it('encrypt returns plaintext unchanged when no master key is set', () => {
      const plaintext = 'whsec_mysecretvalue';
      const result = encryptionService.encrypt(plaintext);
      expect(result).toBe(plaintext);
    });

    it('decrypt returns input unchanged when no master key is set', () => {
      const input = 'whsec_mysecretvalue';
      const result = encryptionService.decrypt(input);
      expect(result).toBe(input);
    });

    it('isAvailable returns false when no master key is set', () => {
      expect(encryptionService.isAvailable()).toBe(false);
    });
  });

  describe('Encryption with Master Key', () => {
    beforeEach(() => {
      process.env.MASTER_ENCRYPTION_KEY = TEST_MASTER_KEY;
      _resetForTesting();
      // Set up a key version for testing
      const salt = crypto.randomBytes(16);
      _setKeyVersionForTesting(1, salt, true);
    });

    afterEach(() => {
      delete process.env.MASTER_ENCRYPTION_KEY;
      _resetForTesting();
    });

    it('encrypts and decrypts a known plaintext correctly', () => {
      const plaintext = 'whsec_abcdef1234567890';
      const envelope = encryptionService.encrypt(plaintext);

      // Envelope should be base64 and start with correct format/version
      expect(envelope).not.toBe(plaintext);
      expect(isEncryptedEnvelope(envelope)).toBe(true);

      const parsed = parseEnvelope(envelope);
      expect(parsed).not.toBeNull();
      expect(parsed!.formatVersion).toBe(FORMAT_VERSION);
      expect(parsed!.keyVersion).toBe(1);

      // Decrypt should restore original plaintext
      const decrypted = encryptionService.decrypt(envelope);
      expect(decrypted).toBe(plaintext);
    });

    it('encrypting the same plaintext twice produces different ciphertext', () => {
      const plaintext = 'whsec_same_secret';
      const envelope1 = encryptionService.encrypt(plaintext);
      const envelope2 = encryptionService.encrypt(plaintext);

      expect(envelope1).not.toBe(envelope2);

      // Both should decrypt to the same value
      expect(encryptionService.decrypt(envelope1)).toBe(plaintext);
      expect(encryptionService.decrypt(envelope2)).toBe(plaintext);
    });

    it('decrypting with the wrong master key throws an error', () => {
      const plaintext = 'whsec_secret_for_wrong_key_test';
      const envelope = encryptionService.encrypt(plaintext);

      // Switch to wrong key
      process.env.MASTER_ENCRYPTION_KEY = WRONG_MASTER_KEY;

      expect(() => encryptionService.decrypt(envelope)).toThrow(/Decryption failed/);
    });

    it('tampered ciphertext throws an authentication error', () => {
      const plaintext = 'whsec_tamper_test';
      const envelope = encryptionService.encrypt(plaintext);

      // Decode, tamper with a byte in the ciphertext area, re-encode
      const buf = Buffer.from(envelope, 'base64');
      // Flip the last byte (which is in the ciphertext region)
      buf[buf.length - 1] ^= 0xff;
      const tampered = buf.toString('base64');

      expect(() => encryptionService.decrypt(tampered)).toThrow(/Decryption failed/);
    });

    it('tampered auth tag throws an authentication error', () => {
      const plaintext = 'whsec_tag_tamper_test';
      const envelope = encryptionService.encrypt(plaintext);

      const buf = Buffer.from(envelope, 'base64');
      // The data auth tag starts at offset 2 + 16 + 12 + 16 + 32 + 12 = 90
      // Flip a byte in the auth tag region
      buf[90] ^= 0xff;
      const tampered = buf.toString('base64');

      expect(() => encryptionService.decrypt(tampered)).toThrow(/Decryption failed/);
    });

    it('decrypt gracefully handles plaintext input during migration', () => {
      const plaintext = 'whsec_not_encrypted_yet';
      // This is a plain string, not a valid envelope
      const result = encryptionService.decrypt(plaintext);
      expect(result).toBe(plaintext);
    });

    it('isAvailable returns true when master key and key version are set', () => {
      expect(encryptionService.isAvailable()).toBe(true);
    });

    it('handles empty string encryption', () => {
      const envelope = encryptionService.encrypt('');
      expect(isEncryptedEnvelope(envelope)).toBe(true);
      expect(encryptionService.decrypt(envelope)).toBe('');
    });

    it('handles unicode string encryption', () => {
      const plaintext = 'secret with unicode: \u00e9\u00e0\u00fc\u00f1 \ud83d\udd12';
      const envelope = encryptionService.encrypt(plaintext);
      expect(encryptionService.decrypt(envelope)).toBe(plaintext);
    });

    it('handles long string encryption', () => {
      const plaintext = 'x'.repeat(10000);
      const envelope = encryptionService.encrypt(plaintext);
      expect(encryptionService.decrypt(envelope)).toBe(plaintext);
    });
  });

  describe('isEncryptedEnvelope', () => {
    beforeEach(() => {
      process.env.MASTER_ENCRYPTION_KEY = TEST_MASTER_KEY;
      _resetForTesting();
      _setKeyVersionForTesting(1, crypto.randomBytes(16), true);
    });

    afterEach(() => {
      delete process.env.MASTER_ENCRYPTION_KEY;
      _resetForTesting();
    });

    it('returns true for a valid encrypted envelope', () => {
      const envelope = encryptionService.encrypt('test');
      expect(isEncryptedEnvelope(envelope)).toBe(true);
    });

    it('returns false for plaintext', () => {
      expect(isEncryptedEnvelope('whsec_plaintext')).toBe(false);
    });

    it('returns false for random base64 that is too short', () => {
      expect(isEncryptedEnvelope(Buffer.from('short').toString('base64'))).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isEncryptedEnvelope('')).toBe(false);
    });
  });
});

describe('Encryption with Database Integration', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
    delete process.env.MASTER_ENCRYPTION_KEY;
    _resetForTesting();
  });

  it('initializes encryption and creates key version 1', async () => {
    process.env.MASTER_ENCRYPTION_KEY = TEST_MASTER_KEY;
    _resetForTesting();

    const db = getTestDatabase();
    await initializeEncryption(db);

    expect(encryptionService.isAvailable()).toBe(true);
    expect(encryptionService.getActiveKeyVersion()).toBe(1);

    // Verify key version exists in the database
    const versions = await db
      .selectFrom('encryption_key_version')
      .selectAll()
      .execute();

    expect(versions.length).toBe(1);
    expect(versions[0].version).toBe(1);
    expect(versions[0].is_active).toBe(true);
  });

  it('key rotation creates a new version and retires the old one', async () => {
    process.env.MASTER_ENCRYPTION_KEY = TEST_MASTER_KEY;
    const db = getTestDatabase();

    // Encrypt something with version 1
    const plaintext = 'whsec_rotation_test';
    const envelope1 = encryptionService.encrypt(plaintext);
    expect(encryptionService.decrypt(envelope1)).toBe(plaintext);

    // Rotate
    const newVersion = await rotateKeyVersion(db);
    expect(newVersion).toBe(2);
    expect(encryptionService.getActiveKeyVersion()).toBe(2);

    // Old envelope should still be decryptable (backward compatibility)
    expect(encryptionService.decrypt(envelope1)).toBe(plaintext);

    // New encryptions use the new version
    const envelope2 = encryptionService.encrypt(plaintext);
    const parsed = parseEnvelope(envelope2);
    expect(parsed!.keyVersion).toBe(2);

    // Verify database state
    const versions = await db
      .selectFrom('encryption_key_version')
      .selectAll()
      .orderBy('version', 'asc')
      .execute();

    expect(versions.length).toBe(2);
    expect(versions[0].is_active).toBe(false); // version 1 retired
    expect(versions[0].retired_at).not.toBeNull();
    expect(versions[1].is_active).toBe(true);  // version 2 active
  });

  it('rekey re-wraps envelopes under the current active key version', async () => {
    process.env.MASTER_ENCRYPTION_KEY = TEST_MASTER_KEY;
    const db = getTestDatabase();

    // Create a webhook with an encrypted secret
    const user = await createTestUser({ role: 'admin' });
    const webhookId = uuidv4();
    const plainSecret = 'whsec_rekey_test_secret';
    const encryptedSecret = encryptionService.encrypt(plainSecret);

    await db.insertInto('webhook').values({
      id: webhookId,
      name: 'Rekey Test Webhook',
      url: 'https://example.com/hook',
      secret: encryptedSecret,
      event_types: ['*'] as any,
      is_active: true,
      consecutive_failures: 0,
      created_by: user.id,
    }).execute();

    // Note the current key version in the envelope
    const _parsedBefore = parseEnvelope(encryptedSecret);

    // Rotate to a new key version
    const newVersion = await rotateKeyVersion(db);

    // Rekey all webhooks
    const result = await encryptionService.rekey(
      async function* () {
        const webhooks = await db
          .selectFrom('webhook')
          .select(['id', 'secret'])
          .where('id', '=', webhookId)
          .execute();
        for (const wh of webhooks) {
          yield { id: wh.id, value: wh.secret };
        }
      },
      async (id, value) => {
        await db
          .updateTable('webhook')
          .set({ secret: value })
          .where('id', '=', id)
          .execute();
      },
    );

    expect(result.processed).toBe(1);
    expect(result.rekeyed).toBe(1);

    // Verify the webhook secret is now under the new key version
    const updated = await db
      .selectFrom('webhook')
      .select('secret')
      .where('id', '=', webhookId)
      .executeTakeFirst();

    const parsedAfter = parseEnvelope(updated!.secret);
    expect(parsedAfter!.keyVersion).toBe(newVersion);

    // And it still decrypts to the original value
    expect(encryptionService.decrypt(updated!.secret)).toBe(plainSecret);

    // Clean up
    await db.deleteFrom('webhook').where('id', '=', webhookId).execute();
  });

  it('webhook secrets in the database are encrypted, not plaintext', async () => {
    process.env.MASTER_ENCRYPTION_KEY = TEST_MASTER_KEY;
    const db = getTestDatabase();

    const user = await createTestUser({ role: 'admin' });
    const webhookId = uuidv4();
    const plainSecret = 'whsec_integration_test_secret';
    const encrypted = encryptionService.encrypt(plainSecret);

    await db.insertInto('webhook').values({
      id: webhookId,
      name: 'Integration Test Webhook',
      url: 'https://example.com/hook',
      secret: encrypted,
      event_types: ['*'] as any,
      is_active: true,
      consecutive_failures: 0,
      created_by: user.id,
    }).execute();

    // Read the raw value from the database
    const row = await db
      .selectFrom('webhook')
      .select('secret')
      .where('id', '=', webhookId)
      .executeTakeFirst();

    // The stored value should be an encrypted envelope, not the plaintext
    expect(row!.secret).not.toBe(plainSecret);
    expect(isEncryptedEnvelope(row!.secret)).toBe(true);

    // Decrypting should give back the original
    expect(encryptionService.decrypt(row!.secret)).toBe(plainSecret);

    // Clean up
    await db.deleteFrom('webhook').where('id', '=', webhookId).execute();
  });
});

describe('Performance', () => {
  beforeAll(() => {
    process.env.MASTER_ENCRYPTION_KEY = TEST_MASTER_KEY;
    _resetForTesting();
    _setKeyVersionForTesting(1, crypto.randomBytes(16), true);
  });

  afterAll(() => {
    delete process.env.MASTER_ENCRYPTION_KEY;
    _resetForTesting();
  });

  it('encrypt/decrypt completes in under 1ms per operation for typical secret sizes', () => {
    const secrets = [
      crypto.randomBytes(32).toString('hex'),  // 64 chars
      crypto.randomBytes(64).toString('hex'),  // 128 chars
      crypto.randomBytes(16).toString('hex'),  // 32 chars
    ];

    const iterations = 1000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      const secret = secrets[i % secrets.length];
      const envelope = encryptionService.encrypt(secret);
      encryptionService.decrypt(envelope);
    }

    const elapsed = performance.now() - start;
    const perOp = elapsed / (iterations * 2); // 2 ops per iteration (encrypt + decrypt)

    // Should be well under 1ms per operation
    expect(perOp).toBeLessThan(1);
  });
});
