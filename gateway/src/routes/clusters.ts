import { Router } from 'express';
import pool from '../db';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', requireRole('viewer', 'responder', 'admin'), async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const brandId = req.query.brand_id as string | undefined;
    const values: any[] = [req.user!.workspaceId];
    const filters = ['tb.workspace_id = $1'];
    if (brandId) {
      values.push(brandId);
      filters.push(`ic.brand_id = $${values.length}`);
    }
    if (status) {
      values.push(status);
      filters.push(`ic.status = $${values.length}`);
    }
    const result = await pool.query(
      `SELECT ic.*, tb.name AS brand_name,
              CASE WHEN ic.mention_count = 0 THEN 0
                   ELSE ic.negative_count::float / ic.mention_count END AS negative_ratio
       FROM issue_clusters ic
       JOIN tracked_brands tb ON tb.id = ic.brand_id
       WHERE ${filters.join(' AND ')}
       ORDER BY negative_ratio DESC NULLS LAST, ic.last_seen_at DESC`,
      values,
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.get('/:id/mentions', requireRole('viewer', 'responder', 'admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT m.* FROM mentions m
       JOIN issue_clusters ic ON ic.id = m.cluster_id
       JOIN tracked_brands tb ON tb.id = ic.brand_id
       WHERE m.cluster_id = $1 AND tb.workspace_id = $2
       ORDER BY m.published_at DESC NULLS LAST LIMIT 50`,
      [req.params.id, req.user!.workspaceId],
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.get('/stats', requireRole('viewer', 'responder', 'admin'), async (req, res, next) => {
  try {
    const brandId = req.query.brand_id as string | undefined;
    const values: any[] = [req.user!.workspaceId];
    let brandFilter = '';
    if (brandId) {
      values.push(brandId);
      brandFilter = `AND tb.id = $${values.length}`;
    }

    const mentionsRes = await pool.query(
      `SELECT count(*)::int AS total_mentions
       FROM mentions m
       JOIN tracked_brands tb ON tb.id = m.brand_id
       WHERE tb.workspace_id = $1 ${brandFilter}`,
      values,
    );

    const clustersRes = await pool.query(
      `SELECT count(*)::int AS total_clusters,
              COALESCE(SUM(CASE WHEN ic.mention_count > 0 AND (ic.negative_count::float / ic.mention_count) >= 0.6 THEN 1 ELSE 0 END), 0)::int AS critical_clusters,
              COALESCE(AVG(CASE WHEN ic.mention_count = 0 THEN 0 ELSE (ic.negative_count::float / ic.mention_count) END), 0)::float AS avg_negative_ratio
       FROM issue_clusters ic
       JOIN tracked_brands tb ON tb.id = ic.brand_id
       WHERE tb.workspace_id = $1 AND ic.status = 'open' ${brandFilter}`,
      values,
    );

    res.json({
      total_mentions: mentionsRes.rows[0]?.total_mentions || 0,
      total_clusters: clustersRes.rows[0]?.total_clusters || 0,
      critical_clusters: clustersRes.rows[0]?.critical_clusters || 0,
      avg_negative_ratio: clustersRes.rows[0]?.avg_negative_ratio || 0,
    });
  } catch (error) { next(error); }
});

router.get('/:id', requireRole('viewer', 'responder', 'admin'), async (req, res, next) => {
  try {
    const cluster = await pool.query(
      `SELECT ic.*, tb.name AS brand_name
       FROM issue_clusters ic JOIN tracked_brands tb ON tb.id = ic.brand_id
       WHERE ic.id = $1 AND tb.workspace_id = $2`,
      [req.params.id, req.user!.workspaceId],
    );
    if (!cluster.rows[0]) return res.status(404).json({ error: 'Cluster not found' });
    const mentions = await pool.query(
      `SELECT * FROM mentions WHERE cluster_id = $1 ORDER BY published_at DESC NULLS LAST LIMIT 50`,
      [req.params.id],
    );
    const actions = await pool.query(
      'SELECT * FROM actions WHERE cluster_id = $1 ORDER BY created_at DESC', [req.params.id],
    );
    res.json({ ...cluster.rows[0], mentions: mentions.rows, actions: actions.rows });
  } catch (error) { next(error); }
});

router.patch('/:id', requireRole('admin', 'responder'), async (req, res, next) => {
  const status = req.body.status;
  if (!['open', 'resolved', 'archived'].includes(status)) {
    return res.status(400).json({ error: 'status must be open, resolved, or archived' });
  }
  try {
    const result = await pool.query(
      `UPDATE issue_clusters ic SET status = $1
       FROM tracked_brands tb
       WHERE ic.id = $2 AND ic.brand_id = tb.id AND tb.workspace_id = $3
       RETURNING ic.*`,
      [status, req.params.id, req.user!.workspaceId],
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Cluster not found' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

export default router;
