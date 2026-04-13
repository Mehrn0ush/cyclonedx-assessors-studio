import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import type { AuthRequest } from '../middleware/auth.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { syncEntityTags, fetchTagsForEntities } from '../utils/tags.js';
import { toSnakeCase } from '../middleware/camelCase.js';
import { validatePagination } from '../utils/pagination.js';
import { asyncHandler, handleValidationError } from '../utils/route-helpers.js';

const router = Router();

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  state: z
    .enum(['new', 'in_progress', 'on_hold', 'complete', 'operational', 'retired'])
    .default('new'),
  standardIds: z.array(z.string()).min(1, 'At least one standard is required'),
  tags: z.array(z.string()).optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  state: z.enum(['new', 'in_progress', 'on_hold', 'complete', 'operational', 'retired']).optional(),
  standardIds: z.array(z.string()).min(1, 'At least one standard is required').optional(),
  tags: z.array(z.string()).optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

router.get('/', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const { limit, offset } = validatePagination(req.query);
  const state = req.query.state as string | undefined;

  let query = db.selectFrom('project').selectAll();

  if (state) {
    query = query.where('state', '=', state as 'new' | 'in_progress' | 'on_hold' | 'complete' | 'operational' | 'retired');
  }

  const total = await db
    .selectFrom('project')
    .select(db.fn.count<number>('id').as('count'))
    .executeTakeFirstOrThrow()
    .then(r => r.count);

  const projects = await query.limit(limit).offset(offset).execute();

  const projectIds = projects.map((p) => p.id);
  const tagsByProject = await fetchTagsForEntities(db, 'project_tag', 'project_id', projectIds);

  // Fetch standards per project for list view
  const standardsByProject: Record<string, { id: string; name: string; version: string | null }[]> = {};
  if (projectIds.length > 0) {
    const projectStandards = await db
      .selectFrom('project_standard')
      .innerJoin('standard', (join) =>
        join.onRef('standard.id', '=', 'project_standard.standard_id')
      )
      .where('project_standard.project_id', 'in', projectIds)
      .select([
        'project_standard.project_id as project_id',
        'standard.id as id',
        'standard.name as name',
        'standard.version as version',
      ])
      .execute() as { project_id: string; id: string; name: string; version: string | null }[];

    for (const ps of projectStandards) {
      if (!standardsByProject[ps.project_id]) standardsByProject[ps.project_id] = [];
      standardsByProject[ps.project_id].push({ id: ps.id, name: ps.name, version: ps.version });
    }
  }

  const projectsWithTags = projects.map((p) => ({
    ...p,
    tags: tagsByProject[p.id] || [],
    standards: standardsByProject[p.id] || [],
  }));

  res.json({
    data: projectsWithTags,
    pagination: {
      limit,
      offset,
      total,
    },
  });
}));

router.get('/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();

  const project = await db
    .selectFrom('project')
    .where('id', '=', req.params.id as string)
    .selectAll()
    .executeTakeFirst();

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const standards = (await db
    .selectFrom('project_standard')
    .innerJoin(
      'standard',
      (join) =>
        join.onRef(
          'standard.id',
          '=',
          'project_standard.standard_id'
        )
    )
    .where('project_standard.project_id', '=', req.params.id as string)
    .select([
      'standard.id as id',
      'standard.name as name',
      'standard.version as version',
      'standard.description as description',
    ])
    .execute()) as { id: string; name: string; version: string | null; description: string | null }[];

  const tagsByProject = await fetchTagsForEntities(db, 'project_tag', 'project_id', [req.params.id as string]);

  res.json({
    project,
    standards,
    tags: tagsByProject[req.params.id as string] ?? [],
  });
}));

