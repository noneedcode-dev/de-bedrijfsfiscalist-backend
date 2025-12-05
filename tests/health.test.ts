import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';

const app = createApp();

describe('Health routes', () => {
  it('GET / should return API info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('De Bedrijfsfiscalist Backend API');
    expect(res.body.status).toBe('running');
  });

  it('GET /health should return healthy status', async () => {
    const res = await request(app).get('/health');
    // Accept either 200 (healthy) or 503 (degraded) - DB might not be accessible in tests
    expect([200, 503]).toContain(res.status);
    expect(res.body.status).toMatch(/healthy|degraded/);
    expect(res.body).toHaveProperty('uptime');
    expect(res.body.checks).toHaveProperty('database');
  });
});

