import { nanoid } from 'nanoid';

import { createPresignedDownload } from './presigned.service.js';
import { getDownloadTokensCollection } from '../db/mongo.js';

const DOWNLOAD_TOKEN_TTL_SECONDS = Number.parseInt(
  process.env.DOWNLOAD_TOKEN_TTL_SECONDS ?? '300',
  10
);

export async function createDownloadToken({ userId, fileName }) {
  const presignedUrl = await createPresignedDownload(fileName, DOWNLOAD_TOKEN_TTL_SECONDS);

  const token = nanoid(32);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + DOWNLOAD_TOKEN_TTL_SECONDS * 1000);

  const collection = getDownloadTokensCollection();

  await collection.insertOne({
    token,
    userId,
    fileName,
    presignedUrl,
    used: false,
    createdAt,
    expiresAt
  });

  return { token };
}

export async function consumeDownloadToken(token) {
  const now = new Date();
  const collection = getDownloadTokensCollection();

  const result = await collection.findOneAndUpdate(
    {
      token,
      used: false,
      expiresAt: { $gt: now }
    },
    {
      $set: { used: true, usedAt: now }
    },
    {
      returnDocument: 'before'
    }
  );

  if (!result.value) {
    const existing = await collection.findOne({ token });

    if (!existing) {
      return { status: 'not_found' };
    }

    if (existing.used) {
      return { status: 'already_used' };
    }

    if (existing.expiresAt <= now) {
      return { status: 'expired' };
    }

    return { status: 'invalid' };
  }

  return {
    status: 'ok',
    fileName: result.value.fileName,
    presignedUrl: result.value.presignedUrl
  };
}
