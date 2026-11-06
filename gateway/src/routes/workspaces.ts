import { Router } from 'express';
import pool from '../db';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT w.id, w.name, w.created_at, wm.role
       FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = $1 ORDER BY w.name`, [req.user!.userId],
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const workspace = await client.query('INSERT INTO workspaces (name) VALUES ($1) RETURNING *', [name.trim()]);
    await client.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'admin')", [workspace.rows[0].id, req.user!.userId]);
    await client.query('COMMIT');
    res.status(201).json(workspace.rows[0]);
  } catch (error) { await client.query('ROLLBACK'); next(error); }
  finally { client.release(); }
});

router.get('/:workspaceId', requireRole('viewer', 'responder', 'admin'), async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM workspaces WHERE id = $1', [req.params.workspaceId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Workspace not found' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

export default router;
