import { Hono, type Context } from 'hono';
import { nanoid } from 'nanoid';

import type { AppEnv } from '../types';
import { requireAuth, getRequestUser } from '../middleware/auth';
import { readJSON, writeJSON } from '../services/jsonStore.service';
import { get as getObject } from '../services/r2.service';

const downloadRouter = new Hono<AppEnv>();

const TOKEN_PREFIX = 'downloadTokens';
const DOWNLOAD_TOKEN_TTL_SECONDS = 300;

function buildTokenKey(token: string) {
  return `${TOKEN_PREFIX}/${token}.json`;
}

async function createDownloadToken(env: AppEnv['Bindings'], {
  userId,
  fileName,
  uploadedAt
}: {
  userId: string;
  fileName: string;
  uploadedAt?: Date;
}) {
  const token = nanoid(32);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + DOWNLOAD_TOKEN_TTL_SECONDS * 1000);
  const videoUploadedAt = uploadedAt ?? createdAt;

  const record = {
    token,
    userId,
    fileName,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    videoUploadedAt: videoUploadedAt.toISOString()
  };

  await writeJSON(env, buildTokenKey(token), record);

  return { token, videoUploadedAt };
}

async function consumeDownloadToken(env: AppEnv['Bindings'], token: string) {
  const now = new Date();
  const record = await readJSON<{
    fileName: string;
    expiresAt: string;
    videoUploadedAt?: string;
    createdAt: string;
  }>(env, buildTokenKey(token));

  if (!record) {
    return { status: 'not_found' } as const;
  }

  const expiresAt = new Date(record.expiresAt);
  if (expiresAt <= now) {
    return { status: 'expired' } as const;
  }

  const object = await getObject(env, record.fileName, { type: 'stream' });
  if (!object || !object.body) {
    return { status: 'not_found' } as const;
  }

  return {
    status: 'ok' as const,
    fileName: record.fileName,
    body: object.body,
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'content-length': object.size.toString(),
      'content-disposition': `inline; filename="${record.fileName.split('/').pop() ?? 'file'}"`
    }
  };
}

downloadRouter.post('/download/generate', requireAuth, async (c: Context<AppEnv>) => {
  const user = getRequestUser(c);
  if (!user) {
    return c.json({ message: 'Authentication required' }, 401);
  }

  const body = (await c.req.json()) as Record<string, unknown>;
  const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
  const uploadedAt = body.uploadedAt ? new Date(String(body.uploadedAt)) : undefined;

  if (!fileName) {
    return c.json({ message: 'fileName is required' }, 400);
  }

  if (uploadedAt && Number.isNaN(uploadedAt.getTime())) {
    return c.json({ message: 'uploadedAt must be a valid date string' }, 400);
  }

  const { token, videoUploadedAt } = await createDownloadToken(c.env, {
    userId: user.id,
    fileName,
    uploadedAt
  });

  return c.json({
    url: `/download/use/${token}`,
    expiresInSeconds: DOWNLOAD_TOKEN_TTL_SECONDS,
    uploadedAt: videoUploadedAt.toISOString()
  }, 201);
});

downloadRouter.get('/download/use/:token', async (c: Context<AppEnv>) => {
  const token = c.req.param('token');
  const result = await consumeDownloadToken(c.env, token);

  if (result.status === 'not_found') {
    return c.json({ message: 'Token not found' }, 404);
  }

  if (result.status === 'expired') {
    return c.json({ message: 'Token expired' }, 410);
  }

  return new Response(result.body, {
    headers: result.headers
  });
});

export function registerDownloadRoutes(app: Hono<AppEnv>) {
  app.route('/', downloadRouter);
}
