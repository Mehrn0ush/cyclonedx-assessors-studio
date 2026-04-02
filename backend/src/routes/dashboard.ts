import { Router, Response } from 'express';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/stats', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    const totalProjects = await db
      .selectFrom('project')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => Number(r.count));

    const projectsInProgress = await db
      .selectFrom('project')
      .where('state', '=', 'in_progress')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => Number(r.count));

    const totalAssessments = await db
      .selectFrom('assessment')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => Number(r.count));

    const assessmentsInProgress = await db
      .selectFrom('assessment')
      .where('state', '=', 'in_progress')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => Number(r.count));

    const assessmentsComplete = await db
      .selectFrom('assessment')
      .where('state', '=', 'complete')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => Number(r.count));

    const totalEvidence = await db
      .selectFrom('evidence')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => Number(r.count));

    const totalClaims = await db
      .selectFrom('claim')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => Number(r.count));

    const totalAttestations = await db
      .selectFrom('attestation')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => Number(r.count));

    const totalStandards = await db
      .selectFrom('standard')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => Number(r.count));

    const evidenceExpiringSoon = await db
      .selectFrom('evidence')
      .where('expires_on', '>', new Date())
      .where('expires_on', '<', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
      .where('state', '!=', 'expired')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => Number(r.count));

    const assessmentsOverdue = await db
      .selectFrom('assessment')
      .where('due_date', '<', new Date())
      .where('state', '!=', 'complete')
      .where('state', '!=', 'cancelled')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => Number(r.count));

    // Completion rate
    const completionRate = totalAssessments > 0
      ? Math.round((assessmentsComplete / totalAssessments) * 100)
      : 0;

    res.json({
      totalProjects,
      projectsInProgress,
      totalAssessments,
      assessmentsInProgress,
      assessmentsComplete,
      totalEvidence,
      totalClaims,
      totalAttestations,
      totalStandards,
      evidenceExpiringSoon,
      assessmentsOverdue,
      completionRate,
    });
  } catch (error) {
    logger.error('Get dashboard stats error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/recent-assessments', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    const recentAssessments = await db
      .selectFrom('assessment')
      .innerJoin('project', 'project.id', 'assessment.project_id')
      .select([
        'assessment.id',
        'assessment.title',
        'assessment.state',
        'assessment.due_date',
        'assessment.created_at',
        'project.name as project_name',
      ])
      .orderBy('assessment.created_at', 'desc')
      .limit(5)
      .execute();

    res.json({
      data: recentAssessments,
    });
  } catch (error) {
    logger.error('Get recent assessments error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/upcoming-due-dates', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const now = new Date();

    const upcomingAssessments = await db
      .selectFrom('assessment')
      .innerJoin('project', 'project.id', 'assessment.project_id')
      .select([
        'assessment.id',
        'assessment.title',
        'assessment.due_date',
        'assessment.state',
        'project.name as project_name',
      ])
      .where('assessment.due_date', '>', now)
      .where('assessment.state', '!=', 'complete')
      .where('assessment.state', '!=', 'cancelled')
      .orderBy('assessment.due_date', 'asc')
      .limit(10)
      .execute();

    res.json({
      data: upcomingAssessments.map(a => {
        const dueDate = new Date(a.due_date as any);
        const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
          ...a,
          days_until_due: daysUntilDue,
        };
      }),
    });
  } catch (error) {
    logger.error('Get upcoming due dates error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Compliance coverage: per-standard breakdown of how many requirements are assessed
router.get('/compliance-coverage', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    const standards = await db
      .selectFrom('standard')
      .selectAll()
      .execute();

    const coverage = await Promise.all(
      standards.map(async (standard) => {
        const totalReqs = await db
          .selectFrom('requirement')
          .where('standard_id', '=', standard.id)
          .select(db.fn.count<number>('id').as('count'))
          .executeTakeFirstOrThrow()
          .then(r => Number(r.count));

        // Requirements that have at least one assessment_requirement with a result
        const assessedReqs = await db
          .selectFrom('assessment_requirement')
          .innerJoin('requirement', 'requirement.id', 'assessment_requirement.requirement_id')
          .where('requirement.standard_id', '=', standard.id)
          .where('assessment_requirement.result', 'is not', null)
          .select(db.fn.count<number>('assessment_requirement.id').as('count'))
          .executeTakeFirstOrThrow()
          .then(r => Number(r.count));

        const coveragePercent = totalReqs > 0 ? Math.round((assessedReqs / totalReqs) * 100) : 0;

        return {
          standardId: standard.id,
          standardName: standard.name,
          version: standard.version,
          totalRequirements: totalReqs,
          assessedRequirements: assessedReqs,
          coveragePercent,
        };
      })
    );

    res.json({ data: coverage });
  } catch (error) {
    logger.error('Get compliance coverage error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assessment state distribution
router.get('/assessment-distribution', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    const states = ['new', 'pending', 'in_progress', 'on_hold', 'cancelled', 'complete'];
    const distribution = await Promise.all(
      states.map(async (state) => {
        const count = await db
          .selectFrom('assessment')
          .where('state', '=', state as any)
          .select(db.fn.count<number>('id').as('count'))
          .executeTakeFirstOrThrow()
          .then(r => Number(r.count));
        return { state, count };
      })
    );

    res.json({ data: distribution });
  } catch (error) {
    logger.error('Get assessment distribution error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Evidence health: breakdown by state
router.get('/evidence-health', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    const states = ['in_review', 'in_progress', 'claimed', 'expired'];
    const health = await Promise.all(
      states.map(async (state) => {
        const count = await db
          .selectFrom('evidence')
          .where('state', '=', state as any)
          .select(db.fn.count<number>('id').as('count'))
          .executeTakeFirstOrThrow()
          .then(r => Number(r.count));
        return { state, count };
      })
    );

    const expiringSoon = await db
      .selectFrom('evidence')
      .where('expires_on', '>', new Date())
      .where('expires_on', '<', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
      .where('state', '!=', 'expired')
      .selectAll()
      .execute();

    res.json({
      data: health,
      expiringSoon: expiringSoon.map(e => ({
        id: e.id,
        name: e.name,
        expiresOn: e.expires_on,
        state: e.state,
      })),
    });
  } catch (error) {
    logger.error('Get evidence health error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Requirement conformance breakdown (pass/fail/NA across all assessment requirements)
router.get('/conformance-breakdown', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    const results = ['yes', 'no', 'na'];
    const breakdown = await Promise.all(
      results.map(async (result) => {
        const count = await db
          .selectFrom('assessment_requirement')
          .where('result', '=', result as any)
          .select(db.fn.count<number>('id').as('count'))
          .executeTakeFirstOrThrow()
          .then(r => Number(r.count));
        return { result, count };
      })
    );

    const unassessed = await db
      .selectFrom('assessment_requirement')
      .where('result', 'is', null)
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => Number(r.count));

    breakdown.push({ result: 'unassessed', count: unassessed });

    res.json({ data: breakdown });
  } catch (error) {
    logger.error('Get conformance breakdown error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Risk insights: blind spots, gaps, and warnings
router.get('/risk-insights', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const insights: Array<{ type: string; severity: string; title: string; detail: string }> = [];

    // Blind spots: standards linked to projects but with 0% assessment coverage
    const standards = await db
      .selectFrom('standard')
      .innerJoin('project_standard', 'project_standard.standard_id', 'standard.id')
      .select(['standard.id', 'standard.name', 'standard.version'])
      .groupBy(['standard.id', 'standard.name', 'standard.version'])
      .execute();

    for (const std of standards) {
      const totalReqs = await db
        .selectFrom('requirement')
        .where('standard_id', '=', std.id)
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirstOrThrow()
        .then(r => Number(r.count));

      const assessedReqs = await db
        .selectFrom('assessment_requirement')
        .innerJoin('requirement', 'requirement.id', 'assessment_requirement.requirement_id')
        .where('requirement.standard_id', '=', std.id)
        .where('assessment_requirement.result', 'is not', null)
        .select(db.fn.count<number>('assessment_requirement.id').as('count'))
        .executeTakeFirstOrThrow()
        .then(r => Number(r.count));

      if (totalReqs > 0 && assessedReqs === 0) {
        insights.push({
          type: 'blind_spot',
          severity: 'high',
          title: `${std.name}${std.version ? ' v' + std.version : ''} has no assessed requirements`,
          detail: `${totalReqs} requirements exist but none have been evaluated in any assessment.`,
        });
      }
    }

    // Overdue assessments that are still active
    const overdueAssessments = await db
      .selectFrom('assessment')
      .innerJoin('project', 'project.id', 'assessment.project_id')
      .where('assessment.due_date', '<', new Date())
      .where('assessment.state', '!=', 'complete')
      .where('assessment.state', '!=', 'cancelled')
      .select([
        'assessment.id',
        'assessment.title',
        'assessment.due_date',
        'project.name as project_name',
      ])
      .execute();

    for (const a of overdueAssessments) {
      const daysOverdue = Math.ceil((Date.now() - new Date(a.due_date as any).getTime()) / (1000 * 60 * 60 * 24));
      insights.push({
        type: 'overdue',
        severity: daysOverdue > 30 ? 'critical' : 'high',
        title: `"${a.title}" is ${daysOverdue} days overdue`,
        detail: `Project: ${a.project_name}. This assessment has missed its target completion date.`,
      });
    }

    // Completed assessments without attestations
    const completedWithoutAttestation = await db
      .selectFrom('assessment')
      .leftJoin('attestation', 'attestation.assessment_id', 'assessment.id')
      .innerJoin('project', 'project.id', 'assessment.project_id')
      .where('assessment.state', '=', 'complete')
      .where('attestation.id', 'is', null)
      .select([
        'assessment.id',
        'assessment.title',
        'project.name as project_name',
      ])
      .execute();

    for (const a of completedWithoutAttestation) {
      insights.push({
        type: 'gap',
        severity: 'medium',
        title: `"${a.title}" completed but not attested`,
        detail: `Project: ${a.project_name}. This assessment was completed but no attestation has been created yet.`,
      });
    }

    // Evidence approaching expiration (within 30 days)
    const expiringEvidence = await db
      .selectFrom('evidence')
      .where('expires_on', '>', new Date())
      .where('expires_on', '<', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
      .where('state', '!=', 'expired')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => Number(r.count));

    if (expiringEvidence > 0) {
      insights.push({
        type: 'expiring',
        severity: 'medium',
        title: `${expiringEvidence} evidence item${expiringEvidence > 1 ? 's' : ''} expiring within 30 days`,
        detail: 'Expired evidence may invalidate assessment results and attestations that depend on it.',
      });
    }

    // Projects with no assessments at all
    const projectsWithoutAssessments = await db
      .selectFrom('project')
      .leftJoin('assessment', 'assessment.project_id', 'project.id')
      .where('assessment.id', 'is', null)
      .where('project.state', '!=', 'retired')
      .select(['project.id', 'project.name'])
      .execute();

    for (const p of projectsWithoutAssessments) {
      insights.push({
        type: 'blind_spot',
        severity: 'medium',
        title: `Project "${p.name}" has no assessments`,
        detail: 'This project exists but has not been assessed against any standard.',
      });
    }

    // Sort by severity
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    insights.sort((a, b) => (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99));

    res.json({ data: insights });
  } catch (error) {
    logger.error('Get risk insights error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Project health overview: per-project summary for CISO view
router.get('/project-health', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    const projects = await db
      .selectFrom('project')
      .where('state', '!=', 'retired')
      .select(['id', 'name', 'state'])
      .execute();

    const projectHealth = await Promise.all(
      projects.map(async (project) => {
        const totalAssessments = await db
          .selectFrom('assessment')
          .where('project_id', '=', project.id)
          .select(db.fn.count<number>('id').as('count'))
          .executeTakeFirstOrThrow()
          .then(r => Number(r.count));

        const completedAssessments = await db
          .selectFrom('assessment')
          .where('project_id', '=', project.id)
          .where('state', '=', 'complete')
          .select(db.fn.count<number>('id').as('count'))
          .executeTakeFirstOrThrow()
          .then(r => Number(r.count));

        const overdueAssessments = await db
          .selectFrom('assessment')
          .where('project_id', '=', project.id)
          .where('due_date', '<', new Date())
          .where('state', '!=', 'complete')
          .where('state', '!=', 'cancelled')
          .select(db.fn.count<number>('id').as('count'))
          .executeTakeFirstOrThrow()
          .then(r => Number(r.count));

        const attestationCount = await db
          .selectFrom('attestation')
          .innerJoin('assessment', 'assessment.id', 'attestation.assessment_id')
          .where('assessment.project_id', '=', project.id)
          .select(db.fn.count<number>('attestation.id').as('count'))
          .executeTakeFirstOrThrow()
          .then(r => Number(r.count));

        const completionRate = totalAssessments > 0
          ? Math.round((completedAssessments / totalAssessments) * 100)
          : 0;

        return {
          id: project.id,
          name: project.name,
          state: project.state,
          totalAssessments,
          completedAssessments,
          overdueAssessments,
          attestationCount,
          completionRate,
        };
      })
    );

    res.json({ data: projectHealth });
  } catch (error) {
    logger.error('Get project health error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
