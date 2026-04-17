/**
 * URL safety primitives.
 *
 * Two defenses live here:
 *
 *   1. `isPrivateOrReservedUrl` runs at config time, when an operator
 *      saves a webhook destination. It rejects the submission if the
 *      URL hostname is a literal private IP, localhost, or a cloud
 *      metadata endpoint.
 *
 *   2. `resolveAndAssertPublic` runs at delivery time, right before the
 *      outbound HTTP request. It resolves the hostname through DNS and
 *      fails the delivery when any resolved address falls inside a
 *      private, loopback, link-local, or reserved range. This closes
 *      the gap where a public hostname that passed config-time review
 *      later starts pointing at an internal address (DNS rebinding, an
 *      attacker-controlled record, or operational DNS drift).
 *
 * There is a small TOCTOU window between the DNS check and the actual
 * socket connect. A future iteration can close it by passing a custom
 * `lookup` function into an undici Agent dispatcher so the connect
 * phase sees the same address we just validated. The one-shot check
 * here is still the correct first layer: it denies the easy case and
 * makes the full rebinding attack strictly harder.
 */

import dns from 'node:dns/promises';
import net from 'node:net';

/** Hostnames that are never legitimate webhook targets. */
const RESERVED_HOSTNAMES: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
]);

/** Hostname suffixes reserved for internal networks. */
const RESERVED_HOST_SUFFIXES: readonly string[] = ['.local', '.internal'];

/** Cloud metadata endpoints (IMDS, GCE metadata, Azure IMDS alias). */
const CLOUD_METADATA_HOSTS: ReadonlySet<string> = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.azure.com',
]);

/**
 * Hostname-only checks that do not require DNS resolution. Used both
 * at config time and as a pre-filter before the DNS step at delivery
 * time.
 */
export function isReservedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (RESERVED_HOSTNAMES.has(h)) return true;
  for (const suffix of RESERVED_HOST_SUFFIXES) {
    if (h.endsWith(suffix)) return true;
  }
  if (CLOUD_METADATA_HOSTS.has(h)) return true;
  return false;
}

/**
 * Test an IPv4 address against the private, loopback, link-local, and
 * reserved ranges. Inputs must be dotted-quad strings.
 */
export function isPrivateIpv4(address: string): boolean {
  const match = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 10) return true;                              // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;       // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                // 192.168.0.0/16
  if (a === 169 && b === 254) return true;                // 169.254.0.0/16
  if (a === 127) return true;                             // 127.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true;      // 100.64.0.0/10 (CGNAT)
  if (a === 0) return true;                               // 0.0.0.0/8
  if (a >= 224) return true;                              // multicast + reserved
  return false;
}

/**
 * Test an IPv6 address against the private, loopback, link-local, and
 * reserved ranges. Inputs must be a string already normalized by the
 * runtime (for example, via `net.isIPv6`).
 */
export function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  // Unique local addresses fc00::/7
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true;
  // Link local fe80::/10
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;
  // IPv4-mapped IPv6 (::ffff:x.y.z.w) — check the embedded v4
  const mapped = normalized.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped && mapped[1] && isPrivateIpv4(mapped[1])) return true;
  return false;
}

/** Any-family predicate used downstream. */
export function isPrivateIpAddress(address: string): boolean {
  if (net.isIPv4(address)) return isPrivateIpv4(address);
  if (net.isIPv6(address)) return isPrivateIpv6(address);
  return false;
}

export interface UrlSafetyOptions {
  /** Require the URL to use HTTPS. Defaults to true. */
  requireHttps?: boolean;
}

/**
 * Config-time URL safety check. Validates the URL format, the scheme,
 * and rejects obvious internal targets without performing DNS. Returns
 * true when the URL is NOT safe (private or reserved), which matches
 * the call sites that use this as a Zod refinement.
 */
export function isPrivateOrReservedUrl(
  urlString: string,
  options: UrlSafetyOptions = {},
): boolean {
  const requireHttps = options.requireHttps ?? true;
  try {
    const parsed = new URL(urlString);

    if (requireHttps && parsed.protocol !== 'https:') {
      return true;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return true;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (isReservedHostname(hostname)) return true;
    if (net.isIP(hostname) && isPrivateIpAddress(hostname)) return true;

    return false;
  } catch {
    return true;
  }
}

export interface DeliveryTimeCheck {
  /** True when the target URL is safe to fetch. */
  safe: boolean;
  /** Populated when safe is false. */
  reason?: string;
}

/**
 * Delivery-time check. Parses the URL, re-runs the hostname screen,
 * then resolves every address behind the hostname and refuses if any
 * falls in a private or reserved range. A single poisoned answer is
 * enough to block the delivery; we do not want to race the runtime
 * over which address the socket eventually connects to.
 */
export async function resolveAndAssertPublic(
  urlString: string,
  options: UrlSafetyOptions = {},
): Promise<DeliveryTimeCheck> {
  const requireHttps = options.requireHttps ?? true;

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: 'Malformed webhook URL' };
  }

  if (requireHttps && parsed.protocol !== 'https:') {
    return { safe: false, reason: 'Webhook URL must use HTTPS' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { safe: false, reason: `Unsupported URL scheme ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isReservedHostname(hostname)) {
    return { safe: false, reason: `Hostname ${hostname} is reserved` };
  }

  // Literal IP in the URL: evaluate directly, skip DNS.
  if (net.isIP(hostname)) {
    if (isPrivateIpAddress(hostname)) {
      return {
        safe: false,
        reason: `Target address ${hostname} is private or reserved`,
      };
    }
    return { safe: true };
  }

  // Resolve both families. A hostname that fails to resolve is treated
  // as unsafe so deliveries error loudly instead of sitting in a
  // network timeout loop.
  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { safe: false, reason: `DNS lookup failed: ${message}` };
  }

  if (addresses.length === 0) {
    return { safe: false, reason: 'Hostname resolved to no addresses' };
  }

  for (const entry of addresses) {
    if (isPrivateIpAddress(entry.address)) {
      return {
        safe: false,
        reason: `Hostname ${hostname} resolved to private address ${entry.address}`,
      };
    }
  }

  return { safe: true };
}
