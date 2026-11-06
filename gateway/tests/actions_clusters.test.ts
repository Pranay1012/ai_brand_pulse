import request from 'supertest';
import jwt from 'jsonwebtoken';

const query = jest.fn();
const connect = jest.fn();
jest.mock('../src/db', () => ({
  __esModule: true,
  default: { query, connect },
  pool: { query, connect },
}));

import app from '../src/app';

process.env.JWT_SECRET = 'phase8-secret';
const secret = 'phase8-secret';
const token = (role: 'admin' | 'responder' | 'viewer') => jwt.sign({
  userId: 'user-1', email: `${role}@example.com`, workspaceId: 'workspace-1', role,
}, secret);
const auth = (role: 'admin' | 'responder' | 'viewer') => ({ Authorization: 'Bearer ' + token(role) });
const result = (rows: any[] = []) => ({ rows, rowCount: rows.length });

beforeEach(() => jest.clearAllMocks());

describe('Phase 8 clusters and action triage', () => {
  test('lists clusters with workspace and optional filters', async () => {
    query.mockResolvedValueOnce(result([{ role: 'viewer' }]));
    query.mockResolvedValueOnce(result([{ id: 'cluster-1', title: '504 errors', negative_ratio: 0.8 }]));
    const response = await request(app).get('/api/clusters?status=open&brand_id=brand-1').set(auth('viewer'));
    expect(response.status).toBe(200);
    expect(response.body[0].id).toBe('cluster-1');
    expect(query.mock.calls[1][0]).toContain('ic.status = $3');
  });

  test('gets cluster details with recent mentions and actions', async () => {
    query.mockResolvedValueOnce(result([{ role: 'viewer' }]));
    query.mockResolvedValueOnce(result([{ id: 'cluster-1', title: '504 errors' }]));
    query.mockResolvedValueOnce(result([{ id: 'mention-1', content: 'Deploy failed' }]));
    query.mockResolvedValueOnce(result([{ id: 'action-1', status: 'pending' }]));
    const response = await request(app).get('/api/clusters/cluster-1').set(auth('viewer'));
    expect(response.status).toBe(200);
    expect(response.body.mentions).toHaveLength(1);
    expect(response.body.actions[0].status).toBe('pending');
  });

  test('lists pending actions in the triage inbox', async () => {
    query.mockResolvedValueOnce(result([{ role: 'viewer' }]));
    query.mockResolvedValueOnce(result([{ id: 'action-1', status: 'pending', cluster_title: '504 errors' }]));
    const response = await request(app).get('/api/actions?status=pending').set(auth('viewer'));
    expect(response.status).toBe(200);
    expect(response.body[0].status).toBe('pending');
  });

  test('responder can approve a pending action', async () => {
    query.mockResolvedValueOnce(result([{ role: 'responder' }]));
    query.mockResolvedValueOnce(result([{ id: 'action-1', status: 'approved' }]));
    const response = await request(app).post('/api/actions/action-1/approve').set(auth('responder')).send({});
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('approved');
    expect(query.mock.calls[1][0]).toContain("a.status = 'pending'");
    expect(query.mock.calls[1][1][0]).toBe('user-1');
  });

  test('viewer cannot approve an action', async () => {
    query.mockResolvedValueOnce(result([{ role: 'viewer' }]));
    const response = await request(app).post('/api/actions/action-1/approve').set(auth('viewer'));
    expect(response.status).toBe(403);
  });

  test('approve returns conflict for a non-pending action', async () => {
    query.mockResolvedValueOnce(result([{ role: 'admin' }]));
    query.mockResolvedValueOnce(result([]));
    const response = await request(app).post('/api/actions/action-1/approve').set(auth('admin'));
    expect(response.status).toBe(409);
  });

  test('reject and execute transitions', async () => {
    query.mockResolvedValueOnce(result([{ role: 'responder' }]));
    query.mockResolvedValueOnce(result([{ id: 'action-1', status: 'rejected' }]));
    let response = await request(app).post('/api/actions/action-1/reject').set(auth('responder')).send({ reason: 'Duplicate issue' });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('rejected');

    jest.clearAllMocks();
    query.mockResolvedValueOnce(result([{ role: 'admin' }]));
    query.mockResolvedValueOnce(result([{ id: 'action-2', status: 'executed' }]));
    response = await request(app).post('/api/actions/action-2/execute').set(auth('admin'));
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('executed');
  });

  test('reject requires a reason', async () => {
    query.mockResolvedValueOnce(result([{ role: 'admin' }]));
    const response = await request(app).post('/api/actions/action-1/reject').set(auth('admin')).send({});
    expect(response.status).toBe(400);
  });
});
