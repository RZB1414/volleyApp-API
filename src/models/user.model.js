import { ObjectId } from 'mongodb';

import { getUsersCollection } from '../db/mongo.js';

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
    actualTeam: userDoc.actualTeam ?? null,
    country: userDoc.country ?? null,
    createdAt: userDoc.createdAt,
    updatedAt: userDoc.updatedAt
  };
}

export async function createUser({
  name,
  email,
  age,
  passwordHash,
  actualTeam,
  country,
  yearsAsAProfessional
}) {
  const users = getUsersCollection();
  const now = new Date();
  const doc = {
    name,
    email,
    age,
    passwordHash,
    actualTeam: actualTeam ?? null,
    country: country ?? null,
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

export function sanitizeUser(userDoc) {
  return mapUser(userDoc);
}
