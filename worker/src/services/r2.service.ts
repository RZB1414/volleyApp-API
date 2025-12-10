import type { AppBindings, R2GetOptions, R2ListOptions, R2ObjectBody, R2PutOptions } from '../types';

export type RetrievedObject = {
  body: ReadableStream<Uint8Array> | null;
  size: number;
  etag: string;
  customMetadata: Record<string, string>;
  httpMetadata: Record<string, string> | null;
};

type BucketTarget = 'media' | 'data';

function resolveBucket(env: AppBindings, bucket: BucketTarget) {
  return bucket === 'data' ? env.VOLLEY_DATA : env.VOLLEY_MEDIA;
}

export async function put(
  env: AppBindings,
  key: string,
  data: BodyInit | ArrayBuffer | ArrayBufferView | ReadableStream,
  options: R2PutOptions = {},
  bucket: BucketTarget = 'media'
) {
  const target = resolveBucket(env, bucket);
  return target.put(key, data, options);
}

export async function get(
  env: AppBindings,
  key: string,
  options: R2GetOptions = { type: 'stream' },
  bucket: BucketTarget = 'media'
): Promise<RetrievedObject | null> {
  const target = resolveBucket(env, bucket);
  const object = await target.get(key, options);
  if (!object) {
    return null;
  }

  return {
    body: object.body,
    size: object.size,
    etag: object.httpEtag,
    customMetadata: object.customMetadata ?? {},
    httpMetadata: object.httpMetadata ?? null
  };
}

export async function remove(env: AppBindings, key: string, bucket: BucketTarget = 'media') {
  const target = resolveBucket(env, bucket);
  await target.delete(key);
}

export async function list(
  env: AppBindings,
  options: R2ListOptions = {},
  bucket: BucketTarget = 'media'
) {
  const target = resolveBucket(env, bucket);
  return target.list(options);
}
