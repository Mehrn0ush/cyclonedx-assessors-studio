import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isReservedHostname,
  isPrivateIpv4,
  isPrivateIpv6,
  isPrivateIpAddress,
  isPrivateOrReservedUrl,
  resolveAndAssertPublic,
} from '../../utils/url-safety.js';

// Mock the dns module for delivery-time tests
vi.mock('node:dns/promises', () => ({
  default: {
    lookup: vi.fn(),
  },
}));

import dns from 'node:dns/promises';

describe('url-safety', () => {
  describe('isReservedHostname', () => {
    it('rejects localhost and loopback literals', () => {
      expect(isReservedHostname('localhost')).toBe(true);
      expect(isReservedHostname('LOCALHOST')).toBe(true);
      expect(isReservedHostname('127.0.0.1')).toBe(true);
      expect(isReservedHostname('::1')).toBe(true);
      expect(isReservedHostname('0.0.0.0')).toBe(true);
    });

    it('rejects internal mDNS and platform suffixes', () => {
      expect(isReservedHostname('svc.local')).toBe(true);
      expect(isReservedHostname('api.internal')).toBe(true);
      expect(isReservedHostname('FOO.INTERNAL')).toBe(true);
    });

    it('rejects cloud metadata endpoints', () => {
      expect(isReservedHostname('169.254.169.254')).toBe(true);
      expect(isReservedHostname('metadata.google.internal')).toBe(true);
      expect(isReservedHostname('metadata.azure.com')).toBe(true);
    });

    it('accepts normal public hostnames', () => {
      expect(isReservedHostname('example.com')).toBe(false);
      expect(isReservedHostname('hooks.slack.com')).toBe(false);
      expect(isReservedHostname('api.github.com')).toBe(false);
    });
  });

  describe('isPrivateIpv4', () => {
    it('detects RFC 1918 ranges', () => {
      expect(isPrivateIpv4('10.0.0.1')).toBe(true);
      expect(isPrivateIpv4('10.255.255.255')).toBe(true);
      expect(isPrivateIpv4('172.16.0.1')).toBe(true);
      expect(isPrivateIpv4('172.31.255.255')).toBe(true);
      expect(isPrivateIpv4('192.168.0.1')).toBe(true);
      expect(isPrivateIpv4('192.168.255.255')).toBe(true);
    });

    it('detects loopback, link-local, CGNAT, unspecified, and multicast ranges', () => {
      expect(isPrivateIpv4('127.0.0.1')).toBe(true);
      expect(isPrivateIpv4('169.254.169.254')).toBe(true);
      expect(isPrivateIpv4('100.64.0.1')).toBe(true);
      expect(isPrivateIpv4('100.127.255.255')).toBe(true);
      expect(isPrivateIpv4('0.0.0.0')).toBe(true);
      expect(isPrivateIpv4('224.0.0.1')).toBe(true);
      expect(isPrivateIpv4('255.255.255.255')).toBe(true);
    });

    it('accepts public IPv4 addresses', () => {
      expect(isPrivateIpv4('8.8.8.8')).toBe(false);
      expect(isPrivateIpv4('1.1.1.1')).toBe(false);
      expect(isPrivateIpv4('172.15.0.1')).toBe(false); // just outside 172.16.0.0/12
      expect(isPrivateIpv4('172.32.0.1')).toBe(false); // just outside 172.16.0.0/12
      expect(isPrivateIpv4('192.169.0.1')).toBe(false); // just outside 192.168.0.0/16
      expect(isPrivateIpv4('100.63.255.255')).toBe(false); // just outside CGNAT
      expect(isPrivateIpv4('100.128.0.1')).toBe(false); // just outside CGNAT
    });

    it('returns false for strings that are not dotted-quad IPv4', () => {
      expect(isPrivateIpv4('not-an-ip')).toBe(false);
      expect(isPrivateIpv4('::1')).toBe(false);
      expect(isPrivateIpv4('example.com')).toBe(false);
    });
  });

  describe('isPrivateIpv6', () => {
    it('detects loopback and unspecified', () => {
      expect(isPrivateIpv6('::1')).toBe(true);
      expect(isPrivateIpv6('::')).toBe(true);
    });

    it('detects unique local addresses fc00::/7', () => {
      expect(isPrivateIpv6('fc00::1')).toBe(true);
      expect(isPrivateIpv6('fd12:3456:789a::1')).toBe(true);
    });

    it('detects link-local fe80::/10', () => {
      expect(isPrivateIpv6('fe80::1')).toBe(true);
      expect(isPrivateIpv6('fea0::1')).toBe(true);
      expect(isPrivateIpv6('feb0::1')).toBe(true);
    });

    it('detects IPv4-mapped IPv6 targeting a private IPv4', () => {
      expect(isPrivateIpv6('::ffff:10.0.0.1')).toBe(true);
      expect(isPrivateIpv6('::ffff:192.168.1.1')).toBe(true);
      expect(isPrivateIpv6('::ffff:127.0.0.1')).toBe(true);
    });

    it('accepts public IPv6 addresses', () => {
      expect(isPrivateIpv6('2001:4860:4860::8888')).toBe(false); // Google DNS
      expect(isPrivateIpv6('2606:4700:4700::1111')).toBe(false); // Cloudflare
    });
  });

  describe('isPrivateIpAddress', () => {
    it('dispatches to IPv4 and IPv6 checks correctly', () => {
      expect(isPrivateIpAddress('10.0.0.1')).toBe(true);
      expect(isPrivateIpAddress('fc00::1')).toBe(true);
      expect(isPrivateIpAddress('8.8.8.8')).toBe(false);
      expect(isPrivateIpAddress('2001:4860:4860::8888')).toBe(false);
    });

    it('returns false for non-IP strings', () => {
      expect(isPrivateIpAddress('example.com')).toBe(false);
      expect(isPrivateIpAddress('')).toBe(false);
    });
  });

  describe('isPrivateOrReservedUrl', () => {
    it('rejects non-HTTPS by default', () => {
      expect(isPrivateOrReservedUrl('http://example.com')).toBe(true);
    });

    it('accepts plain HTTP when requireHttps is false', () => {
      expect(isPrivateOrReservedUrl('http://example.com', { requireHttps: false })).toBe(false);
    });

    it('rejects non-http(s) schemes even when requireHttps is false', () => {
      expect(isPrivateOrReservedUrl('ftp://example.com', { requireHttps: false })).toBe(true);
      expect(isPrivateOrReservedUrl('file:///etc/passwd', { requireHttps: false })).toBe(true);
      expect(isPrivateOrReservedUrl('javascript:alert(1)', { requireHttps: false })).toBe(true);
    });

    it('rejects literal private IPv4 addresses in the URL', () => {
      expect(isPrivateOrReservedUrl('https://10.0.0.1/hook')).toBe(true);
      expect(isPrivateOrReservedUrl('https://192.168.1.1/hook')).toBe(true);
      expect(isPrivateOrReservedUrl('https://127.0.0.1/hook')).toBe(true);
      expect(isPrivateOrReservedUrl('https://169.254.169.254/latest/meta-data')).toBe(true);
    });

    it('rejects reserved hostnames', () => {
      expect(isPrivateOrReservedUrl('https://localhost/hook')).toBe(true);
      expect(isPrivateOrReservedUrl('https://svc.local/hook')).toBe(true);
      expect(isPrivateOrReservedUrl('https://api.internal/hook')).toBe(true);
      expect(isPrivateOrReservedUrl('https://metadata.google.internal/')).toBe(true);
    });

    it('rejects malformed URLs', () => {
      expect(isPrivateOrReservedUrl('not-a-url')).toBe(true);
      expect(isPrivateOrReservedUrl('')).toBe(true);
    });

    it('accepts safe public HTTPS URLs', () => {
      expect(isPrivateOrReservedUrl('https://example.com/hook')).toBe(false);
      expect(isPrivateOrReservedUrl('https://hooks.slack.com/services/abc/def/ghi')).toBe(false);
      expect(isPrivateOrReservedUrl('https://api.github.com/repos/x/y')).toBe(false);
    });
  });

  describe('resolveAndAssertPublic', () => {
    const lookupMock = dns.lookup as unknown as ReturnType<typeof vi.fn>;

    beforeEach(() => {
      lookupMock.mockReset();
    });

    afterEach(() => {
      lookupMock.mockReset();
    });

    it('rejects non-HTTPS URLs by default', async () => {
      const result = await resolveAndAssertPublic('http://example.com');
      expect(result.safe).toBe(false);
      expect(result.reason).toMatch(/HTTPS/i);
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it('rejects unsupported schemes even when requireHttps is false', async () => {
      const result = await resolveAndAssertPublic('ftp://example.com', { requireHttps: false });
      expect(result.safe).toBe(false);
      expect(result.reason).toMatch(/scheme/i);
    });

    it('rejects malformed URLs without performing DNS', async () => {
      const result = await resolveAndAssertPublic('not-a-url');
      expect(result.safe).toBe(false);
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it('rejects reserved hostnames before DNS', async () => {
      const result = await resolveAndAssertPublic('https://localhost/hook');
      expect(result.safe).toBe(false);
      expect(result.reason).toMatch(/reserved/);
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it('rejects literal private IPv4 in URL without DNS', async () => {
      const result = await resolveAndAssertPublic('https://10.0.0.1/hook');
      expect(result.safe).toBe(false);
      expect(result.reason).toMatch(/private|reserved/);
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it('accepts literal public IPv4 in URL without DNS', async () => {
      const result = await resolveAndAssertPublic('https://8.8.8.8/hook');
      expect(result.safe).toBe(true);
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it('blocks delivery when DNS returns any private address', async () => {
      lookupMock.mockResolvedValueOnce([
        { address: '10.0.0.5', family: 4 },
      ]);
      const result = await resolveAndAssertPublic('https://evil.example.com/hook');
      expect(result.safe).toBe(false);
      expect(result.reason).toMatch(/10\.0\.0\.5/);
    });

    it('blocks delivery when any resolved address is private (even if others are public)', async () => {
      lookupMock.mockResolvedValueOnce([
        { address: '8.8.8.8', family: 4 },
        { address: '192.168.1.1', family: 4 },
      ]);
      const result = await resolveAndAssertPublic('https://multihomed.example.com/hook');
      expect(result.safe).toBe(false);
      expect(result.reason).toMatch(/192\.168\.1\.1/);
    });

    it('allows delivery when all resolved addresses are public', async () => {
      lookupMock.mockResolvedValueOnce([
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      ]);
      const result = await resolveAndAssertPublic('https://example.com/hook');
      expect(result.safe).toBe(true);
    });

    it('rejects when DNS returns no addresses', async () => {
      lookupMock.mockResolvedValueOnce([]);
      const result = await resolveAndAssertPublic('https://empty.example.com/hook');
      expect(result.safe).toBe(false);
      expect(result.reason).toMatch(/no addresses/i);
    });

    it('rejects when DNS lookup itself fails', async () => {
      lookupMock.mockRejectedValueOnce(new Error('ENOTFOUND'));
      const result = await resolveAndAssertPublic('https://nx.example.com/hook');
      expect(result.safe).toBe(false);
      expect(result.reason).toMatch(/DNS lookup failed/);
    });

    it('blocks IMDS address at DNS-resolution layer even for a novel hostname', async () => {
      lookupMock.mockResolvedValueOnce([
        { address: '169.254.169.254', family: 4 },
      ]);
      const result = await resolveAndAssertPublic('https://rebind.example.com/steal');
      expect(result.safe).toBe(false);
      expect(result.reason).toMatch(/169\.254\.169\.254/);
    });

    it('blocks IPv6 unique-local and link-local addresses', async () => {
      lookupMock.mockResolvedValueOnce([
        { address: 'fc00::1', family: 6 },
      ]);
      const first = await resolveAndAssertPublic('https://ula.example.com/hook');
      expect(first.safe).toBe(false);

      lookupMock.mockResolvedValueOnce([
        { address: 'fe80::1', family: 6 },
      ]);
      const second = await resolveAndAssertPublic('https://ll.example.com/hook');
      expect(second.safe).toBe(false);
    });
  });
});
