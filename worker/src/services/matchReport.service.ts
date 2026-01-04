import { list as listObjects } from './r2.service';
import { deleteJSON, readJSON, writeJSON } from './jsonStore.service';
import type { AppBindings } from '../types';

const MATCH_REPORT_DATA_PREFIX = 'matchReports/data';
const MATCH_REPORT_DATA_FOLDER = `${MATCH_REPORT_DATA_PREFIX}/`;
const MATCH_REPORT_INDEX_PREFIX = 'matchReports/by-match-id';
const MATCH_REPORT_SIGNATURE_PREFIX = 'matchReports/by-signature';
const MAX_TIMESTAMP = 9999999999999;

export type Coordinate = {
  x: number | null;
  y: number | null;
};

export type Action = {
  action_id: string; // unique ID for the action (uuid or index-based)
  set: number;
  rally: number; // calculated if possible, or just sequential index
  timestamp: string; // "YYYY-MM-DD HH:MM:SS"
  video_file_number?: number;
  video_time?: number;
  fundamental: string; // "attack" | "serve" | "reception" | "set" | "block" | "defense" | "error" | "freeball"
  subtype: string; // "Hard spike", "Float serve", etc.
  start_zone: number | null;
  start_coordinates: Coordinate;
  end_zone: number | null;
  end_coordinates: Coordinate;
  trajectory: string | null;
  block_touches: number | null; // e.g. 0, 1, 2, 3
  block_contact: string | null; // "None", "Touch", etc.
  quality: string; // "Perfect", "Positive", "Error", etc.
  result: string; // "point" | "continuation" | "error" | "defended"
  score_home_at_action?: number;
  score_visiting_at_action?: number;
  notes: string;
};

export type Player = {
  player_id: string;
  name: string;
  number: number;
  position: string; // "outside", "middle", "setter", "opposite", "libero"
  actions: Action[];
};

export type Team = {
  team_name: string;
  team_id?: string;
  coach?: string;
  players: Player[];
};

type StoredMatchReport = {
  id: string;
  matchId: string;
  generatedAt: string;
  matchDate: string | null;
  matchTime: string | null;
  competition?: string;
  venue?: string;
  sets?: number;
  teams: {
    home: Team;
    away: Team;
  };
  createdAt: string;
  ownerId: string;
};

export type MatchReport = Omit<StoredMatchReport, 'generatedAt' | 'matchDate' | 'createdAt'> & {
  generatedAt: Date | null;
  matchDate: Date | null;
  createdAt: Date | null;
};

function buildIndexKey(matchId: string) {
  return `${MATCH_REPORT_INDEX_PREFIX}/${matchId}.json`;
}

function buildDataKey(createdAt: Date, matchId: string) {
  const inverted = (MAX_TIMESTAMP - createdAt.getTime()).toString().padStart(13, '0');
  return `${MATCH_REPORT_DATA_FOLDER}${inverted}_${matchId}.json`;
}

function buildSignatureKey(signature: string) {
  return `${MATCH_REPORT_SIGNATURE_PREFIX}/${signature}.json`;
}

function parseStoredDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeMatchDate(matchDate: unknown) {
  if (!matchDate) {
    return null;
  }

  const parsed = new Date(String(matchDate));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeOwnerId(ownerId: unknown) {
  if (ownerId === undefined || ownerId === null) {
    return null;
  }

  const normalized = `${ownerId}`.trim();
  return normalized.length === 0 ? null : normalized;
}

function normalizeSignatureTeamName(name: string | undefined) {
  if (!name) {
    return null;
  }

  const trimmed = name.trim();
  return trimmed.length === 0 ? null : trimmed.toLowerCase();
}

function buildMatchSignature(matchDate: unknown, teams: { home: { team_name: string }; away: { team_name: string } }) {
  const normalizedDate = normalizeMatchDate(matchDate)?.toISOString()?.slice(0, 10);
  if (!normalizedDate) {
    return null;
  }

  const normalizedTeamNames = [teams.home.team_name, teams.away.team_name]
    .map((name) => normalizeSignatureTeamName(name))
    .filter((value): value is string => Boolean(value))
    .sort();

  if (normalizedTeamNames.length === 0) {
    return null;
  }

  return `${normalizedDate}__${normalizedTeamNames.join('__')}`;
}

export class DuplicateMatchReportError extends Error {
  matchId: string | null;

  constructor(matchId: string | null) {
    super('Match report already exists for this date and team combination');
    this.name = 'DuplicateMatchReportError';
    this.matchId = matchId;
  }
}

function mapMatchReport(doc: StoredMatchReport | null): MatchReport | null {
  if (!doc) {
    return null;
  }

  return {
    id: doc.id ?? doc.matchId,
    matchId: doc.matchId,
    generatedAt: parseStoredDate(doc.generatedAt),
    matchDate: parseStoredDate(doc.matchDate),
    matchTime: doc.matchTime ?? null,
    competition: doc.competition,
    venue: doc.venue,
    sets: doc.sets,
    teams: doc.teams,
    createdAt: parseStoredDate(doc.createdAt),
    ownerId: doc.ownerId
  };
}

export async function insertMatchReport(
  env: AppBindings,
  payload: {
    generatedAt: string;
    matchDate?: string | null;
    matchTime?: string | null;
    competition?: string;
    venue?: string;
    sets?: number;
    teams: {
      home: Team;
      away: Team;
    };
  },
  { ownerId }: { ownerId: string }
) {
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  if (!normalizedOwnerId) {
    throw new Error('ownerId is required to insert match reports');
  }

  const createdAt = new Date();
  const matchId = crypto.randomUUID();
  const dataKey = buildDataKey(createdAt, matchId);
  const signature = buildMatchSignature(payload.matchDate, payload.teams);
  const signatureKey = signature ? buildSignatureKey(signature) : null;
  let signatureReserved = false;

  const doc: StoredMatchReport = {
    id: matchId,
    matchId,
    generatedAt: new Date(payload.generatedAt).toISOString(),
    matchDate: normalizeMatchDate(payload.matchDate)?.toISOString() ?? null,
    matchTime: payload.matchTime ?? null,
    competition: payload.competition,
    venue: payload.venue,
    sets: payload.sets,
    teams: payload.teams, // No need to normalize via helper for now as we trust the detailed transform
    createdAt: createdAt.toISOString(),
    ownerId: normalizedOwnerId
  };

  if (signatureKey) {
    const existingSignature = await readJSON<{ key: string; matchId: string }>(env, signatureKey);
    if (existingSignature?.matchId) {
      throw new DuplicateMatchReportError(existingSignature.matchId);
    }

    await writeJSON(env, signatureKey, { key: dataKey, matchId });
    signatureReserved = true;
  }

  try {
    await writeJSON(env, dataKey, doc);
    await writeJSON(env, buildIndexKey(matchId), { key: dataKey });
  } catch (error) {
    if (signatureReserved && signatureKey) {
      await deleteJSON(env, signatureKey).catch(() => undefined);
    }

    throw error;
  }

  return mapMatchReport(doc);
}

export async function findMatchReportByMatchId(env: AppBindings, matchId: string) {
  const index = await readJSON<{ key?: string }>(env, buildIndexKey(matchId));
  if (!index?.key) {
    return null;
  }

  const doc = await readJSON<StoredMatchReport>(env, index.key);
  return mapMatchReport(doc);
}

export async function listMatchReports(
  env: AppBindings,
  { limit = 50, ownerId }: { limit?: number; ownerId?: string }
) {
  const normalizedLimit = Math.max(1, Math.min(Number.parseInt(String(limit), 10) || 50, 200));
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  const { objects } = await listObjects(env, {
    prefix: MATCH_REPORT_DATA_FOLDER,
    limit: normalizedLimit
  }, 'data');

  const reports = await Promise.all(
    objects.map((object) => readJSON<StoredMatchReport>(env, object.key))
  );

  return reports
    .map(mapMatchReport)
    .filter((report): report is MatchReport => Boolean(report))
    .filter((report) => (normalizedOwnerId ? report.ownerId === normalizedOwnerId : true));
}

export type DeleteMatchReportResult =
  | { ok: true }
  | { ok: false; code: 'not-found' | 'forbidden' };

export async function deleteMatchReport(
  env: AppBindings,
  matchId: string,
  { ownerId }: { ownerId: string }
): Promise<DeleteMatchReportResult> {
  const indexKey = buildIndexKey(matchId);
  const index = await readJSON<{ key?: string }>(env, indexKey);
  if (!index?.key) {
    return { ok: false, code: 'not-found' };
  }

  const doc = await readJSON<StoredMatchReport>(env, index.key);
  if (!doc) {
    await deleteJSON(env, indexKey).catch(() => undefined);
    return { ok: false, code: 'not-found' };
  }

  if (doc.ownerId !== ownerId) {
    return { ok: false, code: 'forbidden' };
  }

  const signature = buildMatchSignature(doc.matchDate, doc.teams);

  await deleteJSON(env, index.key).catch(() => undefined);
  await deleteJSON(env, indexKey).catch(() => undefined);

  if (signature) {
    await deleteJSON(env, buildSignatureKey(signature)).catch(() => undefined);
  }

  return { ok: true };
}
