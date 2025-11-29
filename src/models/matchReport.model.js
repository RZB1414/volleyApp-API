import { randomUUID } from 'node:crypto';

import { getMatchReportsCollection } from '../db/mongo.js';

function normalizeMatchDate(matchDate) {
  if (!matchDate) {
    return null;
  }

  const parsed = new Date(matchDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function mapMatchReport(doc) {
  if (!doc) {
    return null;
  }

  return {
    id: doc._id?.toString(),
    matchId: doc.matchId,
    generatedAt: doc.generatedAt,
    matchDate: doc.matchDate ?? null,
    matchTime: doc.matchTime ?? null,
    setColumns: doc.setColumns,
    columnLabels: doc.columnLabels,
    teams: doc.teams,
    createdAt: doc.createdAt
  };
}

export async function insertMatchReport(payload) {
  const matchReports = getMatchReportsCollection();
  const now = new Date();

  const doc = {
    matchId: randomUUID(),
    generatedAt: new Date(payload.generatedAt),
    matchDate: normalizeMatchDate(payload.matchDate),
    matchTime: payload.matchTime ?? null,
    setColumns: payload.setColumns,
    columnLabels: payload.columnLabels,
    teams: normalizeTeams(payload.teams),
    createdAt: now
  };

  const result = await matchReports.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function findMatchReportByMatchId(matchId) {
  const matchReports = getMatchReportsCollection();
  const doc = await matchReports.findOne({ matchId });
  return mapMatchReport(doc);
}

export async function listMatchReports({ limit = 50 } = {}) {
  const matchReports = getMatchReportsCollection();
  const cursor = matchReports.find({}).sort({ createdAt: -1 }).limit(limit);
  const docs = await cursor.toArray();
  return docs.map(mapMatchReport);
}
