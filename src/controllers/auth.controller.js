import validator from 'validator';

import {
  createUser,
  findUserByEmail,
  findUserById,
  sanitizeUser,
  updateUserProfile
} from '../models/user.model.js';
import { generateTokens, hashPassword, verifyPassword } from '../services/auth.service.js';
import {
  isIpBlocked,
  registerFailure,
  registerSuccess
} from '../services/loginAttempts.service.js';
import { normalizePlayerNumber } from '../utils/playerNumber.js';

const MAX_REFRESH_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const GENERIC_AUTH_MESSAGE = 'Invalid email or password';

function normalizeEmail(email) {
  return email?.trim().toLowerCase();
}

function normalizeName(name) {
  return name?.trim();
}

function normalizeOptionalText(value) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
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

function buildValidationErrors({ name, email, password, age, yearsAsAProfessional }) {
  const errors = [];
  const currentYear = new Date().getFullYear();

  if (!name || !name.trim()) {
    errors.push({ field: 'name', message: 'Name is required' });
  }

  if (!email || !validator.isEmail(email)) {
    errors.push({ field: 'email', message: 'Valid email is required' });
  }

  if (!password || password.length < 9) {
    errors.push({ field: 'password', message: 'Password must be at least 9 characters' });
  }

  if (age !== undefined && age !== null) {
    const numericAge = Number(age);
    if (Number.isNaN(numericAge) || numericAge < 10 || numericAge > 100) {
      errors.push({ field: 'age', message: 'Age must be between 10 and 100' });
    }
  }

  if (yearsAsAProfessional !== undefined && yearsAsAProfessional !== null) {
    const numericYears = Number(yearsAsAProfessional);
    if (Number.isNaN(numericYears) || numericYears < 1950 || numericYears > currentYear) {
      errors.push({
        field: 'yearsAsAProfessional',
        message: `Starting year must be between 1950 and ${currentYear}`
      });
    }
  }

  return errors;
}

export async function register(req, res) {
  const name = normalizeName(req.body.name);
  const email = normalizeEmail(req.body.email);
  const password = req.body.password;
  const age = req.body.age === undefined ? undefined : Number(req.body.age);
  const country = normalizeOptionalText(req.body.country);
  const currentTeam = normalizeOptionalText(req.body.currentTeam);
  const currentTeamCountry = normalizeOptionalText(req.body.currentTeamCountry);
  const yearsAsAProfessional =
    req.body.yearsAsAProfessional === undefined ? undefined : Number(req.body.yearsAsAProfessional);
  const { history: teamHistory, errors: teamHistoryErrors } = validateTeamHistory(
    req.body.teamHistory
  );

  const errors = buildValidationErrors({ name, email, password, age, yearsAsAProfessional });
  errors.push(...teamHistoryErrors);

  let playerNumber;
  try {
    playerNumber = normalizePlayerNumber(req.body.playerNumber);
  } catch (error) {
    errors.push({ field: 'playerNumber', message: error.message });
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: 'Validation failed', errors });
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    return res.status(409).json({ message: 'Email is already registered' });
  }

  const passwordHash = await hashPassword(password);
  const newUser = await createUser({
    name,
    email,
    age,
    passwordHash,
    country,
    yearsAsAProfessional,
    currentTeam,
    currentTeamCountry,
    playerNumber,
    teamHistory: teamHistory ?? []
  });
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

function resolveRequestUserId(req) {
  return req?.user?.id ?? req?.user?._id ?? req?.user?.userId ?? null;
}

export async function getCurrentUser(req, res) {
  const userId = resolveRequestUserId(req);
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = await findUserById(userId);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.json({ user });
}

function normalizeYears(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || `${value}`.trim().length === 0) {
    return null;
  }

  const numericYear = Number(value);
  const currentYear = new Date().getFullYear();
  if (Number.isNaN(numericYear) || numericYear < 1950 || numericYear > currentYear) {
    return Number.NaN;
  }

  return numericYear;
}

function normalizeField(value) {
  return normalizeOptionalText(value) ?? null;
}

function parseHistoryDate(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return { ok: false, code: 'required' };
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
      return { ok: false, code: 'required' };
    }
    rawValue = trimmed;
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, code: 'invalid' };
  }

  return { ok: true, value: parsed };
}

