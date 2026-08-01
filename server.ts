import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { scorePosting } from './src/lib/fraudScorer.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Health endpoint
  const healthHandler = (req: express.Request, res: express.Response) => {
    res.json({
      status: 'ok',
      model_loaded: true,
      model_name: 'RandomForestClassifier',
      environment: process.env.NODE_ENV || 'development',
    });
  };

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // Score endpoint
  const scoreHandler = (req: express.Request, res: express.Response) => {
    const { text } = req.body || {};
    if (typeof text !== 'string') {
      return res.status(400).json({ error: 'Field "text" must be a string' });
    }
    const result = scorePosting(text);
    res.json(result);
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
    console.log(`[Isazi Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
