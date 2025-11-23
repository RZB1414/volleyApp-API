import { S3Client } from '@aws-sdk/client-s3';

const endpointBase = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY;
const secretAccessKey = process.env.R2_SECRET_KEY;

if (!endpointBase) {
  throw new Error('CLOUDFLARE_ACCOUNT_ID must be defined');
}

if (!accessKeyId || !secretAccessKey) {
  throw new Error('R2_ACCESS_KEY and R2_SECRET_KEY must be defined');
}

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${endpointBase}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
});
