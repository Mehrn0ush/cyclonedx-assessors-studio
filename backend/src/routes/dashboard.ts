import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, handleValidationError } from '../utils/route-helpers.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import {
  countAll,
  countByColumn,
  countAssessmentsByState,
  countEvidenceByState,
  countEvidenceExpiringWithin,
  countOverdueAssessments,
  countAssessmentRequirementsByResult,
  countWhere,
} from '../utils/count-queries.js';
import {
  calculateAssessmentScore,
  calculateAverageConformance,
} from '../utils/assessment-scoring.js';

const router = Router();

router.get('/stats', requireAuth, asyncHandler(async (_req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();

  const [
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
  ] = await Promise.all([
    countAll(db, 'project'),
    countByColumn(db, 'project', 'state', 'in_progress'),
    countAll(db, 'assessment'),
    countAssessmentsByState(db, 'in_progress'),
    countAssessmentsByState(db, 'complete'),
    countAll(db, 'evidence'),
    countAll(db, 'claim'),
    countAll(db, 'attestation'),
    countAll(db, 'standard'),
    countEvidenceExpiringWithin(db, 30),
    countOverdueAssessments(db),
  ]);

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
}));

router.get('/recent-assessments', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
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
}));

router.get('/upcoming-due-dates', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
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
      const dueDate = new Date(String(a.due_date));
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return {
        ...a,
        days_until_due: daysUntilDue,
      };
    }),
  });
}));

// Compliance coverage: per-standard breakdown of how many requirements are assessed
router.get('/compliance-coverage', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
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
}));

// Assessment state distribution
router.get('/assessment-distribution', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();

  const states = ['new', 'pending', 'in_progress', 'on_hold', 'cancelled', 'complete', 'archived'] as const;
  const distribution = await Promise.all(
    states.map(async (state) => ({
      state,
      count: await countAssessmentsByState(db, state),
    }))
  );

  res.json({ data: distribution });
}));

// Evidence health: breakdown by state
router.get('/evidence-health', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();

  const states = ['in_review', 'in_progress', 'claimed', 'expired'] as const;
  const health = await Promise.all(
    states.map(async (state) => ({
      state,
      count: await countEvidenceByState(db, state),
    }))
  );

  const now = new Date();
  const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const expiringSoon = await db
    .selectFrom('evidence')
    .where('expires_on', '>', now)
    .where('expires_on', '<', expiryDate)
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
}));

// Requirement conformance breakdown (pass/fail/NA across all assessment requirements)
router.get('/conformance-breakdown', requireAuth, asyncHandler(async (_req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();

  const results = ['yes', 'no', 'partial', 'not_applicable'] as const;
  const breakdown: { result: string; count: number }[] = await Promise.all(
    results.map(async (result) => ({
      result,
      count: await countAssessmentRequirementsByResult(db, result),
    }))
  );

  const unassessed = await countWhere(db, 'assessment_requirement', (eb) =>
    eb('result', 'is', null),
  );
  breakdown.push({ result: 'unassessed', count: unassessed });

  res.json({ data: breakdown });
}));

// Risk insights: blind spots, gaps, and warnings
router.get('/risk-insights', requireAuth, asyncHandler(async (_req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const insights: { type: string; severity: string; title: string; detail: string }[] = [];

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
    const daysOverdue = Math.ceil((Date.now() - new Date(String(a.due_date)).getTime()) / (1000 * 60 * 60 * 24));
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
}));

// Project health overview: per-project summary for CISO view
router.get('/project-health', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
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
}));

// =============================================================================
// Dashboard Configuration CRUD
// =============================================================================

const widgetLayoutSchema = z.object({
  i: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  widgetType: z.string(),
  config: z.record(z.string(), z.any()).optional(),
});

const createDashboardSchema = z.object({
  name: z.string().min(1, 'Dashboard name is required'),
  description: z.string().nullable().optional(),
  is_shared: z.boolean().optional(),
  layout: z.array(widgetLayoutSchema),
});

const updateDashboardSchema = z.object({
  name: z.string().min(1, 'Dashboard name is required').optional(),
  description: z.string().nullable().optional(),
  is_shared: z.boolean().optional(),
  is_default: z.boolean().optional(),
  layout: z.array(widgetLayoutSchema).optional(),
});

// GET /configs - List all dashboards for the current user (owned + shared)
router.get('/configs', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const userId = req.user!.id;

  const dashboards = await db
    .selectFrom('dashboard')
    .where((eb) =>
      eb.or([
        eb('owner_id', '=', userId),
        eb('is_shared', '=', true),
      ])
    )
    .selectAll()
    .orderBy('is_default', 'desc')
    .orderBy('name', 'asc')
    .execute();

  res.json({ data: dashboards });
}));

