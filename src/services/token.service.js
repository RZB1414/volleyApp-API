import { nanoid } from 'nanoid';

import { createPresignedDownload } from './presigned.service.js';
import { getDownloadTokensCollection } from '../db/mongo.js';

const DOWNLOAD_TOKEN_TTL_SECONDS = Number.parseInt(
  process.env.DOWNLOAD_TOKEN_TTL_SECONDS ?? '300',
  10
);

export async function createDownloadToken({ userId, fileName, uploadedAt }) {
  const token = nanoid(32);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + DOWNLOAD_TOKEN_TTL_SECONDS * 1000);
  const videoUploadedAt = uploadedAt ?? createdAt;

  const collection = getDownloadTokensCollection();

  await collection.insertOne({
    token,
    userId,
    fileName,
    createdAt,
    expiresAt,
    videoUploadedAt
  });

  return { token, videoUploadedAt };
}

export async function consumeDownloadToken(token) {
  const now = new Date();
  const collection = getDownloadTokensCollection();

  const record = await collection.findOne({ token });

  if (!record) {
    return { status: 'not_found' };
  }

  if (record.expiresAt <= now) {
    return { status: 'expired' };
  }

  const presignedUrl = await createPresignedDownload(record.fileName, DOWNLOAD_TOKEN_TTL_SECONDS);

  return {
    status: 'ok',
    fileName: record.fileName,
    presignedUrl,
    expiresAt: record.expiresAt,
    uploadedAt: record.videoUploadedAt ?? record.createdAt
  };
}
