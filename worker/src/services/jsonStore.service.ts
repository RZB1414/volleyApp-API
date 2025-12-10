import type { AppBindings } from '../types';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

type JsonValue = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

export async function readJSON<T = JsonValue>(env: AppBindings, key: string): Promise<T | null> {
  const object = await env.VOLLEY_DATA.get(key, { type: 'text' });
  if (!object) {
    return null;
  }

  const text = await object.text();
  return JSON.parse(text) as T;
}

export async function writeJSON(env: AppBindings, key: string, data: JsonValue) {
  const body = JSON.stringify(data);
  await env.VOLLEY_DATA.put(key, body, {
    httpMetadata: {
      contentType: JSON_CONTENT_TYPE
    }
  });
}

export async function updateJSON(env: AppBindings, key: string, partial: Record<string, unknown>) {
  const current = (await readJSON<Record<string, unknown>>(env, key)) ?? {};
  const next = { ...current, ...partial };
  await writeJSON(env, key, next);
  return next;
}

export async function deleteJSON(env: AppBindings, key: string) {
  await env.VOLLEY_DATA.delete(key);
}

export async function listJSON<T = JsonValue>(env: AppBindings, prefix: string) {
  const { objects } = await env.VOLLEY_DATA.list({ prefix });
  const entries = await Promise.all(
    objects.map(async (object) => {
      const value = await readJSON<T>(env, object.key);
      return value === null ? null : { key: object.key, value };
    })
  );

  return entries.reduce<Array<{ key: string; value: T }>>((acc, entry) => {
    if (entry) {
      acc.push(entry);
    }
    return acc;
  }, []);
}
