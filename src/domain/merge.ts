import { DEFAULT_PREFERENCES } from './defaults.js';
import type { PreferenceItem, UserPreferences } from './types.js';

/**
 * Merge user overrides on top of defaults so the API always returns a
 * complete picture. Per-user overrides win.
 */
export function effectivePreferences(stored: UserPreferences): UserPreferences {
  const merged = new Map<string, PreferenceItem>();
  for (const it of DEFAULT_PREFERENCES) merged.set(key(it), { ...it });
  for (const it of stored.items) merged.set(key(it), { ...it });

  return {
    ...stored,
    items: [...merged.values()].sort((a, b) => {
      const t = a.notificationType.localeCompare(b.notificationType);
      return t !== 0 ? t : a.channel.localeCompare(b.channel);
    }),
  };
}

function key(i: PreferenceItem): string {
  return `${i.notificationType}::${i.channel}`;
}
