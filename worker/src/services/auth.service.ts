import { sign, verify } from '@hono/jwt';

import type { AppBindings } from '../types';

export type AuthTokenPayload = {
  sub: string;
  email: string;
  name: string;
  exp: number;
};

export async function generateAccessToken(env: AppBindings, payload: Omit<AuthTokenPayload, 'exp'>) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  return sign({ ...payload, exp }, env.JWT_SECRET);
}

export async function verifyAccessToken(env: AppBindings, token: string) {
  return verify(token, env.JWT_SECRET) as Promise<AuthTokenPayload>;
}
