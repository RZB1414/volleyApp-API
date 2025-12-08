import { randomUUID } from 'node:crypto';

import {
  deleteObject,
  putJsonObject,
  getJsonObject,
  listObjects
} from '../services/jsonStore.service.js';

const MATCH_REPORT_DATA_PREFIX = 'matchReports/data';
const MATCH_REPORT_DATA_FOLDER = `${MATCH_REPORT_DATA_PREFIX}/`;
const MATCH_REPORT_INDEX_PREFIX = 'matchReports/by-match-id';
const MATCH_REPORT_SIGNATURE_PREFIX = 'matchReports/by-signature';
const MAX_TIMESTAMP = 9999999999999;

function buildIndexKey(matchId) {
  return `${MATCH_REPORT_INDEX_PREFIX}/${matchId}.json`;
}

function buildDataKey(createdAt, matchId) {
  const inverted = (MAX_TIMESTAMP - createdAt.getTime()).toString().padStart(13, '0');
  return `${MATCH_REPORT_DATA_FOLDER}${inverted}_${matchId}.json`;
}

function buildSignatureKey(signature) {
  return `${MATCH_REPORT_SIGNATURE_PREFIX}/${signature}.json`;
}

function parseStoredDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeMatchDate(matchDate) {
  if (!matchDate) {
    return null;
  }

  const parsed = new Date(matchDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeOwnerId(ownerId) {
  if (ownerId === undefined || ownerId === null) {
    return null;
  }

  const normalized = `${ownerId}`.trim();
  return normalized.length === 0 ? null : normalized;
}

function normalizeStats(stats) {
  return Object.entries(stats).reduce((acc, [key, value]) => {
    acc[key] = value === undefined || value === null ? '' : String(value);
    return acc;
  }, {});
}

function normalizeTeams(teams) {
  return teams.map((team) => ({
    team: team.team,
    players: team.players.map((player) => ({
      number: player.number,
      name: player.name,
      stats: normalizeStats(player.stats)
    }))
  }));
}

function normalizeSignatureTeamName(name) {
  if (!name) {
    return null;
  }

  const trimmed = name.trim();
  return trimmed.length === 0 ? null : trimmed.toLowerCase();
}

function buildMatchSignature(matchDate, teams) {
  const normalizedDate = normalizeMatchDate(matchDate)?.toISOString()?.slice(0, 10);
  if (!normalizedDate) {
    return null;
  }

  const normalizedTeamNames = (teams ?? [])
    .map((team) => normalizeSignatureTeamName(team.team))
    .filter(Boolean)
    .sort();

  if (normalizedTeamNames.length === 0) {
    return null;
  }

  return `${normalizedDate}__${normalizedTeamNames.join('__')}`;
}

function isPreconditionFailed(error) {
  return error?.$metadata?.httpStatusCode === 412;
}

export class DuplicateMatchReportError extends Error {
  constructor(matchId) {
    super('Match report already exists for this date and team combination');
    this.name = 'DuplicateMatchReportError';
    this.matchId = matchId ?? null;
  }
}

function mapMatchReport(doc) {
  if (!doc) {
    return null;
  }

  return {
    id: doc.id ?? doc.matchId,
    matchId: doc.matchId,
    generatedAt: parseStoredDate(doc.generatedAt),
    matchDate: parseStoredDate(doc.matchDate),
    matchTime: doc.matchTime ?? null,
    setColumns: doc.setColumns,
    columnLabels: doc.columnLabels,
    teams: doc.teams,
    createdAt: parseStoredDate(doc.createdAt),
    ownerId: doc.ownerId ?? null
  };
}

export async function insertMatchReport(payload, { ownerId } = {}) {
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  if (!normalizedOwnerId) {
    throw new Error('ownerId is required to insert match reports');
  }

  const createdAt = new Date();
  const matchId = randomUUID();
  const dataKey = buildDataKey(createdAt, matchId);
  const signature = buildMatchSignature(payload.matchDate, payload.teams);
  const signatureKey = signature ? buildSignatureKey(signature) : null;
  let signatureReserved = false;

  const doc = {
    id: matchId,
    matchId,
    generatedAt: new Date(payload.generatedAt).toISOString(),
    matchDate: normalizeMatchDate(payload.matchDate)?.toISOString() ?? null,
    matchTime: payload.matchTime ?? null,
    setColumns: payload.setColumns,
    columnLabels: payload.columnLabels,
    teams: normalizeTeams(payload.teams),
    createdAt: createdAt.toISOString(),
    ownerId: normalizedOwnerId
  };

  if (signatureKey) {
    try {
      await putJsonObject(signatureKey, { key: dataKey, matchId }, { ifNoneMatch: '*' });
      signatureReserved = true;
    } catch (error) {
      if (isPreconditionFailed(error)) {
        const duplicate = await getJsonObject(signatureKey);
        throw new DuplicateMatchReportError(duplicate?.matchId);
      }

      throw error;
    }
  }

  try {
    await putJsonObject(dataKey, doc);
    await putJsonObject(buildIndexKey(matchId), { key: dataKey });
  } catch (error) {
    if (signatureReserved) {
      try {
        await deleteObject(signatureKey);
      } catch (cleanupError) {
        console.warn('Failed to cleanup duplicate signature key', cleanupError);
      }
    }

    throw error;
  }

  return mapMatchReport(doc);
}

export async function findMatchReportByMatchId(matchId) {
  const index = await getJsonObject(buildIndexKey(matchId));
  if (!index?.key) {
    return null;
  }

  const doc = await getJsonObject(index.key);
  return mapMatchReport(doc);
}

export async function listMatchReports({ limit = 50, ownerId } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 50, 200));
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  const { Contents = [] } = await listObjects({
    prefix: MATCH_REPORT_DATA_FOLDER,
    maxKeys: normalizedLimit
  });

  const reports = await Promise.all(Contents.map((object) => getJsonObject(object.Key)));
  return reports
    .map(mapMatchReport)
    .filter(Boolean)
    .filter((report) => (normalizedOwnerId ? report.ownerId === normalizedOwnerId : true));
}
