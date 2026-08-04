import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const ML_API_URL = process.env.ML_API_URL || 'http://127.0.0.1:8000';

// Mirrors MAX_TEXT_CHARS in qhaphela/app.py. Rejecting oversized input here
// as well means the proxy cannot be used to push work at the model service
// that the service would only reject anyway.
const MAX_TEXT_CHARS = 20_000;

// This proxy is a demo surface on the developer's own machine, so the limit
// only needs to stop runaway loops and casual abuse.
const RATE_LIMIT_REQUESTS = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const requestTimes = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const times = (requestTimes.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  times.push(now);
  requestTimes.set(ip, times);
  return times.length > RATE_LIMIT_REQUESTS;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // `cors()` with no arguments allows EVERY origin. That was a real hole
  // rather than a theoretical one: the model service deliberately restricts
  // CORS, but a browser enforces CORS only on the request it makes directly.
  // Any website the user visited could therefore call this proxy from their
  // browser, and the proxy would forward the request server-side, where CORS
  // does not apply -- using the visitor's own machine to reach a service that
  // had explicitly refused their origin. Matching the model service's policy
  // closes that path.
  const ALLOWED_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  app.use(
    cors({
      origin: (origin, callback) => {
        // No Origin header means a same-origin or non-browser request (curl,
        // the app's own fetch), which is the normal case for this demo.
        if (!origin || ALLOWED_ORIGIN.test(origin)) return callback(null, true);
        return callback(null, false);
      },
    })
  );

  // Bounded so a single request cannot buffer an arbitrary amount into memory.
  app.use(express.json({ limit: '256kb' }));

  app.use((req, res, next) => {
    // This server renders a local demo page; none of it should be framed,
    // sniffed, or leak its address to third parties.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  // Health endpoint -- proxies the Python model service so the reported
  // model_loaded/model_name reflect the real Random Forest, not a guess.
  const healthHandler = async (req: express.Request, res: express.Response) => {
    try {
      const mlRes = await fetch(`${ML_API_URL}/health`);
      const mlData = await mlRes.json();
      res.json({ ...mlData, environment: process.env.NODE_ENV || 'development' });
    } catch {
      res.status(502).json({
        status: 'error',
        model_loaded: false,
        error: `ML service unreachable at ${ML_API_URL}. Start it with: uvicorn app:app --port 8000 (from qhaphela/)`,
      });
    }
  };

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // Score endpoint -- proxies to the FastAPI service serving the trained
  // Random Forest + SHAP explainer (qhaphela/app.py), so both the web UI and
  // the Chrome extension score against the same real model.
  const scoreHandler = async (req: express.Request, res: express.Response) => {
    const ip = req.ip || 'unknown';
    if (rateLimited(ip)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Wait a moment and try again.' });
    }
    const { text } = req.body || {};
    if (typeof text !== 'string') {
      return res.status(400).json({ error: 'Field "text" must be a string' });
    }
    if (text.length > MAX_TEXT_CHARS) {
      return res
        .status(413)
        .json({ error: `Text too long (max ${MAX_TEXT_CHARS} characters)` });
    }
    try {
      const mlRes = await fetch(`${ML_API_URL}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!mlRes.ok) {
        return res.status(502).json({ error: `ML service returned ${mlRes.status}` });
      }
      const result = await mlRes.json();
      res.json(result);
    } catch {
      res.status(502).json({
        error: `ML service unreachable at ${ML_API_URL}. Start it with: uvicorn app:app --port 8000 (from qhaphela/)`,
      });
    }
  };

  app.post('/score', scoreHandler);
  app.post('/api/score', scoreHandler);

  // Development vs Production static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Bound to the loopback interface only. '0.0.0.0' published this to every
  // network the machine is attached to, so anyone sharing a campus or coffee
  // shop network could reach it. It also contradicted the privacy policy,
  // which states the service is not reachable from outside the machine.
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[Qhaphela Server] Running on http://127.0.0.1:${PORT}`);
  });
}

startServer();