// GET /configs/:id - Get a single dashboard config
router.get('/configs/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const userId = req.user!.id;

  const dashboard = await db
    .selectFrom('dashboard')
    .where('id', '=', req.params.id)
    .where((eb) =>
      eb.or([
        eb('owner_id', '=', userId),
        eb('is_shared', '=', true),
      ])
    )
    .selectAll()
    .executeTakeFirst();

  if (!dashboard) {
    res.status(404).json({ error: 'Dashboard not found' });
    return;
  }

  res.json(dashboard);
}));

// POST /configs - Create a new dashboard
router.post('/configs', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = createDashboardSchema.parse(req.body);
    const db = getDatabase();
    const userId = req.user!.id;
    const dashboardId = uuidv4();

    await db
      .insertInto('dashboard')
      .values({
        id: dashboardId,
        name: data.name,
        description: data.description || null,
        owner_id: userId,
        is_shared: data.is_shared || false,
        is_default: false,
        layout: JSON.stringify(data.layout),
      })
      .execute();

    const dashboard = await db
      .selectFrom('dashboard')
      .where('id', '=', dashboardId)
      .selectAll()
      .executeTakeFirstOrThrow();

    res.status(201).json(dashboard);
  } catch (error) {
    if (handleValidationError(res, error)) return;
    throw error;
  }
}));

// PUT /configs/:id - Update a dashboard (only owner can update)
router.put('/configs/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = updateDashboardSchema.parse(req.body);
    const db = getDatabase();
    const userId = req.user!.id;

    const existing = await db
      .selectFrom('dashboard')
      .where('id', '=', req.params.id)
      .where('owner_id', '=', userId)
      .selectAll()
      .executeTakeFirst();

    if (!existing) {
      res.status(404).json({ error: 'Dashboard not found or not owned by you' });
      return;
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.is_shared !== undefined) updates.is_shared = data.is_shared;
    if (data.layout !== undefined) updates.layout = JSON.stringify(data.layout);

    // Handle setting as default (unset all other defaults for this user)
    if (data.is_default === true) {
      await db
        .updateTable('dashboard')
        .set({ is_default: false })
        .where('owner_id', '=', userId)
        .execute();
      updates.is_default = true;
    } else if (data.is_default === false) {
      updates.is_default = false;
    }

    await db
      .updateTable('dashboard')
      .set(updates)
      .where('id', '=', req.params.id)
      .execute();

    const updated = await db
      .selectFrom('dashboard')
      .where('id', '=', req.params.id)
      .selectAll()
      .executeTakeFirstOrThrow();

    res.json(updated);
  } catch (error) {
    if (handleValidationError(res, error)) return;
    throw error;
  }
}));

// DELETE /configs/:id - Delete a dashboard (only owner can delete)
router.delete('/configs/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const userId = req.user!.id;

  const existing = await db
    .selectFrom('dashboard')
    .where('id', '=', req.params.id)
    .where('owner_id', '=', userId)
    .selectAll()
    .executeTakeFirst();

  if (!existing) {
    res.status(404).json({ error: 'Dashboard not found or not owned by you' });
    return;
  }

  await db
    .deleteFrom('dashboard')
    .where('id', '=', req.params.id)
    .execute();

  res.json({ message: 'Dashboard deleted successfully' });
}));

// =============================================================================
// Progress Tab Data
// =============================================================================

/**
 * GET /progress
 * Returns all data needed by the Progress tab:
 *   - summaryStats: aggregate counts and average conformance
 *   - standardsData: per-standard conformance bars with assessment history
 *   - timelineAssessments: flat list of assessments for the timeline table
 *
 * Optional query param: entityId (filter to a single entity)
 */
