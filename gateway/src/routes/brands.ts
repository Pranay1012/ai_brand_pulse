import { Router } from 'express';
import pool from '../db';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', requireRole('viewer', 'responder', 'admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tracked_brands WHERE workspace_id = $1 ORDER BY name', [req.user!.workspaceId],
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  const { name, keywords, competitor_names = [], is_active = true } = req.body;
  if (!name?.trim() || !Array.isArray(keywords) || keywords.length === 0) {
    return res.status(400).json({ error: 'name and at least one keyword are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO tracked_brands (workspace_id, name, keywords, competitor_names, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user!.workspaceId, name.trim(), keywords, competitor_names, is_active],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

router.get('/:id', requireRole('viewer', 'responder', 'admin'), async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM tracked_brands WHERE id = $1 AND workspace_id = $2', [req.params.id, req.user!.workspaceId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Brand not found' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  const { name, keywords, competitor_names, is_active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE tracked_brands SET
       name = COALESCE($1, name), keywords = COALESCE($2, keywords),
       competitor_names = COALESCE($3, competitor_names), is_active = COALESCE($4, is_active)
       WHERE id = $5 AND workspace_id = $6 RETURNING *`,
      [name, keywords, competitor_names, is_active, req.params.id, req.user!.workspaceId],
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Brand not found' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM tracked_brands WHERE id = $1 AND workspace_id = $2 RETURNING id', [req.params.id, req.user!.workspaceId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Brand not found' });
    res.status(204).send();
  } catch (error) { next(error); }
});

export default router;
