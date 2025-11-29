import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { checkHealth } from './controllers/health.controller.js';
import authRouter from './routes/auth.routes.js';
import downloadRouter from './routes/download.routes.js';
import statsRouter from './routes/stats.routes.js';
import uploadRouter from './routes/upload.routes.js';

const app = express();

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  : ['*'];

if (allowedOrigins.length === 0) {
  allowedOrigins.push('*');
}

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    credentials: true
  })
);

const limiter = rateLimit({
  windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  limit: Number.parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

app.use(limiter);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? '1mb' }));

app.get('/health', checkHealth);

app.use('/auth', authRouter);
app.use('/upload', uploadRouter);
app.use('/download', downloadRouter);
app.use('/stats', statsRouter);

app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

app.use((error, req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: 'Internal Server Error' });
});

export default app;
