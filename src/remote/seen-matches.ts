import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface SeenMatchesStore {
  isSeen(reservationId: string): boolean;
  markSeen(reservationId: string): Promise<void>;
  size(): number;
}

interface OnDiskFormat {
  version: 1;
  reservationIds: string[];
}

const MAX_ENTRIES = 500;

/**
 * Load (or lazily create) the seen-matches store at <dataDir>/seen-matches.json.
 * We bound the stored list so the file doesn't grow forever; oldest entries
 * drop off once we exceed MAX_ENTRIES.
 */
export async function loadSeenMatches(dataDir: string): Promise<SeenMatchesStore> {
  const filePath = path.join(dataDir, 'seen-matches.json');
  await mkdir(dataDir, { recursive: true });

  const order: string[] = [];
  const set = new Set<string>();

  if (existsSync(filePath)) {
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as OnDiskFormat;
      if (parsed && Array.isArray(parsed.reservationIds)) {
        for (const id of parsed.reservationIds) {
          if (typeof id === 'string' && !set.has(id)) {
            set.add(id);
            order.push(id);
          }
        }
      }
    } catch {
      // Corrupt file: start fresh; the on-disk copy will be overwritten on next markSeen.
    }
  }

  async function persist() {
    const data: OnDiskFormat = { version: 1, reservationIds: order };
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  return {
    isSeen(reservationId) {
      return set.has(reservationId);
    },
    async markSeen(reservationId) {
      if (set.has(reservationId)) return;
      set.add(reservationId);
      order.push(reservationId);
      while (order.length > MAX_ENTRIES) {
        const removed = order.shift();
        if (removed !== undefined) set.delete(removed);
      }
      await persist();
    },
    size() {
      return set.size;
    },
  };
}
