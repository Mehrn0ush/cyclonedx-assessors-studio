import { describe, it, expect, beforeEach } from 'vitest';
import { setupHttpTests, getAgent, loginAs } from '../helpers/http.js';

describe('Tags HTTP Routes', () => {
  setupHttpTests();

  describe('GET /api/v1/tags', () => {
    it('should return empty list initially', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/tags');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(0);
    });

    it('should require authentication', async () => {
      const agent = getAgent();
      const res = await agent.get('/api/v1/tags');

      expect(res.status).toBe(401);
    });

    it('should return all created tags', async () => {
      const adminAgent = await loginAs('admin');

      // Create first tag
      await adminAgent
        .post('/api/v1/tags')
        .send({ name: 'security', color: '#ff0000' });

      // Create second tag
      await adminAgent
        .post('/api/v1/tags')
        .send({ name: 'performance', color: '#00ff00' });

      // Get all tags
      const res = await adminAgent.get('/api/v1/tags');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data.map((t: any) => t.name)).toContain('security');
      expect(res.body.data.map((t: any) => t.name)).toContain('performance');
    });

    it('should return tags with camelCase properties (createdAt not created_at)', async () => {
      const adminAgent = await loginAs('admin');

      await adminAgent
        .post('/api/v1/tags')
        .send({ name: 'bugtag', color: '#0000ff' });

      const res = await adminAgent.get('/api/v1/tags');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      const tag = res.body.data[0];
      expect(tag).toHaveProperty('createdAt');
      expect(tag).not.toHaveProperty('created_at');
    });

    it('should allow assessor to view tags', async () => {
      const assessorAgent = await loginAs('assessor');
      const res = await assessorAgent.get('/api/v1/tags');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });

    it('should allow assessee to view tags', async () => {
      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.get('/api/v1/tags');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });
  });

  describe('POST /api/v1/tags', () => {
    it('should create a tag as admin', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .post('/api/v1/tags')
        .send({ name: 'newtag', color: '#123456' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('name', 'newtag');
      expect(res.body).toHaveProperty('color', '#123456');
    });

    it('should use default color if not provided', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .post('/api/v1/tags')
        .send({ name: 'colorless' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('color', '#6366f1');
    });

    it('should reject non-admin users (403)', async () => {
      const assessorAgent = await loginAs('assessor');
      const res = await assessorAgent
        .post('/api/v1/tags')
        .send({ name: 'denied', color: '#ff0000' });

      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated requests (401)', async () => {
      const agent = getAgent();
      const res = await agent
        .post('/api/v1/tags')
        .send({ name: 'unauthorized', color: '#ff0000' });

      expect(res.status).toBe(401);
    });

    it('should reject invalid color format', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .post('/api/v1/tags')
        .send({ name: 'badcolor', color: 'not-hex' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject color without hash prefix', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .post('/api/v1/tags')
        .send({ name: 'nohash', color: '123456' });

      expect(res.status).toBe(400);
    });

    it('should reject color with wrong number of hex digits', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .post('/api/v1/tags')
        .send({ name: 'wronglen', color: '#12345' });

      expect(res.status).toBe(400);
    });

    it('should reject empty tag name', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .post('/api/v1/tags')
        .send({ name: '', color: '#000000' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject tag name exceeding 100 characters', async () => {
      const agent = await loginAs('admin');
      const longName = 'a'.repeat(101);
      const res = await agent
        .post('/api/v1/tags')
        .send({ name: longName, color: '#000000' });

      expect(res.status).toBe(400);
    });

    it('should return 201 with created tag data', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .post('/api/v1/tags')
        .send({ name: 'createtest', color: '#aabbcc' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('string');
      expect(res.body.name).toBe('createtest');
      expect(res.body.color).toBe('#aabbcc');
    });
  });

  describe('GET /api/v1/tags/autocomplete', () => {
    beforeEach(async () => {
      // Create some tags for autocomplete testing
      const adminAgent = await loginAs('admin');
      await adminAgent.post('/api/v1/tags').send({ name: 'security', color: '#ff0000' });
      await adminAgent.post('/api/v1/tags').send({ name: 'performance', color: '#00ff00' });
      await adminAgent.post('/api/v1/tags').send({ name: 'scalability', color: '#0000ff' });
    });

    it('should return filtered tags matching query', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/tags/autocomplete?q=sec');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.some((t: any) => t.name === 'security')).toBe(true);
    });

    it('should be case-insensitive', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/tags/autocomplete?q=PERF');

      expect(res.status).toBe(200);
      expect(res.body.data.some((t: any) => t.name === 'performance')).toBe(true);
    });

    it('should return empty array for non-matching query', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/tags/autocomplete?q=nonexistent');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });

    it('should return all tags with empty query', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/tags/autocomplete?q=');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should limit results to 10 items', async () => {
      const adminAgent = await loginAs('admin');

      // Create 15 tags starting with 's'
      for (let i = 0; i < 15; i++) {
        await adminAgent.post('/api/v1/tags').send({
          name: `scalable${i}`,
          color: '#000000',
        });
      }

      const agent = await loginAs('assessor');
      const res = await agent.get('/api/v1/tags/autocomplete?q=scal');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(10);
    });

    it('should require authentication', async () => {
      const agent = getAgent();
      const res = await agent.get('/api/v1/tags/autocomplete?q=test');

      expect(res.status).toBe(401);
    });

    it('should work with partial matches', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/tags/autocomplete?q=cal');

      expect(res.status).toBe(200);
      expect(res.body.data.some((t: any) => t.name === 'scalability')).toBe(true);
    });
  });

  describe('PUT /api/v1/tags/:id', () => {
    it('should update tag name', async () => {
      const adminAgent = await loginAs('admin');

      // Create tag
      const createRes = await adminAgent
        .post('/api/v1/tags')
        .send({ name: 'original', color: '#000000' });
      const tagId = createRes.body.id;

      // Update name
      const updateRes = await adminAgent
        .put(`/api/v1/tags/${tagId}`)
        .send({ name: 'updated' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe('updated');
      expect(updateRes.body.id).toBe(tagId);
    });

    it('should update tag color', async () => {
      const adminAgent = await loginAs('admin');

      const createRes = await adminAgent
        .post('/api/v1/tags')
        .send({ name: 'colortest', color: '#111111' });
      const tagId = createRes.body.id;

      const updateRes = await adminAgent
        .put(`/api/v1/tags/${tagId}`)
        .send({ color: '#222222' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.color).toBe('#222222');
    });

    it('should update both name and color', async () => {
      const adminAgent = await loginAs('admin');

      const createRes = await adminAgent
        .post('/api/v1/tags')
        .send({ name: 'both', color: '#333333' });
      const tagId = createRes.body.id;

      const updateRes = await adminAgent
        .put(`/api/v1/tags/${tagId}`)
        .send({ name: 'newboth', color: '#444444' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe('newboth');
      expect(updateRes.body.color).toBe('#444444');
    });

    it('should return 404 for non-existent tag', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .put('/api/v1/tags/00000000-0000-0000-0000-000000000000')
        .send({ name: 'ghost' });

      expect(res.status).toBe(404);
    });

    it('should reject non-admin users (403)', async () => {
      const adminAgent = await loginAs('admin');
      const createRes = await adminAgent
        .post('/api/v1/tags')
        .send({ name: 'test', color: '#555555' });
      const tagId = createRes.body.id;

      const assessorAgent = await loginAs('assessor');
      const updateRes = await assessorAgent
        .put(`/api/v1/tags/${tagId}`)
        .send({ name: 'denied' });

      expect(updateRes.status).toBe(403);
    });

    it('should reject unauthenticated requests (401)', async () => {
      const agent = getAgent();
      const res = await agent
        .put('/api/v1/tags/00000000-0000-0000-0000-000000000000')
        .send({ name: 'unauthorized' });

      expect(res.status).toBe(401);
    });

    it('should reject invalid color format', async () => {
      const adminAgent = await loginAs('admin');

      const createRes = await adminAgent
        .post('/api/v1/tags')
        .send({ name: 'colorval', color: '#666666' });
      const tagId = createRes.body.id;

      const updateRes = await adminAgent
        .put(`/api/v1/tags/${tagId}`)
        .send({ color: 'badcolor' });

      expect(updateRes.status).toBe(400);
    });

    it('should allow partial updates with only name', async () => {
      const adminAgent = await loginAs('admin');

      const createRes = await adminAgent
        .post('/api/v1/tags')
        .send({ name: 'partial', color: '#777777' });
      const tagId = createRes.body.id;

      const updateRes = await adminAgent
        .put(`/api/v1/tags/${tagId}`)
        .send({ name: 'partialupdated' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe('partialupdated');
      // Color should remain unchanged
      expect(updateRes.body.color).toBe('#777777');
    });

    it('should allow partial updates with only color', async () => {
      const adminAgent = await loginAs('admin');

      const createRes = await adminAgent
        .post('/api/v1/tags')
        .send({ name: 'onlycolor', color: '#888888' });
      const tagId = createRes.body.id;

      const updateRes = await adminAgent
        .put(`/api/v1/tags/${tagId}`)
        .send({ color: '#999999' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe('onlycolor');
      expect(updateRes.body.color).toBe('#999999');
    });

    it('should return updated tag with camelCase properties', async () => {
      const adminAgent = await loginAs('admin');

      const createRes = await adminAgent
        .post('/api/v1/tags')
        .send({ name: 'cameltest', color: '#aaaaaa' });
      const tagId = createRes.body.id;

      const updateRes = await adminAgent
        .put(`/api/v1/tags/${tagId}`)
        .send({ name: 'camelupdate' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body).toHaveProperty('createdAt');
      expect(updateRes.body).not.toHaveProperty('created_at');
    });
  });

  describe('DELETE /api/v1/tags/:id', () => {
    it('should delete a tag and return 204', async () => {
      const adminAgent = await loginAs('admin');

      const createRes = await adminAgent
        .post('/api/v1/tags')
        .send({ name: 'deleteme', color: '#bbbbbb' });
      const tagId = createRes.body.id;

      const deleteRes = await adminAgent.delete(`/api/v1/tags/${tagId}`);

      expect(deleteRes.status).toBe(204);
      expect(deleteRes.body).toEqual({});
    });

    it('should be idempotent (204 on non-existent tag)', async () => {
      const agent = await loginAs('admin');
      const res = await agent.delete('/api/v1/tags/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(204);
    });

    it('should reject non-admin users (403)', async () => {
      const adminAgent = await loginAs('admin');

      const createRes = await adminAgent
        .post('/api/v1/tags')
        .send({ name: 'cantdelete', color: '#cccccc' });
      const tagId = createRes.body.id;

      const assessorAgent = await loginAs('assessor');
      const deleteRes = await assessorAgent.delete(`/api/v1/tags/${tagId}`);

      expect(deleteRes.status).toBe(403);
    });

    it('should reject unauthenticated requests (401)', async () => {
      const agent = getAgent();
      const res = await agent.delete('/api/v1/tags/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(401);
    });

    it('should actually remove the tag from the database', async () => {
      const adminAgent = await loginAs('admin');

      const createRes = await adminAgent
        .post('/api/v1/tags')
        .send({ name: 'verifydelete', color: '#dddddd' });
      const tagId = createRes.body.id;

      // Delete the tag
      await adminAgent.delete(`/api/v1/tags/${tagId}`);

      // Try to get all tags and verify it's gone
      const tagsRes = await adminAgent.get('/api/v1/tags');
      const tagNames = tagsRes.body.data.map((t: any) => t.name);
      expect(tagNames).not.toContain('verifydelete');
    });

    it('should allow deleting multiple tags in sequence', async () => {
      const adminAgent = await loginAs('admin');

      const tag1 = await adminAgent.post('/api/v1/tags').send({ name: 'del1', color: '#eeeeee' });
      const tag2 = await adminAgent.post('/api/v1/tags').send({ name: 'del2', color: '#ffffff' });

      const delete1 = await adminAgent.delete(`/api/v1/tags/${tag1.body.id}`);
      const delete2 = await adminAgent.delete(`/api/v1/tags/${tag2.body.id}`);

      expect(delete1.status).toBe(204);
      expect(delete2.status).toBe(204);
    });
  });

  describe('Tag name validation', () => {
    it('should enforce min length of 1', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .post('/api/v1/tags')
        .send({ name: '', color: '#000000' });

      expect(res.status).toBe(400);
    });

    it('should enforce max length of 100', async () => {
      const agent = await loginAs('admin');
      const name101 = 'a'.repeat(101);
      const res = await agent
        .post('/api/v1/tags')
        .send({ name: name101, color: '#000000' });

      expect(res.status).toBe(400);
    });

    it('should accept name of exactly 100 characters', async () => {
      const agent = await loginAs('admin');
      const name100 = 'a'.repeat(100);
      const res = await agent
        .post('/api/v1/tags')
        .send({ name: name100, color: '#000000' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe(name100);
    });
  });

  describe('Color validation', () => {
    it('should accept valid hex colors', async () => {
      const agent = await loginAs('admin');

      const colors = ['#000000', '#ffffff', '#123abc', '#ABCDEF'];
      for (const color of colors) {
        const res = await agent
          .post('/api/v1/tags')
          .send({ name: `color-${color.toLowerCase()}`, color });

        expect(res.status).toBe(201);
        expect(res.body.color).toBe(color);
      }
    });

    it('should reject colors without hash', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .post('/api/v1/tags')
        .send({ name: 'nohash', color: '000000' });

      expect(res.status).toBe(400);
    });

    it('should reject colors with incorrect length', async () => {
      const agent = await loginAs('admin');

      const invalidColors = ['#00', '#0000', '#00000', '#0000000'];
      for (const color of invalidColors) {
        const res = await agent
          .post('/api/v1/tags')
          .send({ name: `badlen-${color}`, color });

        expect(res.status).toBe(400);
      }
    });

    it('should reject non-hex characters', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .post('/api/v1/tags')
        .send({ name: 'nonhex', color: '#gggggg' });

      expect(res.status).toBe(400);
    });

    it('should use default color when not specified', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .post('/api/v1/tags')
        .send({ name: 'defaultcolor' });

      expect(res.status).toBe(201);
      expect(res.body.color).toBe('#6366f1');
    });
  });

  describe('Role-based access control', () => {
    it('admin can perform all operations', async () => {
      const adminAgent = await loginAs('admin');

      // Create
      const createRes = await adminAgent
        .post('/api/v1/tags')
        .send({ name: 'admintest', color: '#000000' });
      expect(createRes.status).toBe(201);
      const tagId = createRes.body.id;

      // Read
      const readRes = await adminAgent.get('/api/v1/tags');
      expect(readRes.status).toBe(200);

      // Update
      const updateRes = await adminAgent
        .put(`/api/v1/tags/${tagId}`)
        .send({ name: 'adminupdate' });
      expect(updateRes.status).toBe(200);

      // Delete
      const deleteRes = await adminAgent.delete(`/api/v1/tags/${tagId}`);
      expect(deleteRes.status).toBe(204);
    });

    it('assessor can read but not write', async () => {
      const assessorAgent = await loginAs('assessor');

      // Read should work
      const readRes = await assessorAgent.get('/api/v1/tags');
      expect(readRes.status).toBe(200);

      // Autocomplete should work
      const autocompleteRes = await assessorAgent.get('/api/v1/tags/autocomplete?q=test');
      expect(autocompleteRes.status).toBe(200);

      // Create should fail
      const createRes = await assessorAgent
        .post('/api/v1/tags')
        .send({ name: 'denied', color: '#000000' });
      expect(createRes.status).toBe(403);
    });

    it('assessee can read but not write', async () => {
      const assesseeAgent = await loginAs('assessee');

      const readRes = await assesseeAgent.get('/api/v1/tags');
      expect(readRes.status).toBe(200);

      const createRes = await assesseeAgent
        .post('/api/v1/tags')
        .send({ name: 'denied', color: '#000000' });
      expect(createRes.status).toBe(403);
    });
  });
});
