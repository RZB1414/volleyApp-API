import { Hono, type Context } from 'hono';

import type { AppEnv } from '../types';
import { requireAuth, getRequestUser } from '../middleware/auth';
import { readFileFromForm } from '../utils/parseMultipart';
import { put, get as getObject, list as listObjects } from '../services/r2.service';
import { readJSON, writeJSON } from '../services/jsonStore.service';

const uploadRouter = new Hono<AppEnv>();

const CHUNK_SIZE_BYTES = 100 * 1024 * 1024;
const COMPLETED_INDEX_PREFIX = 'uploads/completed';
const INCOMPLETE_INDEX_PREFIX = 'uploads/incomplete';

function buildUserScopedKey(userId: string, rawFileName: string) {
  const sanitized = rawFileName.trim().replace(/^\/+/g, '');
  const prefix = `${userId}/`;
  return sanitized.startsWith(prefix) ? sanitized : `${prefix}${sanitized}`;
}

function buildCompletedKey(userId: string, fileKey: string) {
  return `${COMPLETED_INDEX_PREFIX}/${userId}/${fileKey}.json`;
}

function buildUploadMetadata(file: File, ownerId: string, key: string) {
  return {
    contentType: file.type || 'application/octet-stream',
    ownerId,
    key,
    fileName: file.name,
    size: file.size,
    uploadedAt: new Date().toISOString()
  };
}

uploadRouter.post('/upload', requireAuth, async (c: Context<AppEnv>) => {
  const user = getRequestUser(c);
  if (!user) {
    return c.json({ message: 'Authentication required' }, 401);
  }

  const fileEntry = await readFileFromForm(c.req.raw, 'file');
  if (!fileEntry) {
    return c.json({ message: 'file field is required' }, 400);
  }

  const scopedKey = buildUserScopedKey(user.id, fileEntry.filename);

  const existing = await getObject(c.env, scopedKey);
  if (existing && fileEntry.filename.toLowerCase().endsWith('.pdf')) {
    return c.json({ message: 'This PDF has already been uploaded for this user' }, 409);
  }

  await put(c.env, scopedKey, fileEntry.file.stream(), {
    httpMetadata: {
      contentType: fileEntry.contentType ?? 'application/octet-stream'
    },
    customMetadata: {
      ownerId: user.id,
      originalFileName: fileEntry.filename
    }
  });

  const metadata = buildUploadMetadata(fileEntry.file, user.id, scopedKey);
  await writeJSON(c.env, buildCompletedKey(user.id, scopedKey), metadata);

  return c.json({ message: 'Upload completed', key: scopedKey, metadata }, 201);
});

uploadRouter.get('/upload/completed', requireAuth, async (c: Context<AppEnv>) => {
  const user = getRequestUser(c);
  if (!user) {
    return c.json({ message: 'Authentication required' }, 401);
  }

  const prefix = `${COMPLETED_INDEX_PREFIX}/${user.id}/`;
  const records = await listObjects(c.env, { prefix }, 'data');
  const uploads = await Promise.all(
    records.objects.map(async (object) => {
      const entry = await readJSON<Record<string, unknown>>(c.env, object.key);
      return entry;
    })
  );

  return c.json({ uploads });
});

uploadRouter.get('/upload/incomplete', requireAuth, async (c: Context<AppEnv>) => {
  const user = getRequestUser(c);
  if (!user) {
    return c.json({ message: 'Authentication required' }, 401);
  }

  const prefix = `${INCOMPLETE_INDEX_PREFIX}/${user.id}/`;
  const records = await listObjects(c.env, { prefix }, 'data');
  const uploads = await Promise.all(
    records.objects.map(async (object) => {
      const entry = await readJSON<Record<string, unknown>>(c.env, object.key);
      return entry;
    })
  );

  return c.json({ uploads });
});

export function registerUploadRoutes(app: Hono<AppEnv>) {
  app.route('/', uploadRouter);
}
