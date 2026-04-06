import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.js';
import { syncEntityTags, fetchTagsForEntities } from '../utils/tags.js';
import { toSnakeCase } from '../middleware/camelCase.js';

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

router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const state = req.query.state as string | undefined;

    let query = db.selectFrom('project').selectAll();

    if (state) {
      query = query.where('state', '=', state as any);
    }

    const total = await db
      .selectFrom('project')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => r.count);

    const projects = await query.limit(limit).offset(offset).execute();

    const projectIds = projects.map((p: any) => p.id);
    const tagsByProject = await fetchTagsForEntities(db, 'project_tag', 'project_id', projectIds);

    // Fetch standards per project for list view
    let standardsByProject: Record<string, { id: string; name: string; version: string | null }[]> = {};
    if (projectIds.length > 0) {
      const projectStandards = await db
        .selectFrom('project_standard')
        .innerJoin('standard', (join) =>
          join.onRef('standard.id' as any, '=', 'project_standard.standard_id' as any)
        )
        .where('project_standard.project_id', 'in', projectIds)
        .select([
          'project_standard.project_id as project_id',
          'standard.id as id',
          'standard.name as name',
          'standard.version as version',
        ])
        .execute() as any[];

      for (const ps of projectStandards) {
        if (!standardsByProject[ps.project_id]) standardsByProject[ps.project_id] = [];
        standardsByProject[ps.project_id].push({ id: ps.id, name: ps.name, version: ps.version });
      }
    }

    const projectsWithTags = projects.map((p: any) => ({
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
  } catch (error) {
    logger.error('Get projects error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    const project = await db
      .selectFrom('project')
      .where('id', '=', req.params.id)
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
            'standard.id' as any,
            '=',
            'project_standard.standard_id' as any
          )
      )
      .where('project_standard.project_id', '=', req.params.id)
      .select([
        'standard.id as id',
        'standard.name as name',
        'standard.version as version',
        'standard.description as description',
      ])
      .execute()) as any[];

    const tagsByProject = await fetchTagsForEntities(db, 'project_tag', 'project_id', [req.params.id]);

    res.json({
      project,
      standards,
      tags: tagsByProject[req.params.id] || [],
    });
  } catch (error) {
    logger.error('Get project error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
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
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Create project error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.put(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = updateProjectSchema.parse(req.body);
      const db = getDatabase();

      const project = await db
        .selectFrom('project')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const updateData: any = {};

      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.state !== undefined) updateData.state = data.state;
      if (data.startDate !== undefined) updateData.startDate = data.startDate || null;
      if (data.dueDate !== undefined) updateData.dueDate = data.dueDate || null;

      if (Object.keys(updateData).length > 0) {
        await db
          .updateTable('project')
          .set(toSnakeCase(updateData))
          .where('id', '=', req.params.id)
          .execute();
      }

      if (data.standardIds !== undefined) {
        await db.deleteFrom('project_standard').where('project_id', '=', req.params.id).execute();

        if (data.standardIds.length > 0) {
          await db
            .insertInto('project_standard')
            .values(
              data.standardIds.map(standardId => ({
                project_id: req.params.id,
                standard_id: standardId,
                created_at: new Date(),
              }))
            )
            .execute();
        }
      }

      if (data.tags !== undefined) {
        await syncEntityTags(db, 'project_tag', 'project_id', req.params.id, data.tags);
      }

      logger.info('Project updated', {
        projectId: req.params.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Project updated successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Update project error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const project = await db
        .selectFrom('project')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      await db
        .updateTable('project')
        .set({ state: 'retired' })
        .where('id', '=', req.params.id)
        .execute();

      logger.info('Project deleted', {
        projectId: req.params.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Project deleted successfully' });
    } catch (error) {
      logger.error('Delete project error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/:id/archive',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const project = await db
        .selectFrom('project')
        .where('id', '=', req.params.id)
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
        .where('id', '=', req.params.id)
        .execute();

      logger.info('Project archived', {
        projectId: req.params.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Project archived successfully' });
    } catch (error) {
      logger.error('Archive project error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Project PDF export - returns project summary data
router.get(
  '/:id/export/summary',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const project = await db
        .selectFrom('project')
        .where('id', '=', req.params.id)
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
              'standard.id' as any,
              '=',
              'project_standard.standard_id' as any
            )
        )
        .where('project_standard.project_id', '=', req.params.id)
        .select([
          'standard.id as id',
          'standard.name as name',
          'standard.version as version',
          'standard.description as description',
        ])
        .execute()) as any[];

      // Fetch assessments
      const assessments = (await db
        .selectFrom('assessment')
        .where('project_id', '=', req.params.id)
        .selectAll()
        .execute()) as any[];

      // Fetch evidence count via assessment_requirement_evidence -> assessment_requirement -> assessment
      const assessmentIds = assessments.map((a: any) => a.id);
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
        evidenceCount = (evidenceResult as any)?.count || 0;

        const claimsResult = await db
          .selectFrom('attestation')
          .innerJoin('claim', 'claim.attestation_id', 'attestation.id')
          .where('attestation.assessment_id', 'in', assessmentIds)
          .select(db.fn.count<number>('claim.id').as('count'))
          .executeTakeFirst();
        claimsCount = (claimsResult as any)?.count || 0;

        const attestationsResult = await db
          .selectFrom('attestation')
          .where('assessment_id', 'in', assessmentIds)
          .select(db.fn.count<number>('id').as('count'))
          .executeTakeFirst();
        attestationsCount = (attestationsResult as any)?.count || 0;
      }

      // Calculate conformance rate (placeholder logic)
      const completeAssessments = assessments.filter((a: any) => a.state === 'complete').length;
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
          in_progress: assessments.filter((a: any) => a.state === 'in_progress').length,
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
    } catch (error) {
      logger.error('Get project summary error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/v1/projects/:id/stats
 *
 * Returns aggregated metrics for a project's assessments, suitable for
 * rendering a project-level dashboard.
 */
router.get('/:id/stats', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const projectId = req.params.id;

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
      .execute() as any[];

    const assessmentIds = assessments.map((a: any) => a.id);

    // --- Assessment completion ---
    const totalAssessments = assessments.length;
    const completedAssessments = assessments.filter((a: any) => a.state === 'complete' || a.state === 'archived').length;
    const inProgressAssessments = assessments.filter((a: any) => a.state === 'in_progress').length;

    // --- Timeline tracking ---
    const now = new Date();
    const overdueAssessments = assessments.filter((a: any) =>
      a.due_date && new Date(a.due_date) < now && a.state !== 'complete' && a.state !== 'archived' && a.state !== 'cancelled'
    );
    const upcomingDueDates = assessments
      .filter((a: any) => a.due_date && new Date(a.due_date) >= now && a.state !== 'complete' && a.state !== 'archived')
      .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .slice(0, 5)
      .map((a: any) => ({ id: a.id, title: a.title, dueDate: a.due_date, state: a.state }));

    // Earliest and latest due dates for the project timeline
    const allDueDates = assessments.filter((a: any) => a.due_date).map((a: any) => new Date(a.due_date));
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
        .executeTakeFirstOrThrow() as any;
      totalRequirements = Number(reqCounts.count);

      // Count requirements that have at least one evidence link
      const reqsWithEv = await db
        .selectFrom('assessment_requirement')
        .where('assessment_id', 'in', assessmentIds)
        .where('id', 'in',
          db.selectFrom('assessment_requirement_evidence' as any)
            .select('assessment_requirement_id' as any)
        )
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirstOrThrow() as any;
      requirementsWithEvidence = Number(reqsWithEv.count);

      // Count distinct evidence items linked to these assessments
      const evCount = await db
        .selectFrom('assessment_requirement_evidence' as any)
        .innerJoin('assessment_requirement', (join: any) =>
          join.onRef('assessment_requirement.id', '=', 'assessment_requirement_evidence.assessment_requirement_id')
        )
        .where('assessment_requirement.assessment_id', 'in', assessmentIds)
        .select(db.fn.count<number>('assessment_requirement_evidence.evidence_id' as any).distinct().as('count'))
        .executeTakeFirstOrThrow() as any;
      totalEvidenceItems = Number(evCount.count);
    }

    // --- Conformance scores ---
    const scoredAssessments = assessments
      .filter((a: any) => a.conformance_score !== null && a.conformance_score !== undefined)
      .map((a: any) => ({
        id: a.id,
        title: a.title,
        score: Number(a.conformance_score),
        state: a.state,
      }));

    const avgConformanceScore = scoredAssessments.length > 0
      ? scoredAssessments.reduce((sum, a) => sum + a.score, 0) / scoredAssessments.length
      : null;

    // --- Early warnings / gaps ---
    const warnings: { type: string; severity: 'critical' | 'warning' | 'info'; message: string; assessmentId?: string }[] = [];

    // Overdue assessments
    for (const a of overdueAssessments) {
      const daysOverdue = Math.ceil((now.getTime() - new Date(a.due_date).getTime()) / (1000 * 60 * 60 * 24));
      warnings.push({
        type: 'overdue',
        severity: daysOverdue > 30 ? 'critical' : 'warning',
        message: `"${a.title}" is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} past due`,
        assessmentId: a.id,
      });
    }

    // Assessments with no requirements
    if (assessmentIds.length > 0) {
      const assessmentReqCounts = await db
        .selectFrom('assessment_requirement')
        .where('assessment_id', 'in', assessmentIds)
        .groupBy('assessment_id')
        .select(['assessment_id', db.fn.count<number>('id').as('count')])
        .execute() as any[];

      const assessmentReqMap = new Map(assessmentReqCounts.map((r: any) => [r.assessment_id, Number(r.count)]));

      for (const a of assessments) {
        if (a.state !== 'cancelled' && a.state !== 'archived') {
          const reqCount = assessmentReqMap.get(a.id) || 0;
          if (reqCount === 0 && a.state !== 'new') {
            warnings.push({
              type: 'no_requirements',
              severity: 'warning',
              message: `"${a.title}" has no requirements linked`,
              assessmentId: a.id,
            });
          }
        }
      }
    }

    // Assessment due dates exceeding project due date
    if (project.due_date) {
      const projectDue = new Date(project.due_date);
      for (const a of assessments) {
        if (a.due_date && new Date(a.due_date) > projectDue && a.state !== 'complete' && a.state !== 'archived' && a.state !== 'cancelled') {
          warnings.push({
            type: 'exceeds_project_deadline',
            severity: 'warning',
            message: `"${a.title}" due date extends past the project deadline`,
            assessmentId: a.id,
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
    const assessmentBreakdown = assessments.map((a: any) => ({
      id: a.id,
      title: a.title,
      state: a.state,
      startDate: a.start_date,
      dueDate: a.due_date,
      conformanceScore: a.conformance_score !== null ? Number(a.conformance_score) : null,
    }));

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
  } catch (error) {
    logger.error('Get project stats error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
