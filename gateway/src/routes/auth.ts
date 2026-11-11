import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();
const secret = () => process.env.JWT_SECRET || 'development-secret';

router.post('/register', async (req, res, next) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'email, password and name are required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
      [email.toLowerCase(), passwordHash, name],
    );
    const user = userResult.rows[0];
    const workspaceResult = await client.query(
      "INSERT INTO workspaces (name) VALUES ($1) RETURNING id",
      [`${name}'s Workspace`],
    );
    const workspaceId = workspaceResult.rows[0].id;
    await client.query(
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'admin')",
      [workspaceId, user.id],
    );
    await client.query('COMMIT');
    const token = jwt.sign({ userId: user.id, email: user.email, workspaceId, role: 'admin' }, secret(), { expiresIn: '7d' });
    res.status(201).json({ token, user, workspace: { id: workspaceId, name: `${name}'s Workspace` }, role: 'admin' });
  } catch (error) {
    await client.query('ROLLBACK');
    const duplicate = (error as { code?: string }).code === '23505';
    if (duplicate) return res.status(409).json({ error: 'Email already registered' });
    next(error);
  } finally {
    client.release();
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    const result = await pool.query(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()],
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const membership = await pool.query(
      'SELECT workspace_id, role FROM workspace_members WHERE user_id = $1 ORDER BY created_at LIMIT 1',
      [user.id],
    );
    const membershipRow = membership.rows[0];
    const token = jwt.sign(
      { userId: user.id, email: user.email, workspaceId: membershipRow?.workspace_id, role: membershipRow?.role },
      secret(), { expiresIn: '7d' },
    );
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
      workspace: { id: membershipRow?.workspace_id },
      role: membershipRow?.role,
    });
  } catch (error) { next(error); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.name, wm.workspace_id, wm.role, w.name AS workspace_name
       FROM users u
       LEFT JOIN workspace_members wm ON wm.user_id = u.id
       LEFT JOIN workspaces w ON w.id = wm.workspace_id
       WHERE u.id = $1 AND ($2::uuid IS NULL OR wm.workspace_id = $2)
       ORDER BY wm.created_at LIMIT 1`,
      [req.user!.userId, req.user!.workspaceId || null],
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    const row = result.rows[0];
    res.json({
      user: { id: row.id, email: row.email, name: row.name },
      workspace: { id: row.workspace_id, name: row.workspace_name },
      role: row.role,
    });
  } catch (error) { next(error); }
});

export default router;
