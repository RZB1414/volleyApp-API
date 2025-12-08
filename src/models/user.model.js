import { randomUUID } from 'node:crypto';

import { deleteObject, getJsonObject, putJsonObject } from '../services/jsonStore.service.js';

const USERS_DATA_PREFIX = 'users/data';
const USERS_EMAIL_INDEX_PREFIX = 'users/by-email';

function buildUserDataKey(userId) {
  return `${USERS_DATA_PREFIX}/${userId}.json`;
}

function buildEmailIndexKey(email) {
  const normalized = Buffer.from(email).toString('base64url');
  return `${USERS_EMAIL_INDEX_PREFIX}/${normalized}.json`;
}

function parseStoredDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function serializeTeamHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history.map((entry) => ({
    teamName: entry.teamName ?? null,
    teamCountry: entry.teamCountry ?? null,
    seasonStart: entry.seasonStart ? new Date(entry.seasonStart).toISOString() : null,
    seasonEnd: entry.seasonEnd ? new Date(entry.seasonEnd).toISOString() : null,
    playerNumber: entry.playerNumber ?? null
  }));
}

function mapTeamHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  return {
    teamName: entry.teamName ?? null,
    teamCountry: entry.teamCountry ?? null,
    seasonStart: parseStoredDate(entry.seasonStart),
    seasonEnd: parseStoredDate(entry.seasonEnd),
    playerNumber: entry.playerNumber ?? null
  };
}

function mapUser(userDoc) {
  if (!userDoc) {
    return null;
  }

  const rawId = userDoc._id ?? userDoc.id;

  return {
    id: rawId.toString(),
    name: userDoc.name,
    email: userDoc.email,
    age: userDoc.age,
    yearsAsAProfessional: userDoc.yearsAsAProfessional ?? null,
    currentTeam: userDoc.currentTeam ?? null,
    currentTeamCountry: userDoc.currentTeamCountry ?? null,
    country: userDoc.country ?? null,
    playerNumber: userDoc.playerNumber ?? null,
    teamHistory: Array.isArray(userDoc.teamHistory)
      ? userDoc.teamHistory.map(mapTeamHistoryEntry).filter(Boolean)
      : [],
    createdAt: parseStoredDate(userDoc.createdAt)
  };
}

async function loadUserById(userId) {
  const key = buildUserDataKey(userId);
  return getJsonObject(key);
}

export async function createUser({
  name,
  email,
  age,
  passwordHash,
  country,
  yearsAsAProfessional,
  currentTeam,
  currentTeamCountry,
  playerNumber,
  teamHistory
}) {
  const userId = randomUUID();
  const userKey = buildUserDataKey(userId);
  const emailKey = buildEmailIndexKey(email);
  const now = new Date().toISOString();
  const doc = {
    id: userId,
    name,
    email,
    age,
    passwordHash,
    currentTeam: currentTeam ?? null,
    currentTeamCountry: currentTeamCountry ?? null,
    country: country ?? null,
    playerNumber: playerNumber ?? null,
    teamHistory: serializeTeamHistory(teamHistory),
    yearsAsAProfessional: yearsAsAProfessional ?? null,
    createdAt: now,
    updatedAt: now
  };

  await putJsonObject(userKey, doc);

  try {
    await putJsonObject(emailKey, { userId });
  } catch (error) {
    await deleteObject(userKey);
    throw error;
  }

  return mapUser(doc);
}

export async function findUserByEmail(email) {
  const emailKey = buildEmailIndexKey(email);
  const entry = await getJsonObject(emailKey);
  if (!entry?.userId) {
    return null;
  }

  return loadUserById(entry.userId);
}

export async function findUserById(id) {
  const doc = await loadUserById(id);
  return mapUser(doc);
}

export async function updateUserProfile(id, updates) {
  const doc = await loadUserById(id);
  if (!doc) {
    return null;
  }

  const now = new Date().toISOString();
  const hasTeamHistoryUpdate = Object.prototype.hasOwnProperty.call(updates, 'teamHistory');
  const nextTeamHistory = hasTeamHistoryUpdate
    ? serializeTeamHistory(updates.teamHistory)
    : doc.teamHistory;
  const nextDoc = {
    ...doc,
    ...updates,
    teamHistory: nextTeamHistory,
    updatedAt: now
  };

  await putJsonObject(buildUserDataKey(id), nextDoc);
  return mapUser(nextDoc);
}

export function sanitizeUser(userDoc) {
  return mapUser(userDoc);
}
