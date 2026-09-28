import { config } from '../config.js';
import { db } from '../db.js';
import { forbidden, unauthorized } from '../util/http.js';
import { newToken, sha256 } from '../util/security.js';

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieHeader(value, maxAgeSec) {
  const parts = [`${config.session.cookie}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (config.session.secureCookie) parts.push('Secure');
  return parts.join('; ');
}

export function createSession(res, req, userId) {
  const token = newToken();
  const now = Date.now();
  const ttl = config.session.ttlDays * 86400_000;
  db.run(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
    sha256(token), userId, now, now + ttl, req.ip, String(req.headers['user-agent'] || '').slice(0, 200),
  );
  res.setHeader('Set-Cookie', cookieHeader(token, Math.floor(ttl / 1000)));
}

export function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[config.session.cookie];
  if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  res.setHeader('Set-Cookie', cookieHeader('', 0));
}

/** Attach req.user (or null) from the session cookie. */
export function loadUser(req, res, next) {
  req.user = null;
  const token = parseCookies(req.headers.cookie)[config.session.cookie];
  if (token) {
    const row = db.get(
      `SELECT u.id, u.handle, u.email, u.role, u.rating, u.banned, u.last_seen_at, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
      sha256(token),
    );
    if (row && row.expires_at > Date.now() && !row.banned) {
      req.user = { id: row.id, handle: row.handle, email: row.email, role: row.role, rating: row.rating };
      if (!row.last_seen_at || Date.now() - row.last_seen_at > 5 * 60_000) {
        db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', Date.now(), row.id);
      }
    }
  }
  next();
}

/**
 * CSRF defence: state-changing API calls must carry a custom header, which browsers
 * never attach to cross-site form posts and which triggers CORS preflight (not allowed) for scripts.
 */
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'CodeArena') return next(forbidden('Missing X-Requested-With header'));
  next();
}

export const requireAuth = (req, res, next) => (req.user ? next() : next(unauthorized()));

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) return next(forbidden());
  next();
};
export const requireStaff = requireRole('admin', 'setter');
export const requireAdmin = requireRole('admin');

export const purgeExpiredSessions = () => db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
