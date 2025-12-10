import { nanoid } from 'nanoid';

import { readJSON, writeJSON } from './jsonStore.service';
import type { AppBindings } from '../types';

const USERS_KEY = 'data/users.json';

export type StoredTeamHistoryEntry = {
  teamName: string;
  teamCountry: string;
  seasonStart: string;
  seasonEnd: string;
  playerNumber: string;
};

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  age?: number;
  country?: string | null;
  currentTeam?: string | null;
  currentTeamCountry?: string | null;
  yearsAsAProfessional?: number | null;
  playerNumber?: string | null;
  teamHistory: StoredTeamHistoryEntry[];
  createdAt: string;
};

async function readUsers(env: AppBindings): Promise<StoredUser[]> {
  const users = await readJSON<StoredUser[]>(env, USERS_KEY);
  return users ?? [];
}

async function saveUsers(env: AppBindings, users: StoredUser[]) {
  await writeJSON(env, USERS_KEY, users);
}

export async function findUserByEmail(env: AppBindings, email: string) {
  const users = await readUsers(env);
  return users.find((user) => user.email === email) ?? null;
}

export async function findUserById(env: AppBindings, id: string) {
  const users = await readUsers(env);
  return users.find((user) => user.id === id) ?? null;
}

export async function createUser(env: AppBindings, payload: Omit<StoredUser, 'id' | 'createdAt'>) {
  const users = await readUsers(env);
  const newUser: StoredUser = {
    ...payload,
    id: nanoid(),
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  await saveUsers(env, users);
  return newUser;
}

export function sanitizeUser(user: StoredUser) {
  const { passwordHash, passwordSalt, ...rest } = user;
  return rest;
}
