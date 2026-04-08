import { describe, it, expect } from 'vitest';
import { setupHttpTests, getAgent, loginAs } from '../helpers/http.js';

describe('Dashboard Routes (HTTP Integration)', () => {
  setupHttpTests();

  describe('GET /api/v1/dashboard/stats', () => {
    it('should return numeric stats when authenticated', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/stats');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalProjects');
      expect(res.body).toHaveProperty('projectsInProgress');
      expect(res.body).toHaveProperty('totalAssessments');
      expect(res.body).toHaveProperty('assessmentsInProgress');
      expect(res.body).toHaveProperty('assessmentsComplete');
      expect(res.body).toHaveProperty('totalEvidence');
      expect(res.body).toHaveProperty('totalClaims');
      expect(res.body).toHaveProperty('totalAttestations');
      expect(res.body).toHaveProperty('totalStandards');
      expect(res.body).toHaveProperty('evidenceExpiringSoon');
      expect(res.body).toHaveProperty('assessmentsOverdue');
      expect(res.body).toHaveProperty('completionRate');
    });

    it('should return all properties as numbers', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/stats');

      expect(res.status).toBe(200);
      expect(typeof res.body.totalProjects).toBe('number');
      expect(typeof res.body.projectsInProgress).toBe('number');
      expect(typeof res.body.totalAssessments).toBe('number');
      expect(typeof res.body.assessmentsInProgress).toBe('number');
      expect(typeof res.body.assessmentsComplete).toBe('number');
      expect(typeof res.body.totalEvidence).toBe('number');
      expect(typeof res.body.totalClaims).toBe('number');
      expect(typeof res.body.totalAttestations).toBe('number');
      expect(typeof res.body.totalStandards).toBe('number');
      expect(typeof res.body.evidenceExpiringSoon).toBe('number');
      expect(typeof res.body.assessmentsOverdue).toBe('number');
      expect(typeof res.body.completionRate).toBe('number');
    });

    it('should return non-negative values', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/stats');

      expect(res.status).toBe(200);
      expect(res.body.totalProjects).toBeGreaterThanOrEqual(0);
      expect(res.body.projectsInProgress).toBeGreaterThanOrEqual(0);
      expect(res.body.totalAssessments).toBeGreaterThanOrEqual(0);
      expect(res.body.assessmentsInProgress).toBeGreaterThanOrEqual(0);
      expect(res.body.assessmentsComplete).toBeGreaterThanOrEqual(0);
      expect(res.body.totalEvidence).toBeGreaterThanOrEqual(0);
      expect(res.body.totalClaims).toBeGreaterThanOrEqual(0);
      expect(res.body.totalAttestations).toBeGreaterThanOrEqual(0);
      expect(res.body.totalStandards).toBeGreaterThanOrEqual(0);
      expect(res.body.evidenceExpiringSoon).toBeGreaterThanOrEqual(0);
      expect(res.body.assessmentsOverdue).toBeGreaterThanOrEqual(0);
      expect(res.body.completionRate).toBeGreaterThanOrEqual(0);
    });

    it('should have completionRate between 0-100', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/stats');

      expect(res.status).toBe(200);
      expect(res.body.completionRate).toBeGreaterThanOrEqual(0);
      expect(res.body.completionRate).toBeLessThanOrEqual(100);
    });

    it('should be accessible to assessor role', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.get('/api/v1/dashboard/stats');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalProjects');
    });

    it('should be accessible to assessee role', async () => {
      const agent = await loginAs('assessee');
      const res = await agent.get('/api/v1/dashboard/stats');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalProjects');
    });

    it('should return 401 for unauthenticated requests', async () => {
      const agent = getAgent();
      const res = await agent.get('/api/v1/dashboard/stats');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/dashboard/recent-assessments', () => {
    it('should return array of recent assessments when authenticated', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/recent-assessments');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return camelCase fields in response', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/recent-assessments');

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const assessment = res.body.data[0];
        // Check for camelCase fields
        if (assessment.projectName !== undefined) {
          expect(assessment).toHaveProperty('projectName');
          expect(assessment).not.toHaveProperty('project_name');
        }
        expect(assessment).toHaveProperty('dueDate');
        expect(assessment).toHaveProperty('createdAt');
        expect(assessment).not.toHaveProperty('due_date');
        expect(assessment).not.toHaveProperty('created_at');
      }
    });

    it('should limit results to 5 recent assessments', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/recent-assessments');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
    });

    it('should include required fields', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/recent-assessments');

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const assessment = res.body.data[0];
        expect(assessment).toHaveProperty('id');
        expect(assessment).toHaveProperty('title');
        expect(assessment).toHaveProperty('state');
      }
    });

    it('should be accessible to assessor role', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.get('/api/v1/dashboard/recent-assessments');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should be accessible to assessee role', async () => {
      const agent = await loginAs('assessee');
      const res = await agent.get('/api/v1/dashboard/recent-assessments');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const agent = getAgent();
      const res = await agent.get('/api/v1/dashboard/recent-assessments');

      expect(res.status).toBe(401);
    });

    it('should handle empty results gracefully', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/recent-assessments');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/dashboard/upcoming-due-dates', () => {
    it('should return array of upcoming assessments when authenticated', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/upcoming-due-dates');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should limit results to 10 assessments', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/upcoming-due-dates');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(10);
    });

    it('should return camelCase fields in response', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/upcoming-due-dates');

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const assessment = res.body.data[0];
        expect(assessment).toHaveProperty('daysUntilDue');
        expect(assessment).toHaveProperty('projectName');
        expect(assessment).not.toHaveProperty('days_until_due');
        expect(assessment).not.toHaveProperty('project_name');
      }
    });

    it('should include required fields', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/upcoming-due-dates');

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const assessment = res.body.data[0];
        expect(assessment).toHaveProperty('id');
        expect(assessment).toHaveProperty('title');
        expect(assessment).toHaveProperty('dueDate');
        expect(assessment).toHaveProperty('state');
        expect(assessment).toHaveProperty('daysUntilDue');
      }
    });

    it('should have positive daysUntilDue values', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/upcoming-due-dates');

      expect(res.status).toBe(200);
      res.body.data.forEach((assessment: any) => {
        expect(assessment.daysUntilDue).toBeGreaterThan(0);
      });
    });

    it('should exclude complete assessments', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/upcoming-due-dates');

      expect(res.status).toBe(200);
      res.body.data.forEach((assessment: any) => {
        expect(assessment.state).not.toBe('complete');
        expect(assessment.state).not.toBe('cancelled');
      });
    });

    it('should be accessible to assessor role', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.get('/api/v1/dashboard/upcoming-due-dates');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should be accessible to assessee role', async () => {
      const agent = await loginAs('assessee');
      const res = await agent.get('/api/v1/dashboard/upcoming-due-dates');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const agent = getAgent();
      const res = await agent.get('/api/v1/dashboard/upcoming-due-dates');

      expect(res.status).toBe(401);
    });

    it('should handle empty results gracefully', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/upcoming-due-dates');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/dashboard/compliance-coverage', () => {
    it('should return array of compliance coverage data when authenticated', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/compliance-coverage');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return camelCase fields in response', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/compliance-coverage');

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const coverage = res.body.data[0];
        expect(coverage).toHaveProperty('standardId');
        expect(coverage).toHaveProperty('standardName');
        expect(coverage).toHaveProperty('totalRequirements');
        expect(coverage).toHaveProperty('assessedRequirements');
        expect(coverage).toHaveProperty('coveragePercent');
        expect(coverage).not.toHaveProperty('standard_id');
        expect(coverage).not.toHaveProperty('standard_name');
        expect(coverage).not.toHaveProperty('total_requirements');
        expect(coverage).not.toHaveProperty('assessed_requirements');
        expect(coverage).not.toHaveProperty('coverage_percent');
      }
    });

    it('should include required fields', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/compliance-coverage');

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const coverage = res.body.data[0];
        expect(coverage).toHaveProperty('standardId');
        expect(coverage).toHaveProperty('standardName');
        expect(coverage).toHaveProperty('version');
        expect(coverage).toHaveProperty('totalRequirements');
        expect(coverage).toHaveProperty('assessedRequirements');
        expect(coverage).toHaveProperty('coveragePercent');
      }
    });

    it('should have numeric values for coverage metrics', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/compliance-coverage');

      expect(res.status).toBe(200);
      res.body.data.forEach((coverage: any) => {
        expect(typeof coverage.totalRequirements).toBe('number');
        expect(typeof coverage.assessedRequirements).toBe('number');
        expect(typeof coverage.coveragePercent).toBe('number');
      });
    });

    it('should have coveragePercent between 0-100', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/compliance-coverage');

      expect(res.status).toBe(200);
      res.body.data.forEach((coverage: any) => {
        expect(coverage.coveragePercent).toBeGreaterThanOrEqual(0);
        expect(coverage.coveragePercent).toBeLessThanOrEqual(100);
      });
    });

    it('should have assessedRequirements <= totalRequirements', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/compliance-coverage');

      expect(res.status).toBe(200);
      res.body.data.forEach((coverage: any) => {
        expect(coverage.assessedRequirements).toBeLessThanOrEqual(coverage.totalRequirements);
      });
    });

    it('should be accessible to assessor role', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.get('/api/v1/dashboard/compliance-coverage');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should be accessible to assessee role', async () => {
      const agent = await loginAs('assessee');
      const res = await agent.get('/api/v1/dashboard/compliance-coverage');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const agent = getAgent();
      const res = await agent.get('/api/v1/dashboard/compliance-coverage');

      expect(res.status).toBe(401);
    });

    it('should handle empty results gracefully', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/dashboard/compliance-coverage');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
