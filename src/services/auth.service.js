import argon2 from 'argon2';
import jwt from 'jsonwebtoken';

const ACCESS_EXPIRES_IN = '15m';
const REFRESH_EXPIRES_IN = '7d';
const DEFAULT_ARGON_MEMORY = 2 ** 16; // 64 MB
const DEFAULT_ARGON_TIME = 3; // iterate to target ~300-600ms depending on host
const DEFAULT_ARGON_PARALLELISM = 1;

function getPepper() {
  const pepper = process.env.PASSWORD_PEPPER;
  if (!pepper) {
    throw new Error('PASSWORD_PEPPER must be defined');
  }

  return pepper;
}

function getArgonOptions() {
  return {
    type: argon2.argon2id,
    memoryCost: Number.parseInt(process.env.ARGON2_MEMORY_COST ?? DEFAULT_ARGON_MEMORY, 10),
    timeCost: Number.parseInt(process.env.ARGON2_TIME_COST ?? DEFAULT_ARGON_TIME, 10),
    parallelism: Number.parseInt(process.env.ARGON2_PARALLELISM ?? DEFAULT_ARGON_PARALLELISM, 10)
  };
}

export async function hashPassword(plainPassword) {
  const pepper = getPepper();
  return argon2.hash(`${plainPassword}${pepper}`, getArgonOptions());
}

export async function verifyPassword(hash, plainPassword) {
  const pepper = getPepper();
  try {
    return await argon2.verify(hash, `${plainPassword}${pepper}`, getArgonOptions());
  } catch {
    return false;
  }
}

function getAccessTokenSecret() {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) {
    throw new Error('ACCESS_TOKEN_SECRET must be defined');
  }

  return secret;
}

function getRefreshTokenSecret() {
  const secret = process.env.REFRESH_TOKEN_SECRET;
  if (!secret) {
    throw new Error('REFRESH_TOKEN_SECRET must be defined');
  }

  return secret;
}

export function generateTokens(user) {
  const payload = {
    id: user.id,
    yearsAsAProfessional: user.yearsAsAProfessional ?? null
  };

  const accessToken = jwt.sign(payload, getAccessTokenSecret(), {
    expiresIn: ACCESS_EXPIRES_IN
  });

  const refreshToken = jwt.sign(payload, getRefreshTokenSecret(), {
    expiresIn: REFRESH_EXPIRES_IN
  });

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getAccessTokenSecret());
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, getRefreshTokenSecret());
}
