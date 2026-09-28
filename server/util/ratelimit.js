import { tooMany } from './http.js';

/**
 * In-memory fixed-window rate limiter keyed by user id or IP.
 * Good for a single node; put a shared store (Redis) behind this interface when scaling out.
 */
export function rateLimit({ windowMs, max, key = (req) => req.user?.id ?? req.ip, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, Math.max(windowMs, 10_000)).unref();

  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(k, entry);
    }
    entry.count++;
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return next(tooMany(message));
    }
    next();
  };
}