router.post(
  '/',
  requireAuth,
  requirePermission('projects.create'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = createProjectSchema.parse(req.body);
      const db = getDatabase();
      const projectId = uuidv4();

      await db
        .insertInto('project')
        .values(toSnakeCase({
          id: projectId,
          name: data.name,
          description: data.description,
          state: data.state,
          startDate: data.startDate || null,
          dueDate: data.dueDate || null,
        }))
        .execute();

      if (data.standardIds && data.standardIds.length > 0) {
        await db
          .insertInto('project_standard')
          .values(
            data.standardIds.map(standardId => ({
              project_id: projectId,
              standard_id: standardId,
              created_at: new Date(),
            }))
          )
          .execute();
      }

      if (data.tags && data.tags.length > 0) {
        await syncEntityTags(db, 'project_tag', 'project_id', projectId, data.tags);
      }

      logger.info('Project created', {
        projectId,
        name: data.name,
        requestId: req.requestId,
      });

      res.status(201).json({
        id: projectId,
        name: data.name,
        description: data.description,
        state: data.state,
      });
    } catch (error) {
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

router.put(
  '/:id',
  requireAuth,
  requirePermission('projects.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = updateProjectSchema.parse(req.body);
      const db = getDatabase();

      const project = await db
        .selectFrom('project')
        .where('id', '=', req.params.id as string)
        .selectAll()
        .executeTakeFirst();

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const updateData: Record<string, unknown> = {};

      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.state !== undefined) updateData.state = data.state;
      if (data.startDate !== undefined) updateData.startDate = data.startDate || null;
      if (data.dueDate !== undefined) updateData.dueDate = data.dueDate || null;

      if (Object.keys(updateData).length > 0) {
        await db
          .updateTable('project')
          .set(toSnakeCase(updateData))
          .where('id', '=', req.params.id as string)
          .execute();
      }

      if (data.standardIds !== undefined) {
        await db.deleteFrom('project_standard').where('project_id', '=', req.params.id as string).execute();

        if (data.standardIds.length > 0) {
          await db
            .insertInto('project_standard')
            .values(
              data.standardIds.map(standardId => ({
                project_id: req.params.id as string,
                standard_id: standardId,
                created_at: new Date(),
              }))
            )
            .execute();
        }
      }

      if (data.tags !== undefined) {
        await syncEntityTags(db, 'project_tag', 'project_id', req.params.id as string, data.tags);
      }

      logger.info('Project updated', {
        projectId: req.params.id as string,
        requestId: req.requestId,
      });

      // Fetch and return the updated resource
      const updatedProject = await db
        .selectFrom('project')
        .where('id', '=', req.params.id as string)
        .selectAll()
        .executeTakeFirst();

      const standards = (await db
        .selectFrom('project_standard')
        .innerJoin(
          'standard',
          (join) =>
            join.onRef(
              'standard.id',
              '=',
              'project_standard.standard_id'
            )
        )
        .where('project_standard.project_id', '=', req.params.id as string)
        .select([
          'standard.id as id',
          'standard.name as name',
          'standard.version as version',
          'standard.description as description',
        ])
        .execute()) as { id: string; name: string; version: string | null; description: string | null }[];

      const tagsByProject = await fetchTagsForEntities(db, 'project_tag', 'project_id', [req.params.id as string]);

      res.json({
        ...updatedProject,
        standards,
        tags: tagsByProject[req.params.id as string] || [],
      });
    } catch (error) {
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('projects.delete'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();

    const project = await db
      .selectFrom('project')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    // Idempotent: if already deleted/retired, return 204
    if (!project || project.state === 'retired') {
      res.status(204).send();
      return;
    }

    await db
      .updateTable('project')
      .set({ state: 'retired' })
      .where('id', '=', req.params.id as string)
      .execute();

    logger.info('Project deleted', {
      projectId: req.params.id as string,
      requestId: req.requestId,
    });

    res.status(204).send();
  })
);

router.post(
  '/:id/archive',
  requireAuth,
  requirePermission('projects.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();

    const project = await db
      .selectFrom('project')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await db
      .updateTable('project')
      .set({
        state: 'retired',
        archived_at: new Date(),
      })
      .where('id', '=', req.params.id as string)
      .execute();

    logger.info('Project archived', {
      projectId: req.params.id as string,
      requestId: req.requestId,
    });

    res.json({ message: 'Project archived successfully' });
  })
);

