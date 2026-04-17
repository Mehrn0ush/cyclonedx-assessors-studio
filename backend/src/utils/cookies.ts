/**
 * Cookie hardening helpers.
 *
 * The session cookie needs the Secure flag set whenever the user
 * agent reaches the server over HTTPS, not only when NODE_ENV is
 * 'production'. A stricter policy would mark Secure always and break
 * local development over plain HTTP; a looser policy would silently
 * drop Secure on a staging deployment that happens to set
 * NODE_ENV=staging. The approach here is:
 *
 *   1. An explicit COOKIE_SECURE=true or COOKIE_SECURE=false takes
 *      precedence. Operators behind a TLS terminator that does not
 *      advertise https to the Node process can force the flag on.
 *   2. Otherwise, COOKIE_SECURE=auto infers from APP_URL (the public
 *      URL of the service, used elsewhere for outgoing notifications)
 *      and from NODE_ENV.
 *
 * The helper returns a cookie options object compatible with Express's
 * `res.cookie(name, value, options)` signature.
 */

import type { CookieOptions } from 'express';
import { getConfig } from '../config/index.js';

export interface SessionCookieOptions extends CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'strict';
  path: '/';
}

/**
 * Decide the Secure flag value from the current configuration. Exposed
 * for unit testing and for other cookie emitters that want the same
 * rule.
 */
export function resolveSecureFlag(): boolean {
  const config = getConfig();

  switch (config.COOKIE_SECURE) {
    case 'true':
      return true;
    case 'false':
      return false;
    case 'auto':
    default: {
      if (config.NODE_ENV === 'production') return true;

      const appUrl = config.APP_URL.trim().toLowerCase();
      if (appUrl.startsWith('https://')) return true;

      return false;
    }
  }
}

/**
 * Build the standard set of cookie options used by the auth session
 * cookie. Callers supply `maxAge` explicitly because logout and
 * password-change flows clear the cookie instead of setting it.
 */
export function buildSessionCookieOptions(maxAge: number): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: resolveSecureFlag(),
    sameSite: 'strict',
    path: '/',
    maxAge,
  };
}

/**
 * Options used by `res.clearCookie` so the Secure/SameSite attributes
 * on the cleared cookie match the attributes set when the cookie was
 * originally issued. Browsers reject a clear-cookie instruction that
 * does not match the original attribute set; sites sometimes hit this
 * in practice when the clear path forgets to match.
 */
export function buildClearCookieOptions(): Omit<SessionCookieOptions, 'maxAge'> {
  return {
    httpOnly: true,
    secure: resolveSecureFlag(),
    sameSite: 'strict',
    path: '/',
  };
}
