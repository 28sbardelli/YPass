import { describe, expect, it, afterEach } from 'vitest';
import { createTestApp } from '../helpers/app.js';

describe('http skeleton', () => {
  /** @type {Awaited<ReturnType<typeof createTestApp>> | null} */
  let ctx = null;
  afterEach(async () => {
    if (ctx) {
      await ctx.close();
      ctx = null;
    }
  });

  it('serves the home page and hides X-Powered-By', async () => {
    ctx = await createTestApp();
    const res = await ctx.request.get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Elektronischer Hallenpass');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toBeTruthy();
  });

  it('returns JSON 404 for API paths', async () => {
    ctx = await createTestApp();
    const res = await ctx.request.get('/api/v1/missing');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('reports live and ready health', async () => {
    ctx = await createTestApp();
    const live = await ctx.request.get('/health/live');
    expect(live.status).toBe(200);
    expect(live.body.status).toBe('live');
    const ready = await ctx.request.get('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe('ready');
    expect(ready.body.details).toBeUndefined();
  });

  it('requires authentication for /api/v1/me', async () => {
    ctx = await createTestApp();
    const me = await ctx.request.get('/api/v1/me');
    expect(me.status).toBe(401);
  });

  it('does not register API routes when API_ENABLED is false', async () => {
    ctx = await createTestApp({ API_ENABLED: 'false' });
    const res = await ctx.request.get('/api/v1/me');
    expect(res.status).toBe(404);
  });
});
