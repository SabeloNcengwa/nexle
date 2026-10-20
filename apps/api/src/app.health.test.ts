import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';

describe('health and readiness', () => {
  it('returns ok without auth', async () => {
    const app = createApp(loadEnv({ NODE_ENV: 'test', PORT: '8080', CORS_ORIGIN: '*' }));
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.phase).toBe(6);
  });

  it('returns ready when not in maintenance', async () => {
    const app = createApp(loadEnv({ NODE_ENV: 'test', PORT: '8080', CORS_ORIGIN: '*' }));
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ready');
  });

  it('returns 503 when maintenance mode is on', async () => {
    const app = createApp(
      loadEnv({ NODE_ENV: 'test', PORT: '8080', CORS_ORIGIN: '*', MAINTENANCE_MODE: 'true' }),
    );
    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.data.status).toBe('not_ready');
    expect(res.body.data.reasons).toContain('maintenance_mode');
  });
});