// Project PDF export - returns project summary data
router.get(
  '/:id/export/summary',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();

    const project = await db
      .selectFrom('project')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Fetch standards
    const standards = (await db
      .selectFrom('project_standard')
      .innerJoin(
        'standard',
        (join) =>
          join.onRef(
            'standard.id',
            '=',
            'project_standard.standard_id'
          )
      )
      .where('project_standard.project_id', '=', req.params.id as string)
      .select([
        'standard.id as id',
        'standard.name as name',
        'standard.version as version',
        'standard.description as description',
      ])
      .execute()) as { id: string; name: string; version: string | null; description: string | null }[];

    // Fetch assessments
    const assessments = (await db
      .selectFrom('assessment')
      .where('project_id', '=', req.params.id as string)
      .selectAll()
      .execute()) as Record<string, unknown>[];

    // Fetch evidence count via assessment_requirement_evidence -> assessment_requirement -> assessment
    const assessmentIds = assessments.map((a) => (a as Record<string, unknown>).id as string);
    let evidenceCount = 0;
    let claimsCount = 0;
    let attestationsCount = 0;

    if (assessmentIds.length > 0) {
      const evidenceResult = await db
        .selectFrom('assessment_requirement_evidence')
        .innerJoin('assessment_requirement', 'assessment_requirement.id', 'assessment_requirement_evidence.assessment_requirement_id')
        .where('assessment_requirement.assessment_id', 'in', assessmentIds)
        .select(db.fn.count<number>('assessment_requirement_evidence.evidence_id').as('count'))
        .executeTakeFirst();
      evidenceCount = (evidenceResult as Record<string, unknown>)?.count as number || 0;

      const claimsResult = await db
        .selectFrom('attestation')
        .innerJoin('claim', 'claim.attestation_id', 'attestation.id')
        .where('attestation.assessment_id', 'in', assessmentIds)
        .select(db.fn.count<number>('claim.id').as('count'))
        .executeTakeFirst();
      claimsCount = (claimsResult as Record<string, unknown>)?.count as number || 0;

      const attestationsResult = await db
        .selectFrom('attestation')
        .where('assessment_id', 'in', assessmentIds)
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirst();
      attestationsCount = (attestationsResult as Record<string, unknown>)?.count as number || 0;
    }

    // Calculate conformance rate (placeholder logic)
    const completeAssessments = assessments.filter((a) => (a as Record<string, unknown>).state === 'complete').length;
    const conformanceRate = assessments.length > 0 ? Math.round((completeAssessments / assessments.length) * 100) : 0;

    res.json({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        state: project.state,
        created_at: project.created_at,
      },
      standards: standards.map(s => ({
        id: s.id,
        name: s.name,
        version: s.version,
      })),
      assessments: {
        total: assessments.length,
        complete: completeAssessments,
        in_progress: assessments.filter((a) => (a as Record<string, unknown>).state === 'in_progress').length,
      },
      evidence: {
        total: evidenceCount,
      },
      claims: {
        total: claimsCount,
      },
      attestations: {
        total: attestationsCount,
      },
      summary: {
        conformance_rate: conformanceRate,
        generated_at: new Date().toISOString(),
      },
    });
  })
);

/**
 * GET /api/v1/projects/:id/stats
 *
 * Returns aggregated metrics for a project's assessments, suitable for
 * rendering a project-level dashboard.
 */