router.get('/progress', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const entityId = req.query.entityId as string | undefined;

  // ---- Summary Stats ----

  // Distinct entities that have at least one assessment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let entitiesAssessedQuery = db
    .selectFrom('assessment')
    .where('assessment.entity_id', 'is not', null)
    .select(db.fn.count<number>(
      // biome-ignore lint/suspicious/noExplicitAny: Kysely fn() requires any for DISTINCT wrapper
      db.fn('DISTINCT', ['assessment.entity_id'] as any) as any
    ).as('count'));
  if (entityId) {
    entitiesAssessedQuery = entitiesAssessedQuery.where('assessment.entity_id', '=', entityId);
  }
  const totalEntitiesAssessed = await entitiesAssessedQuery
    .executeTakeFirstOrThrow()
    .then(r => Number(r.count));

  // Active assessments (in_progress or pending)
  let activeQuery = db
    .selectFrom('assessment')
    .where('state', 'in', ['in_progress', 'pending', 'new']);
  if (entityId) {
    activeQuery = activeQuery.where('entity_id', '=', entityId);
  }
  const activeAssessments = await activeQuery
    .select(db.fn.count<number>('id').as('count'))
    .executeTakeFirstOrThrow()
    .then(r => Number(r.count));

  // Completed this quarter
  const now = new Date();
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  let completedQuery = db
    .selectFrom('assessment')
    .where('state', '=', 'complete')
    .where('updated_at', '>=', quarterStart);
  if (entityId) {
    completedQuery = completedQuery.where('entity_id', '=', entityId);
  }
  const completedThisQuarter = await completedQuery
    .select(db.fn.count<number>('id').as('count'))
    .executeTakeFirstOrThrow()
    .then(r => Number(r.count));

  // Average conformance: compute from assessment_requirement results
  const averageConformance = await calculateAverageConformance(db, entityId);

  // ---- Conformance by Standard ----

  // Get standards that have at least one assessment requirement result
  const standardsWithAssessments = await db
    .selectFrom('standard')
    .innerJoin('assessment', 'assessment.standard_id', 'standard.id')
    .innerJoin('assessment_requirement', 'assessment_requirement.assessment_id', 'assessment.id')
    .select(['standard.id', 'standard.name', 'standard.version'])
    .groupBy(['standard.id', 'standard.name', 'standard.version'])
    .execute();

  const standardsData = await Promise.all(
    standardsWithAssessments.map(async (std) => {
      // Get assessments for this standard
      let assessmentQuery = db
        .selectFrom('assessment')
        .leftJoin('entity', 'entity.id', 'assessment.entity_id')
        .where('assessment.standard_id', '=', std.id);
      if (entityId) {
        assessmentQuery = assessmentQuery.where('assessment.entity_id', '=', entityId);
      }

      const assessments = await assessmentQuery
        .select([
          'assessment.id',
          'assessment.title',
          'assessment.state',
          'assessment.updated_at',
          'entity.name as entity_name',
        ])
        .orderBy('assessment.updated_at', 'desc')
        .execute();

      // Compute per-assessment conformance scores
      const assessmentResults = await Promise.all(
        assessments.map(async (a) => {
          const reqs = await db
            .selectFrom('assessment_requirement')
            .where('assessment_id', '=', a.id)
            .where('result', 'is not', null)
            .where('result', '!=', 'not_applicable')
            .select('result')
            .execute();

          const score = await calculateAssessmentScore(db, a.id);

          return {
            id: a.id,
            title: a.title,
            entityName: a.entity_name || 'Unknown',
            score,
            hasResults: reqs.length > 0,
            completedDate: a.updated_at,
            state: a.state,
          };
        })
      );

      // Latest score is from the most recent assessment that has at least one scored requirement.
      // Assessments with no requirements evaluated yet are excluded from the headline score.
      const scoredResults = assessmentResults.filter(a => a.hasResults);
      const latestScore = scoredResults.length > 0 ? scoredResults[0].score : 0;

      return {
        id: std.id,
        name: std.name,
        version: std.version,
        latestScore,
        assessments: assessmentResults,
      };
    })
  );

  // Filter out standards with no assessments after entity filtering
  const filteredStandards = standardsData.filter(s => s.assessments.length > 0);

  // ---- Timeline Assessments ----

  let timelineQuery = db
    .selectFrom('assessment')
    .leftJoin('entity', 'entity.id', 'assessment.entity_id')
    .leftJoin('standard', 'standard.id', 'assessment.standard_id');
  if (entityId) {
    timelineQuery = timelineQuery.where('assessment.entity_id', '=', entityId);
  }

  const timelineRows = await timelineQuery
    .select([
      'assessment.id',
      'assessment.title',
      'assessment.state',
      'assessment.updated_at',
      'assessment.due_date',
      'entity.name as entity_name',
      'standard.name as standard_name',
      'standard.version as standard_version',
    ])
    .orderBy('assessment.updated_at', 'desc')
    .limit(20)
    .execute();

  const timelineAssessments = await Promise.all(
    timelineRows.map(async (a) => {
      const score = await calculateAssessmentScore(db, a.id);

      const stdLabel = a.standard_name
        ? `${a.standard_name}${a.standard_version ? ` ${a.standard_version}` : ''}`
        : 'Unknown';

      return {
        id: a.id,
        title: a.title,
        entityName: a.entity_name || 'Unknown',
        standardName: stdLabel,
        score,
        state: a.state,
        completedDate: a.updated_at,
      };
    })
  );

  // ---- Entities list for selector ----

  const entityList = await db
    .selectFrom('entity')
    .select(['id', 'name'])
    .orderBy('name', 'asc')
    .execute();

  res.json({
    summaryStats: {
      totalEntitiesAssessed,
      averageConformance,
      activeAssessments,
      completedThisQuarter,
    },
    standardsData: filteredStandards,
    timelineAssessments,
    entities: entityList,
  });
}));

export default router;
