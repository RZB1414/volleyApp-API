import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { registerHealthRoutes } from './routes/health';
import { registerAuthRoutes } from './routes/auth';
import { registerUploadRoutes } from './routes/upload';
import { registerDownloadRoutes } from './routes/download';
import { registerStatsRoutes } from './routes/stats';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

const allowedOrigins = [
	'http://localhost:5173',
	'https://volleyapp-api.volleyplusapp.workers.dev'
];

app.use('*', cors({
	origin: (origin) => {
		if (!origin) {
			return allowedOrigins[0];
		}

		return allowedOrigins.includes(origin) ? origin : '';
	},
	allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
	allowHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-email'],
	exposeHeaders: ['Content-Disposition'],
	maxAge: 86400,
	credentials: true
}));

registerHealthRoutes(app);
registerAuthRoutes(app);
registerUploadRoutes(app);
registerDownloadRoutes(app);
registerStatsRoutes(app);

export default app;
