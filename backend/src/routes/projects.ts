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
  workflowType: z.enum(['claims_driven', 'evidence_driven']).default('evidence_driven'),
  standardIds: z.array(z.string()).min(1, 'At least one standard is required'),
  tags: z.array(z.string()).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  state: z.enum(['new', 'in_progress', 'on_hold', 'complete', 'operational', 'retired']).optional(),
  workflowType: z.enum(['claims_driven', 'evidence_driven']).optional(),
  standardIds: z.array(z.string()).min(1, 'At least one standard is required').optional(),
  tags: z.array(z.string()).optional(),
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
          workflowType: data.workflowType,
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
        workflowType: data.workflowType,
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
      if (data.workflowType !== undefined) updateData.workflowType = data.workflowType;

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
          workflow_type: project.workflow_type,
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

export default router;
