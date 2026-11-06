import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import pool from './db';
import authRoutes from './routes/auth';
import brandRoutes from './routes/brands';
import workspaceRoutes from './routes/workspaces';
import clusterRoutes from './routes/clusters';
import actionRoutes from './routes/actions';

export const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'disconnected' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/clusters', clusterRoutes);
app.use('/api/actions', actionRoutes);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : 'Internal server error';
  res.status(500).json({ error: message });
});

export default app;
