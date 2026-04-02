type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
interface JsonObject { [key: string]: JsonValue }
interface JsonArray extends Array<JsonValue> {}

// Lightweight async KV adapter used by the edge function.
// For hackathon/demo use this keeps data in-memory for the function instance.
const globalStore = (globalThis as any).__zyrosafeKvStore as Map<string, unknown> | undefined;
const store: Map<string, unknown> = globalStore ?? new Map<string, unknown>();

if (!globalStore) {
  (globalThis as any).__zyrosafeKvStore = store;
}

export async function get<T = unknown>(key: string): Promise<T | null> {
  return (store.get(key) as T | undefined) ?? null;
}

export async function set<T = unknown>(key: string, value: T): Promise<void> {
  store.set(key, value);
}

export async function del(key: string): Promise<void> {
  store.delete(key);
}

export async function getByPrefix<T = unknown>(prefix: string): Promise<T[]> {
  const results: T[] = [];
  for (const [key, value] of store.entries()) {
    if (key.startsWith(prefix)) {
      results.push(value as T);
    }
  }
  return results;
}

export async function query<T = unknown>(prefix: string, predicate: (item: T) => boolean): Promise<T[]> {
  const items = await getByPrefix<T>(prefix);
  return items.filter(predicate);
}

export async function clearAll(): Promise<void> {
  store.clear();
}
