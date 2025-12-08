import { nanoid } from 'nanoid';

import { createPresignedDownload } from './presigned.service.js';
import { getJsonObject, putJsonObject } from './jsonStore.service.js';

const DOWNLOAD_TOKEN_PREFIX = 'downloadTokens';

function buildTokenKey(token) {
  return `${DOWNLOAD_TOKEN_PREFIX}/${token}.json`;
}

const DOWNLOAD_TOKEN_TTL_SECONDS = Number.parseInt(
  process.env.DOWNLOAD_TOKEN_TTL_SECONDS ?? '300',
  10
);

export async function createDownloadToken({ userId, fileName, uploadedAt }) {
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

  await putJsonObject(buildTokenKey(token), record);

  return { token, videoUploadedAt };
}

export async function consumeDownloadToken(token) {
  const now = new Date();
  const record = await getJsonObject(buildTokenKey(token));

  if (!record) {
    return { status: 'not_found' };
  }

  const expiresAt = new Date(record.expiresAt);
  if (expiresAt <= now) {
    return { status: 'expired' };
  }

  const presignedUrl = await createPresignedDownload(record.fileName, DOWNLOAD_TOKEN_TTL_SECONDS);
  const uploadedAt = record.videoUploadedAt
    ? new Date(record.videoUploadedAt)
    : new Date(record.createdAt);

  return {
    status: 'ok',
    fileName: record.fileName,
    presignedUrl,
    expiresAt,
    uploadedAt
  };
}
