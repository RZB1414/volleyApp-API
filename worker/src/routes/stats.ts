import { Hono, type Context } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../types';
import { requireAuth, getRequestUser } from '../middleware/auth';
import {
  DuplicateMatchReportError,
  findMatchReportByMatchId,
  insertMatchReport,
  listMatchReports,
  deleteMatchReport
} from '../services/matchReport.service';

const statsRouter = new Hono<AppEnv>();

const statsRecordSchema = z.record(z.string().min(1), z.union([z.string(), z.number()]));

const playerSchema = z.object({
  number: z.number().int().min(0).max(999),
  name: z.string().trim().min(1, 'Player name is required'),
  stats: statsRecordSchema
});

const teamSchema = z.object({
  team: z.string().trim().min(1, 'Team name is required'),
  players: z.array(playerSchema).nonempty('At least one player is required')
});

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const matchReportSchema = z
  .object({
    generatedAt: z.string().datetime({ message: 'generatedAt must be an ISO date-time string' }),
    setColumns: z.number().int().positive(),
    columnLabels: z.array(z.string().trim().min(1)).min(1),
    matchDate: z.string().regex(dateRegex, 'matchDate must be YYYY-MM-DD').optional().nullable(),
    matchTime: z.string().regex(timeRegex, 'matchTime must be HH:mm').optional().nullable(),
    teams: z.array(teamSchema).min(1, 'At least one team must be provided')
  })
  .superRefine((data, ctx) => {
    if (data.columnLabels.length < data.setColumns) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['columnLabels'],
        message: 'columnLabels must include at least setColumns entries'
      });
    }
  });

const matchIdParamSchema = z.object({
  matchId: z.string().uuid({ message: 'matchId must be a valid UUID' })
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  ownerId: z.string().trim().min(1, 'ownerId must be a non-empty string').optional()
});

statsRouter.post('/stats/match-report', requireAuth, async (c: Context<AppEnv>) => {
  try {
    const payload = matchReportSchema.parse(await c.req.json());
    const user = getRequestUser(c);

    if (!user) {
      return c.json({ message: 'Authentication required' }, 401);
    }

    const record = await insertMatchReport(c.env, payload, { ownerId: user.id });
    return c.json({ matchId: record?.matchId, ownerId: record?.ownerId }, 201);
  } catch (error) {
    if (error instanceof DuplicateMatchReportError) {
      return c.json(
        {
          message: 'A match report already exists for this date and team combination',
          matchId: error.matchId
        },
        409
      );
    }

    if (error instanceof z.ZodError) {
      return c.json({ message: 'Invalid payload', errors: error.flatten() }, 400);
    }

    console.error('Failed to create match report', error);
    return c.json({ message: 'Failed to create match report' }, 500);
  }
});

statsRouter.get('/stats/match-report/:matchId', async (c: Context<AppEnv>) => {
  try {
    const { matchId } = matchIdParamSchema.parse(c.req.param());
    const report = await findMatchReportByMatchId(c.env, matchId);

    if (!report) {
      return c.json({ message: 'Match report not found' }, 404);
    }

    return c.json(report);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ message: 'Invalid request', errors: error.flatten() }, 400);
    }

    console.error('Failed to fetch match report', error);
    return c.json({ message: 'Failed to fetch match report' }, 500);
  }
});

statsRouter.get('/stats/match-report', async (c: Context<AppEnv>) => {
  try {
    const { limit, ownerId } = listQuerySchema.parse(c.req.query());
    const reports = await listMatchReports(c.env, { limit: limit ?? 50, ownerId });

    return c.json({ items: reports });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ message: 'Invalid request', errors: error.flatten() }, 400);
    }

    console.error('Failed to list match reports', error);
    return c.json({ message: 'Failed to list match reports' }, 500);
  }
});

statsRouter.delete('/stats/match-report/:matchId', requireAuth, async (c: Context<AppEnv>) => {
  try {
    const user = getRequestUser(c);
    if (!user) {
      return c.json({ message: 'Authentication required' }, 401);
    }

    const { matchId } = matchIdParamSchema.parse(c.req.param());
    const result = await deleteMatchReport(c.env, matchId, { ownerId: user.id });

    if (!result.ok) {
      if (result.code === 'not-found') {
        return c.json({ message: 'Match report not found' }, 404);
      }

      if (result.code === 'forbidden') {
        return c.json({ message: 'You cannot delete this match report' }, 403);
      }
    }

    return c.json({ message: 'Match report deleted' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ message: 'Invalid request', errors: error.flatten() }, 400);
    }

    console.error('Failed to delete match report', error);
    return c.json({ message: 'Failed to delete match report' }, 500);
  }
});

export function registerStatsRoutes(app: Hono<AppEnv>) {
  app.route('/', statsRouter);
}
