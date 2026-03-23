const request = require('supertest');

// Mock database module before requiring app
jest.mock('../src/models/db', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy', timestamp: new Date().toISOString() }),
  close: jest.fn(),
  pool: { on: jest.fn(), end: jest.fn() },
}));

const { app } = require('../src/server');
const db = require('../src/models/db');
const { v4: uuidv4 } = require('uuid');

describe('LogiSense API', () => {
  const mockClient = {
    id: uuidv4(),
    api_key: 'ls_test_key_123',
    name: 'Test Company',
    email: 'test@example.com',
    tier: 'starter',
    is_active: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('LogiSense API');
      expect(res.body.status).toBe('operational');
    });
  });

  describe('POST /api/v1/clients/register', () => {
    it('should register a new client', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] }) // findByEmail check
        .mockResolvedValueOnce({ rows: [{ ...mockClient, api_key: 'ls_new_key' }] }); // create

      const res = await request(app)
        .post('/api/v1/clients/register')
        .send({ name: 'Test Corp', email: 'new@test.com', tier: 'free' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.apiKey).toBeDefined();
    });

    it('should reject duplicate email', async () => {
      db.query.mockResolvedValueOnce({ rows: [mockClient] }); // findByEmail

      const res = await request(app)
        .post('/api/v1/clients/register')
        .send({ name: 'Test Corp', email: 'test@example.com' });

      expect(res.status).toBe(409);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/v1/clients/register')
        .send({ name: 'Test' }); // missing email

      expect(res.status).toBe(400);
    });
  });

  describe('Authenticated Routes', () => {
    beforeEach(() => {
      // Mock API key lookup for auth
      db.query.mockImplementation((sql, params) => {
        if (sql.includes('api_key') && params && params[0] === 'ls_test_key_123') {
          return Promise.resolve({ rows: [mockClient] });
        }
        // Default for usage check
        if (sql.includes('usage_logs')) {
          return Promise.resolve({ rows: [{ client_id: mockClient.id, month: '2025-01', call_count: 5 }], rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });
    });

    it('should reject requests without API key', async () => {
      const res = await request(app).get('/api/v1/deliveries');
      expect(res.status).toBe(401);
    });

    it('should reject invalid API key', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/deliveries')
        .set('X-API-Key', 'invalid_key');

      expect(res.status).toBe(401);
    });

    describe('POST /api/v1/deliveries', () => {
      it('should validate delivery event schema', async () => {
        const res = await request(app)
          .post('/api/v1/deliveries')
          .set('X-API-Key', 'ls_test_key_123')
          .send({ status: 'invalid_status', externalId: 'DEL-001' });

        expect(res.status).toBe(400);
      });
    });

    describe('GET /api/v1/usage', () => {
      it('should return usage data', async () => {
        db.query.mockImplementation((sql) => {
          if (sql.includes('api_key')) return Promise.resolve({ rows: [mockClient] });
          if (sql.includes('usage_logs') && sql.includes('ORDER BY month')) {
            return Promise.resolve({
              rows: [{ month: '2025-01', call_count: 150 }],
            });
          }
          return Promise.resolve({
            rows: [{ client_id: mockClient.id, month: '2025-01', call_count: 150 }],
            rowCount: 1,
          });
        });

        const res = await request(app)
          .get('/api/v1/usage')
          .set('X-API-Key', 'ls_test_key_123');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.currentMonth).toBeDefined();
      });
    });
  });
});
