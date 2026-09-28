import { Router } from 'express';
import { db } from '../db.js';
import { createSession, destroySession, requireAuth } from '../middleware/auth.js';
import { badRequest, conflict, unauthorized } from '../util/http.js';
import { rateLimit } from '../util/ratelimit.js';
import { hashPassword, verifyPassword } from '../util/security.js';
import { EMAIL_RE, HANDLE_RE, validate } from '../util/validate.js';

const r = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 30, key: (req) => req.ip, message: 'Too many attempts, try again later' });

const RESERVED = new Set(['me', 'rankings', 'admin', 'administrator', 'system', 'root', 'support', 'codearena']);

export const publicMe =(u) => u && ({ id: u.id, handle: u.handle, email: u.email, role: u.role, rating: u.rating });

r.post('/register', authLimiter, (req, res) => {
  const body = validate(req.body, {
    handle: { type: 'string', required: true, pattern: HANDLE_RE, patternMsg: 'must be 3-24 letters, digits, _ . -' },
    email: { type: 'string', required: true, max: 120, pattern: EMAIL_RE, patternMsg: 'is not a valid email' },
    password: { type: 'string', required: true, min: 8, max: 200, trim: false },
  });
  if (RESERVED.has(body.handle.toLowerCase())) throw conflict('That handle is reserved');
  if (db.get('SELECT 1 FROM users WHERE handle = ?', body.handle)) throw conflict('That handle is already taken');
  if (db.get('SELECT 1 FROM users WHERE email = ?', body.email)) throw conflict('That email is already registered');
  const user = db.get(
    `INSERT INTO users (handle, email, password_hash, created_at) VALUES (?, ?, ?, ?) RETURNING id, handle, email, role, rating`,
    body.handle, body.email, hashPassword(body.password), Date.now(),
  );
  createSession(res, req, user.id);
  res.status(201).json({ user: publicMe(user) });
});

r.post('/login', authLimiter, (req, res) => {
  const body = validate(req.body, {
    login: { type: 'string', required: true, max: 120 },
    password: { type: 'string', required: true, max: 200, trim: false },
  });
  const user = db.get('SELECT * FROM users WHERE handle = ? OR email = ?', body.login, body.login);
  if (!user || !verifyPassword(body.password, user.password_hash)) throw unauthorized('Wrong handle/email or password');
  if (user.banned) throw unauthorized('This account is suspended');
  createSession(res, req, user.id);
  res.json({ user: publicMe(user) });
});

r.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

r.get('/me', (req, res) => res.json({ user: publicMe(req.user) }));

r.post('/password', requireAuth, authLimiter, (req, res) => {
  const body = validate(req.body, {
    current: { type: 'string', required: true, trim: false },
    next: { type: 'string', required: true, min: 8, max: 200, trim: false },
  });
  const row = db.get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(body.current, row.password_hash)) throw badRequest('Current password is wrong');
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(body.next), req.user.id);
  // invalidate every other session
  db.run('DELETE FROM sessions WHERE user_id = ?', req.user.id);
  createSession(res, req, req.user.id);
  res.json({ ok: true });
});

export default r;
