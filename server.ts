import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const ML_API_URL = process.env.ML_API_URL || 'http://127.0.0.1:8000';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

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
    const { text } = req.body || {};
    if (typeof text !== 'string') {
      return res.status(400).json({ error: 'Field "text" must be a string' });
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Qhaphela Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
