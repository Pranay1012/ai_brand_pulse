import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const query = jest.fn();
const connect = jest.fn();

jest.mock('../src/db', () => ({
  __esModule: true,
  default: { query, connect },
  pool: { query, connect },
}));

import app from '../src/app';

const secret = 'test-secret';
process.env.JWT_SECRET = secret;

beforeEach(() => {
  jest.clearAllMocks();
});

function clientResult(rows: any[] = [], rowCount = rows.length) {
  return { rows, rowCount };
}

function adminToken() {
  return jwt.sign({ userId: 'user-1', email: 'admin@example.com', workspaceId: 'workspace-1', role: 'admin' }, secret);
}

function viewerToken() {
  return jwt.sign({ userId: 'user-1', email: 'viewer@example.com', workspaceId: 'workspace-1', role: 'viewer' }, secret);
}

describe('Gateway Phase 7', () => {
  test('health verifies PostgreSQL', async () => {
    query.mockResolvedValueOnce(clientResult([{ '?column?': 1 }]));
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.db).toBe('connected');
  });

  test('register hashes password, creates workspace membership, and returns JWT', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce(clientResult())
        .mockResolvedValueOnce(clientResult([{ id: 'user-1', email: 'new@example.com', name: 'New User' }]))
        .mockResolvedValueOnce(clientResult([{ id: 'workspace-1' }]))
        .mockResolvedValueOnce(clientResult())
        .mockResolvedValueOnce(clientResult()),
      release: jest.fn(),
    };
    connect.mockResolvedValue(client);

    const response = await request(app).post('/api/auth/register').send({
      email: 'new@example.com', password: 'strong-password', name: 'New User',
    });

    expect(response.status).toBe(201);
    expect(response.body.token).toBeTruthy();
    const insertParams = client.query.mock.calls[1][1];
    expect(await bcrypt.compare('strong-password', insertParams[1])).toBe(true);
    expect(client.query.mock.calls.some(call => String(call[0]).includes("workspace_members"))).toBe(true);
  });

  test('login returns JWT for valid credentials and rejects invalid credentials', async () => {
    const passwordHash = bcrypt.hashSync('secret', 4);
    query
      .mockResolvedValueOnce(clientResult([{ id: 'user-1', email: 'admin@example.com', name: 'Admin', password_hash: passwordHash }]))
      .mockResolvedValueOnce(clientResult([{ workspace_id: 'workspace-1', role: 'admin' }]));

    let response = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'secret' });
    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();

    jest.clearAllMocks();
    query.mockResolvedValueOnce(clientResult([{ id: 'user-1', email: 'admin@example.com', password_hash: passwordHash }]));
    response = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'wrong' });
    expect(response.status).toBe(401);
  });

  test('protected brand route rejects missing JWT with 401', async () => {
    const response = await request(app).get('/api/brands');
    expect(response.status).toBe(401);
  });

  test('viewer cannot create brands and receives 403', async () => {
    query.mockResolvedValueOnce(clientResult([{ role: 'viewer' }]));
    const response = await request(app)
      .post('/api/brands')
      .set('Authorization', `Bearer ${viewerToken()}`)
      .send({ name: 'Vercel', keywords: ['vercel'] });
    expect(response.status).toBe(403);
  });

  test('admin can list and create tracked brands', async () => {
    query
      .mockResolvedValueOnce(clientResult([{ role: 'admin' }]))
      .mockResolvedValueOnce(clientResult([{ id: 'brand-1', workspace_id: 'workspace-1', name: 'Vercel', keywords: ['vercel'] }]));
    let response = await request(app)
      .get('/api/brands')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(response.status).toBe(200);

    jest.clearAllMocks();
    query
      .mockResolvedValueOnce(clientResult([{ role: 'admin' }]))
      .mockResolvedValueOnce(clientResult([{ id: 'brand-2', workspace_id: 'workspace-1', name: 'Vercel', keywords: ['vercel'] }], 1));
    response = await request(app)
      .post('/api/brands')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Vercel', keywords: ['vercel'], competitor_names: ['Netlify'] });
    expect(response.status).toBe(201);
    expect(response.body.name).toBe('Vercel');
  });
});
