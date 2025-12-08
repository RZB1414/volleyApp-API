import { S3Client } from '@aws-sdk/client-s3';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.R2_DATA_ACCESS_KEY;
const secretAccessKey = process.env.R2_DATA_SECRET_KEY;
export const dataBucketName = process.env.R2_DATA_BUCKET_NAME;

if (!accountId) {
  throw new Error('CLOUDFLARE_ACCOUNT_ID must be defined');
}

if (!accessKeyId || !secretAccessKey) {
  throw new Error('R2_DATA_ACCESS_KEY and R2_DATA_SECRET_KEY must be defined');
}

if (!dataBucketName) {
  throw new Error('R2_DATA_BUCKET_NAME must be defined');
}

export const r2Data = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
});
