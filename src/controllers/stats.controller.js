import { z } from 'zod';

import {
  findMatchReportByMatchId,
  insertMatchReport,
  listMatchReports,
  DuplicateMatchReportError
} from '../models/matchReport.model.js';

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

export async function createMatchReport(req, res, next) {
  try {
    const payload = matchReportSchema.parse(req.body);
    const ownerId = req.user?.id;

    if (!ownerId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const record = await insertMatchReport(payload, { ownerId });

    return res.status(201).json({ matchId: record.matchId, ownerId: record.ownerId });
  } catch (error) {
    if (error instanceof DuplicateMatchReportError) {
      return res.status(409).json({
        message: 'A match report already exists for this date and team combination',
        matchId: error.matchId
      });
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Invalid payload',
        errors: error.flatten()
      });
    }

    return next(error);
  }
}

export async function getMatchReport(req, res, next) {
  try {
    const { matchId } = matchIdParamSchema.parse(req.params);
    const report = await findMatchReportByMatchId(matchId);

    if (!report) {
      return res.status(404).json({ message: 'Match report not found' });
    }

    return res.json(report);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Invalid request',
        errors: error.flatten()
      });
    }

    return next(error);
  }
}

export async function listMatchReportsController(req, res, next) {
  try {
    const { limit, ownerId } = listQuerySchema.parse(req.query);
    const reports = await listMatchReports({ limit: limit ?? 50, ownerId });

    return res.json({ items: reports });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Invalid request',
        errors: error.flatten()
      });
    }

    return next(error);
  }
}
