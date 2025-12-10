import type { Hono } from 'hono';

import type { AppEnv } from '../types';

export function registerHealthRoutes(app: Hono<AppEnv>) {
  app.get('/health', (c) => {
    const now = new Date().toISOString();
    return c.json({ status: 'ok', timestamp: now });
  });
}
