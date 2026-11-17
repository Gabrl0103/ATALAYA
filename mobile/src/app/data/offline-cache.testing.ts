import type { OfflineStorage } from './offline-cache';

/** OfflineStorage in memory for the specs: what each key holds can be read back or set beforehand. */
export function memoryOfflineStorage(initial: Readonly<Record<string, string>> = {}): OfflineStorage & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    read: async (key) => data.get(key) ?? null,
    write: async (key, value) => {
      data.set(key, value);
    },
    remove: async (key) => {
      data.delete(key);
    },
    keys: async () => [...data.keys()],
  };
}
