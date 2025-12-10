export type R2GetType = 'text' | 'json' | 'arrayBuffer' | 'stream';

export interface R2GetOptions {
  type?: R2GetType;
}

export interface R2PutOptions {
  httpMetadata?: Record<string, string>;
  customMetadata?: Record<string, string>;
  md5?: ArrayBuffer;
}

export interface R2ListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
  delimiter?: string;
}

export interface R2ObjectBody {
  key: string;
  size: number;
  httpEtag: string;
  uploaded?: string;
  customMetadata?: Record<string, string>;
  httpMetadata?: Record<string, string>;
  body: ReadableStream<Uint8Array> | null;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

export interface R2ObjectsList {
  objects: R2ObjectBody[];
  truncated: boolean;
  cursor?: string;
}

export interface R2Bucket {
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: BodyInit | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: R2PutOptions
  ): Promise<R2ObjectBody | void>;
  delete(key: string): Promise<void>;
  list(options?: R2ListOptions): Promise<R2ObjectsList>;
}

export type AppBindings = {
  VOLLEY_MEDIA: R2Bucket;
  VOLLEY_DATA: R2Bucket;
  JWT_SECRET: string;
};

export type AppEnv = {
  Bindings: AppBindings;
};
