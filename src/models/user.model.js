import { ObjectId } from 'mongodb';

import { getUsersCollection } from '../db/mongo.js';

function mapTeamHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  return {
    teamName: entry.teamName ?? null,
    teamCountry: entry.teamCountry ?? null,
    seasonStart: entry.seasonStart ?? null,
    seasonEnd: entry.seasonEnd ?? null,
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
    createdAt: userDoc.createdAt
  };
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
  const users = getUsersCollection();
  const now = new Date();
  const doc = {
    name,
    email,
    age,
    passwordHash,
    currentTeam: currentTeam ?? null,
    currentTeamCountry: currentTeamCountry ?? null,
    country: country ?? null,
    playerNumber: playerNumber ?? null,
    teamHistory: Array.isArray(teamHistory) ? teamHistory : [],
    yearsAsAProfessional: yearsAsAProfessional ?? null,
    createdAt: now,
    updatedAt: now
  };

  const result = await users.insertOne(doc);
  return mapUser({ ...doc, _id: result.insertedId });
}

export async function findUserByEmail(email) {
  const users = getUsersCollection();
  const user = await users.findOne({ email });
  return user;
}

export async function findUserById(id) {
  const users = getUsersCollection();
  const user = await users.findOne({ _id: new ObjectId(id) });
  return mapUser(user);
}

export async function updateUserProfile(id, updates) {
  const users = getUsersCollection();
  const timestampedUpdates = { ...updates, updatedAt: new Date() };
  const result = await users.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: timestampedUpdates },
    { returnDocument: 'after' }
  );

  return mapUser(result.value);
}

export function sanitizeUser(userDoc) {
  return mapUser(userDoc);
}
