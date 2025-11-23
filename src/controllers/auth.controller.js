import validator from 'validator';

import {
  USER_ROLES,
  createUser,
  findUserByEmail,
  findUserById,
  sanitizeUser
} from '../models/user.model.js';
import { generateTokens, hashPassword, verifyPassword } from '../services/auth.service.js';
import {
  isIpBlocked,
  registerFailure,
  registerSuccess
} from '../services/loginAttempts.service.js';

const MAX_REFRESH_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const GENERIC_AUTH_MESSAGE = 'Invalid email or password';

function normalizeEmail(email) {
  return email?.trim().toLowerCase();
}

function normalizeName(name) {
  return name?.trim();
}

function validateRole(role) {
  return USER_ROLES.includes(role);
}

function setRefreshCookie(res, refreshToken) {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: (process.env.NODE_ENV ?? 'development') === 'production',
    maxAge: MAX_REFRESH_AGE_MS,
    path: '/auth'
  });
}

function buildValidationErrors({ name, email, password, role, age }) {
  const errors = [];

  if (!name || !name.trim()) {
    errors.push({ field: 'name', message: 'Name is required' });
  }

  if (!email || !validator.isEmail(email)) {
    errors.push({ field: 'email', message: 'Valid email is required' });
  }

  if (!password || password.length < 9) {
    errors.push({ field: 'password', message: 'Password must be at least 9 characters' });
  }

  if (!role || !validateRole(role)) {
    errors.push({ field: 'role', message: 'Role is required and must be valid' });
  }

  if (age !== undefined && age !== null) {
    const numericAge = Number(age);
    if (Number.isNaN(numericAge) || numericAge < 10 || numericAge > 100) {
      errors.push({ field: 'age', message: 'Age must be between 10 and 100' });
    }
  }

  return errors;
}

export async function register(req, res) {
  const name = normalizeName(req.body.name);
  const email = normalizeEmail(req.body.email);
  const password = req.body.password;
  const role = req.body.role;
  const age = req.body.age === undefined ? undefined : Number(req.body.age);

  const errors = buildValidationErrors({ name, email, password, role, age });

  if (errors.length > 0) {
    return res.status(400).json({ message: 'Validation failed', errors });
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    return res.status(409).json({ message: 'Email is already registered' });
  }

  const passwordHash = await hashPassword(password);
  const newUser = await createUser({ name, email, age, role, passwordHash });
  const { accessToken, refreshToken } = generateTokens(newUser);

  setRefreshCookie(res, refreshToken);

  return res.status(201).json({
    user: sanitizeUser(newUser),
    accessToken
  });
}

export async function login(req, res) {
  const ip = req.ip;
  const email = normalizeEmail(req.body.email);
  const password = req.body.password ?? '';

  if (isIpBlocked(ip)) {
    return res
      .status(429)
      .json({ message: 'Too many failed attempts. Please wait a few minutes and try again.' });
  }

  if (!email || !validator.isEmail(email) || password.length === 0) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const userDoc = await findUserByEmail(email);

  if (!userDoc) {
    registerFailure(ip);
    return res.status(401).json({ message: GENERIC_AUTH_MESSAGE });
  }

  const passwordMatches = await verifyPassword(userDoc.passwordHash, password);

  if (!passwordMatches) {
    registerFailure(ip);
    return res.status(401).json({ message: GENERIC_AUTH_MESSAGE });
  }

  registerSuccess(ip);

  const safeUser = sanitizeUser(userDoc);
  const { accessToken, refreshToken } = generateTokens(safeUser);
  setRefreshCookie(res, refreshToken);

  return res.json({ user: safeUser, accessToken });
}

export async function getCurrentUser(req, res) {
  const user = await findUserById(req.user.id);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.json({ user });
}
