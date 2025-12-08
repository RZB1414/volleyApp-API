import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  UploadPartCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { r2 } from './r2.service.js';

const DEFAULT_EXPIRATION_SECONDS = Number.parseInt(
  process.env.PRESIGNED_URL_TTL_SECONDS ?? '300',
  10
);
const MULTIPART_EXPIRATION_SECONDS = Number.parseInt(
  process.env.MULTIPART_URL_TTL_SECONDS ?? '900',
  10
);

const bucketName = process.env.R2_BUCKET_NAME ?? 'videos';

function isNotFound(error) {
  if (!error) {
    return false;
  }

  const statusCode = error.$metadata?.httpStatusCode;
  return error.name === 'NoSuchKey' || error.name === 'NotFound' || statusCode === 404;
}

export async function objectExists(key) {
  if (!key) {
    return false;
  }

  try {
    const command = new HeadObjectCommand({ Bucket: bucketName, Key: key });
    await r2.send(command);
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }

    throw error;
  }
}

export async function createPresignedDownload(
  fileName,
  expiresInSeconds = DEFAULT_EXPIRATION_SECONDS
) {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: fileName
  });

  return getSignedUrl(r2, command, { expiresIn: expiresInSeconds });
}

export async function createMultipartUploadUrls({ fileName, contentType, parts, userId }) {
  if (!fileName) {
    throw new Error('fileName is required');
  }

  if (!parts || parts < 1) {
    throw new Error('parts must be at least 1');
  }

  const createCommand = new CreateMultipartUploadCommand({
    Bucket: bucketName,
    Key: fileName,
    ContentType: contentType,
    Metadata: userId
      ? {
          'user-id': userId
        }
      : undefined
  });

  const { UploadId } = await r2.send(createCommand);

  const urls = await Promise.all(
    Array.from({ length: parts }, (_, index) => index + 1).map(async (partNumber) => {
      const uploadPartCommand = new UploadPartCommand({
        Bucket: bucketName,
        Key: fileName,
        UploadId,
        PartNumber: partNumber
      });

      const url = await getSignedUrl(r2, uploadPartCommand, {
        expiresIn: MULTIPART_EXPIRATION_SECONDS
      });

      return { partNumber, url };
    })
  );

  return { uploadId: UploadId, bucket: bucketName, urls };
}

export async function completeMultipartUpload({ fileName, uploadId, parts }) {
  if (!parts || parts.length === 0) {
    throw new Error('parts are required to complete upload');
  }

  const command = new CompleteMultipartUploadCommand({
    Bucket: bucketName,
    Key: fileName,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.map(({ ETag, partNumber }) => ({ ETag, PartNumber: partNumber }))
    }
  });

  const response = await r2.send(command);
  return {
    bucket: response.Bucket,
    location: response.Location,
    key: response.Key,
    etag: response.ETag
  };
}

export async function abortMultipartUpload({ fileName, uploadId }) {
  const command = new AbortMultipartUploadCommand({
    Bucket: bucketName,
    Key: fileName,
    UploadId: uploadId
  });

  await r2.send(command);
}

export async function listIncompleteMultipartUploads({ userId, maxUploads = 50 }) {
  if (!userId) {
    throw new Error('userId is required');
  }

  const normalizedLimit = Number.parseInt(maxUploads, 10);
  const limit = Number.isNaN(normalizedLimit) || normalizedLimit <= 0 ? 50 : normalizedLimit;

  const command = new ListMultipartUploadsCommand({
    Bucket: bucketName,
    Prefix: `${userId}/`,
    MaxUploads: limit
  });

  const { Uploads } = await r2.send(command);

  return (Uploads ?? []).map((upload) => ({
    key: upload.Key,
    uploadId: upload.UploadId,
    initiatedAt: upload.Initiated
  }));
}

export async function listCompletedUploads({ userId, maxKeys = 50, continuationToken } = {}) {
  if (!userId) {
    throw new Error('userId is required');
  }

  const normalizedLimit = Number.parseInt(maxKeys, 10);
  const limit = Number.isNaN(normalizedLimit) || normalizedLimit <= 0 ? 50 : normalizedLimit;

  const command = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: `${userId}/`,
    MaxKeys: limit,
    ContinuationToken: continuationToken
  });

  const { Contents, IsTruncated, NextContinuationToken } = await r2.send(command);

  return {
    objects:
      Contents?.map((object) => ({
        key: object.Key,
        size: object.Size,
        lastModified: object.LastModified,
        etag: object.ETag
      })) ?? [],
    isTruncated: Boolean(IsTruncated),
    nextContinuationToken: NextContinuationToken ?? null
  };
}
