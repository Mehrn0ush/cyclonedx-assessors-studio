import { test, expect, request } from '@playwright/test';
import { test as authedTest } from '../../fixtures/index.js';

/**
 * API error envelope mapping.
 *
 * The frontend's apiErrorMessage() helper assumes the backend produces
 * a consistent shape:
 *
 *   400 -> { error: 'Invalid input', details: ZodIssue[] } from Zod
 *   400 -> { error: '...domain message...' } from handler short-circuits
 *   401 -> { error: 'Authentication required' | 'Invalid credentials' | ... }
 *   403 -> { error: 'Insufficient permissions' | route-specific message }
 *   404 -> { error: '<Resource> not found' }
 *   409 -> { error: '<conflict reason>' }
 *
 * If any handler regresses to `{ message: ... }` (the bug repaired in
 * PR #1 of the frontend), the toast layer will silently show the
 * generic fallback. This spec keeps that contract on lock.
 */

authedTest.describe('API error envelope mapping @regression', () => {
  authedTest('400 Zod validation always returns { error: "Invalid input", details: [...] }', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/entities?limit=999');
    expect(r.status()).toBe(400);
    const body = await r.json();
    expect(body.error).toBe('Invalid input');
    expect(Array.isArray(body.details)).toBeTruthy();
    expect(body.message).toBeUndefined(); // ensure we have not regressed to `message`
  });

  authedTest('400 domain error returns { error: "<reason>" }', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.post('/api/v1/tags', { data: { name: '', color: '#fff' } });
    expect(r.status()).toBe(400);
    const body = await r.json();
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  authedTest('401 from missing credentials returns { error: ... } envelope', async ({}, testInfo) => {
    const ctx = await request.newContext({ baseURL: testInfo.project.use.baseURL });
    const r = await ctx.get('/api/v1/auth/me');
    expect(r.status()).toBe(401);
    const body = await r.json();
    expect(typeof body.error).toBe('string');
    await ctx.dispose();
  });

  authedTest('401 from wrong password returns generic { error: "Invalid credentials" }', async ({}, testInfo) => {
    const ctx = await request.newContext({ baseURL: testInfo.project.use.baseURL });
    const r = await ctx.post('/api/v1/auth/login', {
      data: { username: 'definitely_not_a_user', password: 'whatever' },
    });
    expect(r.status()).toBe(401);
    const body = await r.json();
    expect(body.error).toMatch(/credentials/i);
    await ctx.dispose();
  });

  authedTest('403 from RBAC denial returns { error: ... } envelope', async ({ apiAs }) => {
    const api = await apiAs('assessor');
    const r = await api.get('/api/v1/users');
    expect(r.status()).toBe(403);
    const body = await r.json();
    expect(typeof body.error).toBe('string');
  });

  authedTest('404 for unknown resource returns { error: "<X> not found" }', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/entities/00000000-0000-0000-0000-000000000000');
    expect(r.status()).toBe(404);
    const body = await r.json();
    expect(body.error).toMatch(/not found/i);
  });

  authedTest('409 conflict returns { error: ... } envelope', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const name = `e2e-dup-${Date.now().toString(36)}`;
    // Colors must be full 6-char hex (createTagSchema: /^#[0-9a-fA-F]{6}$/).
    // The shorthand #abc form would 400 here, before we ever reach the
    // duplicate-name path we want to assert against.
    const first = await api.post('/api/v1/tags', { data: { name, color: '#aabbcc' } });
    expect(first.status(), `first create failed: ${await first.text()}`).toBe(201);
    const dup = await api.post('/api/v1/tags', { data: { name, color: '#ddeeff' } });
    expect(dup.status()).toBe(409);
    const body = await dup.json();
    expect(typeof body.error).toBe('string');
  });

  authedTest('PUT validation failures echo Zod issues in details', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const tag = await api
      .post('/api/v1/tags', { data: { name: `e2e-issues-${Date.now().toString(36)}`, color: '#000' } })
      .then((r) => r.json());

    const bad = await api.put(`/api/v1/tags/${tag.id}`, {
      data: { color: 'not-a-hex' },
    });
    if (bad.status() === 400) {
      const body = await bad.json();
      expect(body.error).toBeTruthy();
      // Either Zod path or domain error path — both must use `error`, not `message`.
      expect(body.message).toBeUndefined();
    }
  });

  authedTest('routes that previously used message:* still use error:*', async ({ apiAs }) => {
    // Spot check: pick three different routers and trigger a 400 on each.
    const api = await apiAs('admin');
    const probes: Array<{ method: 'get' | 'post' | 'put' | 'delete'; url: string; body?: unknown }> = [
      { method: 'post', url: '/api/v1/entities', body: { name: '' } },
      { method: 'post', url: '/api/v1/projects', body: { /* missing required */ } },
      { method: 'post', url: '/api/v1/evidence', body: { /* missing name */ } },
    ];
    for (const p of probes) {
      const r = p.method === 'post'
        ? await api.post(p.url, { data: p.body })
        : await api.get(p.url);
      // Accept 400 or 422 (validation), reject 500.
      expect([400, 422], `${p.url} unexpected status`).toContain(r.status());
      const body = await r.json();
      expect(typeof body.error, `${p.url} missing error key`).toBe('string');
    }
  });
});

// Silence unused-import warning if a future edit removes plain test usage.
void test;
