import { Router } from 'express';
import pool from '../db';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', requireRole('viewer', 'responder', 'admin'), async (req, res, next) => {
  try {
    const values: any[] = [req.user!.workspaceId];
    const filters = ['tb.workspace_id = $1'];
    if (req.query.status) { values.push(req.query.status); filters.push(`a.status = $${values.length}`); }
    if (req.query.brand_id) { values.push(req.query.brand_id); filters.push(`a.brand_id = $${values.length}`); }
    const result = await pool.query(
      `SELECT a.*, ic.title AS cluster_title, tb.name AS brand_name
       FROM actions a JOIN issue_clusters ic ON ic.id = a.cluster_id
       JOIN tracked_brands tb ON tb.id = a.brand_id
       WHERE ${filters.join(' AND ')} ORDER BY a.created_at DESC`, values,
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.get('/:id', requireRole('viewer', 'responder', 'admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT a.*, ic.title AS cluster_title, ic.mention_count, ic.negative_count, ic.avg_sentiment
       FROM actions a JOIN issue_clusters ic ON ic.id = a.cluster_id
       JOIN tracked_brands tb ON tb.id = a.brand_id
       WHERE a.id = $1 AND tb.workspace_id = $2`, [req.params.id, req.user!.workspaceId],
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Action not found' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

router.post('/:id/approve', requireRole('responder', 'admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE actions a SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(),
             payload = COALESCE($2::jsonb, a.payload)
       FROM issue_clusters ic JOIN tracked_brands tb ON tb.id = ic.brand_id
       WHERE a.id = $3 AND a.cluster_id = ic.id AND tb.workspace_id = $4 AND a.status = 'pending'
       RETURNING a.*`,
      [req.user!.userId, req.body?.payload ? JSON.stringify(req.body.payload) : null,
       req.params.id, req.user!.workspaceId],
    );
    if (!result.rows[0]) return res.status(409).json({ error: 'Action is not pending or does not belong to this workspace' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

router.post('/:id/reject', requireRole('responder', 'admin'), async (req, res, next) => {
  const reason = req.body.reason;
  if (!reason?.trim()) return res.status(400).json({ error: 'reason is required' });
  try {
    const result = await pool.query(
      `UPDATE actions a SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), reject_reason = $2
       FROM issue_clusters ic JOIN tracked_brands tb ON tb.id = ic.brand_id
       WHERE a.id = $3 AND a.cluster_id = ic.id AND tb.workspace_id = $4 AND a.status = 'pending'
       RETURNING a.*`,
      [req.user!.userId, reason.trim(), req.params.id, req.user!.workspaceId],
    );
    if (!result.rows[0]) return res.status(409).json({ error: 'Action is not pending or does not belong to this workspace' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

router.post('/:id/execute', requireRole('responder', 'admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE actions a SET status = 'executed', reviewed_by = $1, reviewed_at = NOW()
       FROM issue_clusters ic JOIN tracked_brands tb ON tb.id = ic.brand_id
       WHERE a.id = $2 AND a.cluster_id = ic.id AND tb.workspace_id = $3 AND a.status = 'approved'
       RETURNING a.*`,
      [req.user!.userId, req.params.id, req.user!.workspaceId],
    );
    if (!result.rows[0]) return res.status(409).json({ error: 'Action is not approved or does not belong to this workspace' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

export default router;
