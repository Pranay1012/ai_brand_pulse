import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db';

export interface AuthUser {
  userId: string;
  email?: string;
  workspaceId?: string;
  role?: 'admin' | 'responder' | 'viewer';
}

declare global {
  namespace Express {
    interface Request { user?: AuthUser; }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  try {
    const secret = process.env.JWT_SECRET || 'development-secret';
    req.user = jwt.verify(header.slice(7), secret) as AuthUser;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...allowedRoles: Array<'admin' | 'responder' | 'viewer'>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const workspaceId = req.header('x-workspace-id') || req.user.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'workspace_id is required' });

    try {
      const result = await pool.query(
        'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
        [workspaceId, req.user.userId],
      );
      const role = result.rows[0]?.role;
      if (!role) return res.status(403).json({ error: 'Forbidden' });
      if (!allowedRoles.includes(role)) return res.status(403).json({ error: 'Forbidden' });
      req.user.workspaceId = workspaceId;
      req.user.role = role;
      next();
    } catch (error) {
      next(error);
    }
  };
}
