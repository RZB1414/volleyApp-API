import type { Context, Next } from 'hono';

import type { AppEnv } from '../types';
import { verifyJwt } from '../utils/jwt';

const AUTH_HEADER = 'authorization';

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const header = c.req.header(AUTH_HEADER);

  if (!header || !header.startsWith('Bearer ')) {
    // Check for Local Dev Key Bypass
    const localKey = c.req.header('x-local-dev-key');
    if (localKey && c.env.LOCAL_DEV_KEY && localKey === c.env.LOCAL_DEV_KEY) {
      c.set('user', {
        id: 'local-dev',
        email: 'local@dev.env',
        name: 'Local Developer'
      });
      return next();
    }
    return c.json({ message: 'Authentication required' }, 401);
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    return c.json({ message: 'Authentication required' }, 401);
  }

  try {
    const payload = await verifyJwt(token, c.env.JWT_SECRET);
    c.set('user', {
      id: payload.sub,
      email: payload.email,
      name: payload.name
    });
    await next();
  } catch (error) {
    console.error('Authentication failed', error);
    return c.json({ message: 'Invalid token' }, 401);
  }
}

export function getRequestUser(c: Context<AppEnv>) {
  return c.get('user') as { id: string; email: string; name: string } | undefined;
}
