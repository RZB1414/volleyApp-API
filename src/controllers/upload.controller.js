import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUploadUrls,
  listIncompleteMultipartUploads
} from '../services/presigned.service.js';

const CHUNK_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB per part
const DEFAULT_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? 'videos';

function buildUserScopedKey(userId, rawFileName) {
  if (!userId) {
    throw new Error('User id is required to scope uploads');
  }

  const sanitized = rawFileName?.trim().replace(/^\/+/, '');

  if (!sanitized) {
    throw new Error('fileName is required');
  }

  const prefix = `${userId}/`;
  return sanitized.startsWith(prefix) ? sanitized : `${prefix}${sanitized}`;
}

export async function createMultipartUpload(req, res, next) {
  try {
    const { fileName, contentType, parts, fileSizeBytes } = req.body;
    const userId = req.user?.id;
    const hasExplicitParts = parts !== undefined && parts !== null && `${parts}`.length > 0;
    let partCount;

    if (hasExplicitParts) {
      partCount = Number.parseInt(parts, 10);
    } else if (fileSizeBytes !== undefined && fileSizeBytes !== null) {
      const normalizedSize = Number(fileSizeBytes);

      if (Number.isNaN(normalizedSize) || normalizedSize <= 0) {
        return res.status(400).json({ message: 'fileSizeBytes must be a positive number' });
      }

      partCount = Math.max(1, Math.ceil(normalizedSize / CHUNK_SIZE_BYTES));
    } else {
      partCount = 1;
    }

    if (!fileName) {
      return res.status(400).json({ message: 'fileName is required' });
    }

    if (Number.isNaN(partCount) || partCount < 1) {
      return res.status(400).json({ message: 'Calculated part count must be a positive integer' });
    }

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const fileKey = buildUserScopedKey(userId, fileName);

    const result = await createMultipartUploadUrls({
      fileName: fileKey,
      contentType,
      parts: partCount,
      userId
    });

    return res.status(201).json({
      ...result,
      partCount,
      chunkSizeBytes: CHUNK_SIZE_BYTES,
      fileKey,
      originalFileName: fileName
    });
  } catch (error) {
    return next(error);
  }
}

export async function finalizeMultipartUpload(req, res, next) {
  try {
    const { fileName, fileKey, uploadId, parts } = req.body;
    const userId = req.user?.id;
    const normalizedParts = (parts ?? []).map((part) => ({
      ETag: part.ETag ?? part.etag,
      partNumber: Number.parseInt(part.partNumber ?? part.PartNumber, 10)
    }));

    if (
      normalizedParts.length === 0 ||
      normalizedParts.some((part) => !part.ETag || Number.isNaN(part.partNumber))
    ) {
      return res.status(400).json({ message: 'Valid parts array is required' });
    }

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const scopedKey = buildUserScopedKey(userId, fileKey ?? fileName);

    const result = await completeMultipartUpload({
      fileName: scopedKey,
      uploadId,
      parts: normalizedParts
    });

    return res.json({
      message: 'Upload finalized successfully',
      bucket: result.bucket ?? DEFAULT_BUCKET_NAME,
      key: result.key ?? scopedKey,
      etag: result.etag,
      location: result.location,
      fileName: scopedKey,
      ownerId: userId
    });
  } catch (error) {
    return next(error);
  }
}

export async function cancelMultipartUpload(req, res, next) {
  try {
    const { fileName, fileKey, uploadId } = req.body;
    const userId = req.user?.id;

    if (!fileName && !fileKey) {
      return res.status(400).json({ message: 'fileName or fileKey is required' });
    }

    if (!uploadId) {
      return res.status(400).json({ message: 'uploadId is required' });
    }

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const scopedKey = buildUserScopedKey(userId, fileKey ?? fileName);

    await abortMultipartUpload({ fileName: scopedKey, uploadId });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

export async function listIncompleteUploads(req, res, next) {
  try {
    const userId = req.user?.id;
    const limitParam = req.query.limit;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (limitParam !== undefined) {
      const parsed = Number.parseInt(limitParam, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        return res.status(400).json({ message: 'limit must be a positive integer' });
      }
    }

    const uploads = await listIncompleteMultipartUploads({
      userId,
      maxUploads: limitParam
    });

    return res.json({
      uploads
    });
  } catch (error) {
    return next(error);
  }
}
