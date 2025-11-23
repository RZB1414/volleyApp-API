import { ObjectId } from 'mongodb';

import { getUsersCollection } from '../db/mongo.js';

export const USER_ROLES = ['statistic', 'coach', 'auxiliar coach', 'athlete', 'other'];

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
    role: userDoc.role,
    createdAt: userDoc.createdAt,
    updatedAt: userDoc.updatedAt
  };
}

export async function createUser({ name, email, age, role, passwordHash }) {
  const users = getUsersCollection();
  const now = new Date();
  const doc = {
    name,
    email,
    age,
    role,
    passwordHash,
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
