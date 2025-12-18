import { Hono, type Context } from 'hono';

import type { AppEnv } from '../types';
import { normalizePlayerNumber } from '../utils/playerNumber';
import {
  createUser,
  findUserByEmail,
  findUserById,
  sanitizeUser,
  StoredTeamHistoryEntry
} from '../services/userStore.service';
import { signJwt } from '../utils/jwt';
import { requireAuth, getRequestUser } from '../middleware/auth';

const authRouter = new Hono<AppEnv>();
const encoder = new TextEncoder();
const MIN_PASSWORD_LENGTH = 9;

function maskEmailForLog(email: string) {
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return '<invalid-email>';
  }

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const prefix = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${prefix}***@${domain}`;
}

function getRequestId(c: Context<AppEnv>) {
  return c.req.header('cf-ray') ?? c.req.header('x-request-id') ?? crypto.randomUUID();
}

function normalizeEmail(email: unknown) {
  const value = typeof email === 'string' ? email : '';
  const trimmed = value.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeName(name: unknown) {
  const value = typeof name === 'string' ? name : '';
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeOptionalText(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmed = String(value).trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function normalizeField(value: unknown) {
  const result = normalizeOptionalText(value);
  return result ?? null;
}

function parseNumber(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const numeric = Number(value);
  return Number.isNaN(numeric) ? Number.NaN : numeric;
}

function parseHistoryDate(value: unknown) {
  if (value === undefined || value === null) {
    return { ok: false as const, code: 'required' };
  }

  const asString = String(value).trim();
  if (asString.length === 0) {
    return { ok: false as const, code: 'required' };
  }

  const parsed = new Date(asString);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false as const, code: 'invalid' };
  }

  return { ok: true as const, value: parsed };
}

function validateTeamHistory(rawValue: unknown) {
  if (rawValue === undefined) {
    return { history: undefined, errors: [] as { field: string; message: string }[] };
  }

  if (rawValue === null) {
    return { history: [], errors: [] };
  }

  if (!Array.isArray(rawValue)) {
    return {
      history: undefined,
      errors: [{ field: 'teamHistory', message: 'teamHistory must be an array of objects' }]
    };
  }

  const errors: { field: string; message: string }[] = [];
  const history: StoredTeamHistoryEntry[] = [];

  rawValue.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      errors.push({ field: `teamHistory[${index}]`, message: 'Each entry must be an object' });
      return;
    }

    const normalizedEntry: Partial<StoredTeamHistoryEntry> = {};
    let hasErrors = false;

    const teamName = normalizeOptionalText((entry as Record<string, unknown>).teamName);
    if (!teamName) {
      errors.push({ field: `teamHistory[${index}].teamName`, message: 'teamName is required' });
      hasErrors = true;
    } else {
      normalizedEntry.teamName = teamName;
    }

    const teamCountry = normalizeOptionalText(
      (entry as Record<string, unknown>).teamCountry ?? (entry as Record<string, unknown>).country
    );
    if (!teamCountry) {
      errors.push({ field: `teamHistory[${index}].teamCountry`, message: 'teamCountry is required' });
      hasErrors = true;
    } else {
      normalizedEntry.teamCountry = teamCountry;
    }

    const seasonStart = parseHistoryDate(
      (entry as Record<string, unknown>).seasonStart ?? (entry as Record<string, unknown>).startDate
    );
    if (!seasonStart.ok) {
      errors.push({
        field: `teamHistory[${index}].seasonStart`,
        message: seasonStart.code === 'required' ? 'seasonStart is required' : 'seasonStart must be a valid date'
      });
      hasErrors = true;
    } else {
      normalizedEntry.seasonStart = seasonStart.value.toISOString();
    }

    const seasonEnd = parseHistoryDate(
      (entry as Record<string, unknown>).seasonEnd ?? (entry as Record<string, unknown>).endDate
    );
    if (!seasonEnd.ok) {
      errors.push({
        field: `teamHistory[${index}].seasonEnd`,
        message: seasonEnd.code === 'required' ? 'seasonEnd is required' : 'seasonEnd must be a valid date'
      });
      hasErrors = true;
    } else {
      normalizedEntry.seasonEnd = seasonEnd.value.toISOString();
    }

    let historicalNumber: string | null | undefined;
    try {
      historicalNumber = normalizePlayerNumber(
        (entry as Record<string, unknown>).playerNumber ?? (entry as Record<string, unknown>).jerseyNumber
      );
    } catch (error) {
      errors.push({ field: `teamHistory[${index}].playerNumber`, message: (error as Error).message });
      hasErrors = true;
    }

    if (!hasErrors) {
      if (!historicalNumber) {
        errors.push({
          field: `teamHistory[${index}].playerNumber`,
          message: 'playerNumber is required'
        });
        hasErrors = true;
      } else {
        normalizedEntry.playerNumber = historicalNumber;
      }
    }

    if (!hasErrors && normalizedEntry.seasonEnd && normalizedEntry.seasonStart) {
      if (normalizedEntry.seasonEnd < normalizedEntry.seasonStart) {
        errors.push({
          field: `teamHistory[${index}].seasonEnd`,
          message: 'seasonEnd must be after seasonStart'
        });
        hasErrors = true;
      }
    }

    if (!hasErrors) {
      history.push(normalizedEntry as StoredTeamHistoryEntry);
    }
  });

  return { history, errors };
}

function buildValidationErrors(payload: Record<string, unknown>) {
  const errors: { field: string; message: string }[] = [];
  const currentYear = new Date().getFullYear();

  const name = normalizeName(payload.name);
  if (!name) {
    errors.push({ field: 'name', message: 'Name is required' });
  }

  const email = normalizeEmail(payload.email);
  if (!email) {
    errors.push({ field: 'email', message: 'Valid email is required' });
  }

  const password = typeof payload.password === 'string' ? payload.password : '';
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push({ field: 'password', message: 'Password must be at least 9 characters' });
  }

  const ageValue = parseNumber(payload.age);
  if (ageValue !== undefined && Number.isNaN(ageValue)) {
    errors.push({ field: 'age', message: 'Age must be a number' });
  } else if (ageValue !== undefined) {
    if (ageValue < 10 || ageValue > 100) {
      errors.push({ field: 'age', message: 'Age must be between 10 and 100' });
    }
  }

  const yearsValue = parseNumber(payload.yearsAsAProfessional);
  if (yearsValue !== undefined && Number.isNaN(yearsValue)) {
    errors.push({
      field: 'yearsAsAProfessional',
      message: `Starting year must be between 1950 and ${currentYear}`
    });
  } else if (yearsValue !== undefined) {
    if (yearsValue < 1950 || yearsValue > currentYear) {
      errors.push({
        field: 'yearsAsAProfessional',
        message: `Starting year must be between 1950 and ${currentYear}`
      });
    }
  }

  return { errors, name, email, password, ageValue, yearsValue };
}

function bufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function generateSalt(size = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return bufferToBase64(bytes.buffer);
}

async function hashPassword(password: string, salt: string) {
  const data = encoder.encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufferToBase64(digest);
}

async function verifyPassword(password: string, salt: string, hash: string) {
  const computed = await hashPassword(password, salt);
  return computed === hash;
}

async function generateAccessToken(env: AppEnv['Bindings'], user: { id: string; email: string; name: string }) {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + 60 * 60
  };

  return signJwt(payload, env.JWT_SECRET);
}

authRouter.post('/auth/register', async (c: Context<AppEnv>) => {
  const requestId = getRequestId(c);
  try {
    const body = (await c.req.json()) as Record<string, unknown>;
    const { errors, name, email, password, ageValue, yearsValue } = buildValidationErrors(body);
    const { history, errors: historyErrors } = validateTeamHistory(body.teamHistory);
    errors.push(...historyErrors);

    let playerNumber: string | null | undefined;
    try {
      playerNumber = normalizePlayerNumber(body.playerNumber);
    } catch (error) {
      errors.push({ field: 'playerNumber', message: (error as Error).message });
    }

    if (errors.length > 0 || !name || !email || !password) {
      return c.json({ message: 'Validation failed', errors }, 400);
    }

    const existing = await findUserByEmail(c.env, email);
    if (existing) {
      return c.json({ message: 'Email is already registered' }, 409);
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    const newUser = await createUser(c.env, {
      name,
      email,
      passwordHash,
      passwordSalt: salt,
      age: ageValue,
      country: normalizeField(body.country),
      currentTeam: normalizeField(body.currentTeam),
      currentTeamCountry: normalizeField(body.currentTeamCountry),
      yearsAsAProfessional: yearsValue ?? null,
      playerNumber: playerNumber ?? null,
      teamHistory: history ?? []
    });

    const accessToken = await generateAccessToken(c.env, newUser);
    return c.json({ user: sanitizeUser(newUser), accessToken }, 201);
  } catch (error) {
    const errorPayload =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { message: String(error) };
    console.error('[auth.register] unexpected_error', { requestId, error: errorPayload });
    return c.json({ message: 'Failed to register user' }, 500);
  }
});

authRouter.post('/auth/login', async (c: Context<AppEnv>) => {
  const requestId = getRequestId(c);
  try {
    const body = (await c.req.json()) as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    console.log('[auth.login] attempt', {
      requestId,
      email: email ? maskEmailForLog(email) : null,
      hasPassword: password.length > 0
    });

    if (!email || password.length === 0) {
      console.log('[auth.login] validation_failed', {
        requestId,
        hasEmail: Boolean(email),
        passwordLength: password.length
      });
      return c.json({ message: 'Email and password are required' }, 400);
    }

    const user = await findUserByEmail(c.env, email);
    if (!user) {
      console.log('[auth.login] user_not_found', {
        requestId,
        email: maskEmailForLog(email)
      });
      return c.json({ message: 'Invalid email or password' }, 401);
    }

    const passwordMatches = await verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!passwordMatches) {
      console.log('[auth.login] invalid_password', {
        requestId,
        userId: user.id,
        email: maskEmailForLog(email)
      });
      return c.json({ message: 'Invalid email or password' }, 401);
    }

    const accessToken = await generateAccessToken(c.env, user);

    console.log('[auth.login] success', {
      requestId,
      userId: user.id
    });
    return c.json({ user: sanitizeUser(user), accessToken });
  } catch (error) {
    const errorPayload =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { message: String(error) };
    console.error('[auth.login] unexpected_error', { requestId, error: errorPayload });
    return c.json({ message: 'Failed to authenticate' }, 500);
  }
});

authRouter.get('/auth/me', requireAuth, async (c: Context<AppEnv>) => {
  try {
    const requestUser = getRequestUser(c);
    if (!requestUser) {
      return c.json({ message: 'Authentication required' }, 401);
    }

    const user = await findUserById(c.env, requestUser.id);
    if (!user) {
      return c.json({ message: 'User not found' }, 404);
    }

    return c.json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error('Fetch current user error', error);
    return c.json({ message: 'Failed to load user profile' }, 500);
  }
});

export function registerAuthRoutes(app: Hono<AppEnv>) {
  app.route('/', authRouter);
}
