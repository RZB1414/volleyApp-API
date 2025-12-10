import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { registerHealthRoutes } from './routes/health';
import { registerAuthRoutes } from './routes/auth';
import { registerUploadRoutes } from './routes/upload';
import { registerDownloadRoutes } from './routes/download';
import { registerStatsRoutes } from './routes/stats';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

app.use('*', cors({
	origin: (origin) => origin ?? '*',
	allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
	allowHeaders: ['Content-Type', 'Authorization'],
	exposeHeaders: ['Content-Disposition'],
	maxAge: 86400
}));

registerHealthRoutes(app);
registerAuthRoutes(app);
registerUploadRoutes(app);
registerDownloadRoutes(app);
registerStatsRoutes(app);

export default app;
