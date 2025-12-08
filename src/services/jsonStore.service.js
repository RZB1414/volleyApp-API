import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand
} from '@aws-sdk/client-s3';

import { dataBucketName, r2Data } from './r2Data.service.js';

function isNotFound(error) {
  if (!error) {
    return false;
  }

  const statusCode = error.$metadata?.httpStatusCode;
  return error.name === 'NoSuchKey' || error.name === 'NotFound' || statusCode === 404;
}

export async function headObject(key) {
  try {
    const command = new HeadObjectCommand({ Bucket: dataBucketName, Key: key });
    return await r2Data.send(command);
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }

    throw error;
  }
}

export async function getJsonObject(key) {
  try {
    const command = new GetObjectCommand({ Bucket: dataBucketName, Key: key });
    const response = await r2Data.send(command);
    const body = await response.Body.transformToString();
    return JSON.parse(body);
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }

    throw error;
  }
}

export async function putJsonObject(key, value, { ifNoneMatch } = {}) {
  const body = JSON.stringify(value);
  const command = new PutObjectCommand({
    Bucket: dataBucketName,
    Key: key,
    Body: body,
    ContentType: 'application/json',
    IfNoneMatch: ifNoneMatch
  });

  return r2Data.send(command);
}

export async function deleteObject(key) {
  const command = new DeleteObjectCommand({ Bucket: dataBucketName, Key: key });
  return r2Data.send(command);
}

export async function listObjects({ prefix, maxKeys = 1000, continuationToken } = {}) {
  const command = new ListObjectsV2Command({
    Bucket: dataBucketName,
    Prefix: prefix,
    MaxKeys: maxKeys,
    ContinuationToken: continuationToken
  });

  return r2Data.send(command);
}
