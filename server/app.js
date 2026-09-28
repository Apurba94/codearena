import path from 'node:path';
import express from 'express';
import { config, ROOT } from './config.js';
import { csrfGuard, loadUser } from './middleware/auth.js';
import adminRoutes from './routes/admin.js';
import archiveRoutes from './routes/archive.js';
import authRoutes from './routes/auth.js';
import contestRoutes from './routes/contests.js';
import metaRoutes from './routes/meta.js';
import problemRoutes from './routes/problems.js';
import submissionRoutes, { runRouter } from './routes/submissions.js';
import userRoutes from './routes/users.js';
import { HttpError } from './util/http.js';

export function createApp({ pool = null } = {}) {
  const app = express();
  app.locals.pool = pool;
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; " +
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });

  // ---- API
  const api = express.Router();
  api.use('/admin', express.json({ limit: '64mb' }));
  api.use(express.json({ limit: '1mb' }));
  api.use(loadUser);
  api.use(csrfGuard);
  api.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use('/auth', authRoutes);
  api.use('/problems', problemRoutes);
  api.use('/submissions', submissionRoutes);
  api.use('/run', runRouter);
  api.use('/contests', contestRoutes);
  api.use('/users', userRoutes);
  api.use('/archive', archiveRoutes);
  api.use('/admin', adminRoutes);
  api.use('/', metaRoutes);
  api.get('/health', (req, res) => res.json({ ok: true, time: Date.now() }));
  api.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/api', api);

  // ---- static assets
  const nm = (p) => path.join(ROOT, 'node_modules', p);
  const staticOpts = { maxAge: config.isProd ? '7d' : 0, index: false };
  app.use('/vendor/katex', express.static(nm('katex/dist'), staticOpts));
  app.use('/vendor/marked', express.static(nm('marked/lib'), staticOpts));
  app.use('/vendor/dompurify', express.static(nm('dompurify/dist'), staticOpts));
  app.use('/vendor/codemirror', express.static(nm('codemirror'), staticOpts));
  app.use(express.static(path.join(ROOT, 'public'), { ...staticOpts, maxAge: config.isProd ? '1h' : 0 }));

  // ---- SPA fallback: client-side routes render index.html
  app.get(/^\/(?!api\/|vendor\/).*/, (req, res, next) => {
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(ROOT, 'public', 'index.html'));
  });

  // ---- errors
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError || err.status) {
      const status = err.status || 500;
      return res.status(status).json({ error: err.message, details: err.details });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