router.get('/:id/stats', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const projectId = req.params.id as string;

  // Verify project exists
  const project = await db
    .selectFrom('project')
    .where('id', '=', projectId)
    .select(['id', 'state', 'start_date', 'due_date'])
    .executeTakeFirst();

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Fetch all assessments for this project
  const assessments = await db
    .selectFrom('assessment')
    .where('project_id', '=', projectId)
    .select([
      'id',
      'title',
      'state',
      'conformance_score',
      'due_date',
      'start_date',
      'end_date',
      'created_at',
    ])
    .execute() as Record<string, unknown>[];

  const assessmentIds = assessments.map((a) => (a as Record<string, unknown>).id as string);

  // --- Assessment completion ---
  const totalAssessments = assessments.length;
  const completedAssessments = assessments.filter((a) => (a as Record<string, unknown>).state === 'complete' || (a as Record<string, unknown>).state === 'archived').length;
  const inProgressAssessments = assessments.filter((a) => (a as Record<string, unknown>).state === 'in_progress').length;

  // --- Timeline tracking ---
  const now = new Date();
  const overdueAssessments = assessments.filter((a) => {
    const assessment = a as Record<string, unknown>;
    return assessment.due_date && new Date(assessment.due_date as string) < now && assessment.state !== 'complete' && assessment.state !== 'archived' && assessment.state !== 'cancelled';
  });
  const upcomingDueDates = assessments
    .filter((a) => {
      const assessment = a as Record<string, unknown>;
      return assessment.due_date && new Date(assessment.due_date as string) >= now && assessment.state !== 'complete' && assessment.state !== 'archived';
    })
    .sort((a, b) => new Date((a as Record<string, unknown>).due_date as string).getTime() - new Date((b as Record<string, unknown>).due_date as string).getTime())
    .slice(0, 5)
    .map((a) => {
      const assessment = a as Record<string, unknown>;
      return { id: assessment.id as string, title: assessment.title as string, dueDate: assessment.due_date, state: assessment.state };
    });

  // Earliest and latest due dates for the project timeline
  const allDueDates = assessments.filter((a) => (a as Record<string, unknown>).due_date).map((a) => new Date((a as Record<string, unknown>).due_date as string));
  const earliestDueDate = allDueDates.length > 0 ? new Date(Math.min(...allDueDates.map(d => d.getTime()))) : null;
  const latestDueDate = allDueDates.length > 0 ? new Date(Math.max(...allDueDates.map(d => d.getTime()))) : null;

  // --- Evidence coverage ---
  let totalRequirements = 0;
  let requirementsWithEvidence = 0;
  let totalEvidenceItems = 0;

  if (assessmentIds.length > 0) {
    // Count total requirements across all assessments
    const reqCounts = await db
      .selectFrom('assessment_requirement')
      .where('assessment_id', 'in', assessmentIds)
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow() as Record<string, unknown>;
    totalRequirements = Number(reqCounts.count);

    // Count requirements that have at least one evidence link
    const reqsWithEv = await db
      .selectFrom('assessment_requirement')
      .where('assessment_id', 'in', assessmentIds)
      .where('id', 'in',
        db.selectFrom('assessment_requirement_evidence')
          .select('assessment_requirement_id')
      )
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow() as Record<string, unknown>;
    requirementsWithEvidence = Number(reqsWithEv.count);

    // Count distinct evidence items linked to these assessments
    const evCount = await db
      .selectFrom('assessment_requirement_evidence')
      .innerJoin('assessment_requirement', (join) =>
        join.onRef('assessment_requirement.id', '=', 'assessment_requirement_evidence.assessment_requirement_id')
      )
      .where('assessment_requirement.assessment_id', 'in', assessmentIds)
      .select(db.fn.count<number>('assessment_requirement_evidence.evidence_id').distinct().as('count'))
      .executeTakeFirstOrThrow() as Record<string, unknown>;
    totalEvidenceItems = Number(evCount.count);
  }

  // --- Conformance scores ---
  const scoredAssessments = assessments
    .filter((a) => {
      const assessment = a as Record<string, unknown>;
      return assessment.conformance_score !== null && assessment.conformance_score !== undefined;
    })
    .map((a) => {
      const assessment = a as Record<string, unknown>;
      return {
        id: assessment.id as string,
        title: assessment.title as string,
        score: Number(assessment.conformance_score),
        state: assessment.state,
      };
    });

  const avgConformanceScore = scoredAssessments.length > 0
    ? scoredAssessments.reduce((sum, a) => sum + a.score, 0) / scoredAssessments.length
    : null;

  // --- Early warnings / gaps ---
  const warnings: { type: string; severity: 'critical' | 'warning' | 'info'; message: string; assessmentId?: string }[] = [];

  // Overdue assessments
  for (const a of overdueAssessments) {
    const assessment = a as Record<string, unknown>;
    const daysOverdue = Math.ceil((now.getTime() - new Date(assessment.due_date as string).getTime()) / (1000 * 60 * 60 * 24));
    warnings.push({
      type: 'overdue',
      severity: daysOverdue > 30 ? 'critical' : 'warning',
      message: `"${assessment.title}" is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} past due`,
      assessmentId: assessment.id as string,
    });
  }

  // Assessments with no requirements
  if (assessmentIds.length > 0) {
    const assessmentReqCounts = await db
      .selectFrom('assessment_requirement')
      .where('assessment_id', 'in', assessmentIds)
      .groupBy('assessment_id')
      .select(['assessment_id', db.fn.count<number>('id').as('count')])
      .execute() as Record<string, unknown>[];

    const assessmentReqMap = new Map(assessmentReqCounts.map((r) => [(r as Record<string, unknown>).assessment_id as string, Number((r as Record<string, unknown>).count)]));

    for (const a of assessments) {
      const assessment = a as Record<string, unknown>;
      if (assessment.state !== 'cancelled' && assessment.state !== 'archived') {
        const reqCount = assessmentReqMap.get(assessment.id as string) || 0;
        if (reqCount === 0 && assessment.state !== 'new') {
          warnings.push({
            type: 'no_requirements',
            severity: 'warning',
            message: `"${assessment.title}" has no requirements linked`,
            assessmentId: assessment.id as string,
          });
        }
      }
    }
  }

  // Assessment due dates exceeding project due date
  if (project.due_date) {
    const projectDue = new Date(project.due_date);
    for (const a of assessments) {
      const assessment = a as Record<string, unknown>;
      if (assessment.due_date && new Date(assessment.due_date as string) > projectDue && assessment.state !== 'complete' && assessment.state !== 'archived' && assessment.state !== 'cancelled') {
        warnings.push({
          type: 'exceeds_project_deadline',
          severity: 'warning',
          message: `"${assessment.title}" due date extends past the project deadline`,
          assessmentId: assessment.id as string,
        });
      }
    }
  }

  // Low evidence coverage warning
  const evidenceCoveragePercent = totalRequirements > 0
    ? (requirementsWithEvidence / totalRequirements) * 100
    : null;

  if (evidenceCoveragePercent !== null && evidenceCoveragePercent < 50 && inProgressAssessments > 0) {
    warnings.push({
      type: 'low_evidence_coverage',
      severity: 'warning',
      message: `Evidence coverage is ${evidenceCoveragePercent.toFixed(0)}% across all assessments`,
    });
  }

  // Low conformance scores (score is stored as 0-100)
  for (const a of scoredAssessments) {
    if (a.score < 50 && a.state !== 'new') {
      warnings.push({
        type: 'low_conformance',
        severity: 'warning',
        message: `"${a.title}" has a conformance score of ${a.score.toFixed(0)}%`,
        assessmentId: a.id,
      });
    }
  }

  // Per-assessment breakdown for the dashboard table
  const assessmentBreakdown = assessments.map((a) => {
    const assessment = a as Record<string, unknown>;
    return {
      id: assessment.id,
      title: assessment.title,
      state: assessment.state,
      startDate: assessment.start_date,
      dueDate: assessment.due_date,
      conformanceScore: assessment.conformance_score !== null ? Number(assessment.conformance_score) : null,
    };
  });

  res.json({
    assessmentCompletion: {
      total: totalAssessments,
      completed: completedAssessments,
      inProgress: inProgressAssessments,
      percent: totalAssessments > 0 ? Math.round((completedAssessments / totalAssessments) * 100) : 0,
    },
    timeline: {
      projectStartDate: project.start_date || null,
      projectDueDate: project.due_date || null,
      overdue: overdueAssessments.length,
      upcomingDueDates,
      earliestDueDate,
      latestDueDate,
    },
    evidenceCoverage: {
      totalRequirements,
      requirementsWithEvidence,
      totalEvidenceItems,
      percent: totalRequirements > 0 ? Math.round((requirementsWithEvidence / totalRequirements) * 100) : null,
    },
    conformance: {
      averageScore: avgConformanceScore,
      assessments: scoredAssessments,
    },
    warnings,
    assessmentBreakdown,
  });
}));

export default router;