function validateTeamHistory(rawHistory) {
  if (rawHistory === undefined) {
    return { history: undefined, errors: [] };
  }

  if (rawHistory === null) {
    return { history: [], errors: [] };
  }

  if (!Array.isArray(rawHistory)) {
    return {
      history: undefined,
      errors: [{ field: 'teamHistory', message: 'teamHistory must be an array of objects' }]
    };
  }

  const errors = [];
  const history = [];

  rawHistory.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      errors.push({
        field: `teamHistory[${index}]`,
        message: 'Each entry must be an object'
      });
      return;
    }

    const normalizedEntry = {};
    let hasErrors = false;

    const teamName = normalizeOptionalText(entry.teamName);
    if (!teamName) {
      errors.push({
        field: `teamHistory[${index}].teamName`,
        message: 'teamName is required'
      });
      hasErrors = true;
    } else {
      normalizedEntry.teamName = teamName;
    }

    const teamCountry = normalizeOptionalText(entry.teamCountry ?? entry.country);
    if (!teamCountry) {
      errors.push({
        field: `teamHistory[${index}].teamCountry`,
        message: 'teamCountry is required'
      });
      hasErrors = true;
    } else {
      normalizedEntry.teamCountry = teamCountry;
    }

    const seasonStartResult = parseHistoryDate(entry.seasonStart ?? entry.startDate);
    if (!seasonStartResult.ok) {
      errors.push({
        field: `teamHistory[${index}].seasonStart`,
        message:
          seasonStartResult.code === 'required'
            ? 'seasonStart is required'
            : 'seasonStart must be a valid date'
      });
      hasErrors = true;
    } else {
      normalizedEntry.seasonStart = seasonStartResult.value;
    }

    const seasonEndResult = parseHistoryDate(entry.seasonEnd ?? entry.endDate);
    if (!seasonEndResult.ok) {
      errors.push({
        field: `teamHistory[${index}].seasonEnd`,
        message:
          seasonEndResult.code === 'required'
            ? 'seasonEnd is required'
            : 'seasonEnd must be a valid date'
      });
      hasErrors = true;
    } else {
      normalizedEntry.seasonEnd = seasonEndResult.value;
    }

    let historicalNumber;
    try {
      historicalNumber = normalizePlayerNumber(entry.playerNumber ?? entry.jerseyNumber);
    } catch (error) {
      errors.push({
        field: `teamHistory[${index}].playerNumber`,
        message: error.message
      });
      hasErrors = true;
    }

    if (!hasErrors) {
      if (historicalNumber === undefined || historicalNumber === null) {
        errors.push({
          field: `teamHistory[${index}].playerNumber`,
          message: 'playerNumber is required'
        });
        hasErrors = true;
      } else {
        normalizedEntry.playerNumber = historicalNumber;
      }
    }

    if (!hasErrors && normalizedEntry.seasonEnd < normalizedEntry.seasonStart) {
      errors.push({
        field: `teamHistory[${index}].seasonEnd`,
        message: 'seasonEnd must be after seasonStart'
      });
      hasErrors = true;
    }

    if (!hasErrors) {
      history.push(normalizedEntry);
    }
  });

  return { history, errors };
}

export async function updateProfile(req, res) {
  const updates = {};
  const errors = [];
  const { body } = req;
  const userId = resolveRequestUserId(req);

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if ('currentTeam' in body) {
    updates.currentTeam = normalizeField(body.currentTeam);
  }

  if ('country' in body) {
    updates.country = normalizeField(body.country);
  }

  if ('currentTeamCountry' in body) {
    updates.currentTeamCountry = normalizeField(body.currentTeamCountry);
  }

  if ('teamHistory' in body) {
    const { history, errors: teamHistoryErrors } = validateTeamHistory(body.teamHistory);
    if (teamHistoryErrors.length > 0) {
      errors.push(...teamHistoryErrors);
    } else if (history !== undefined) {
      updates.teamHistory = history;
    }
  }

  if ('yearsAsAProfessional' in body) {
    const normalizedYears = normalizeYears(body.yearsAsAProfessional);
    if (Number.isNaN(normalizedYears)) {
      errors.push({
        field: 'yearsAsAProfessional',
        message: `Starting year must be between 1950 and ${new Date().getFullYear()}`
      });
    } else {
      updates.yearsAsAProfessional = normalizedYears ?? null;
    }
  }

  if ('playerNumber' in body) {
    try {
      const normalizedPlayerNumber = normalizePlayerNumber(body.playerNumber);
      if (normalizedPlayerNumber !== undefined) {
        updates.playerNumber = normalizedPlayerNumber ?? null;
      }
    } catch (error) {
      errors.push({ field: 'playerNumber', message: error.message });
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: 'Validation failed', errors });
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No fields to update' });
  }

  let updatedUser = await updateUserProfile(userId, updates);

  if (!updatedUser) {
    updatedUser = await findUserById(userId);
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
  }

  return res.json({ user: updatedUser });
}
