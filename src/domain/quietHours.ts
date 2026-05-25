import { DateTime } from 'luxon';
import type { QuietHours } from './types.js';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseHHmm(v: string): { h: number; m: number } {
  const match = HHMM.exec(v);
  if (!match) throw new Error(`Invalid HH:mm value: ${v}`);
  return { h: Number(match[1]), m: Number(match[2]) };
}

export function validateQuietHours(qh: QuietHours): void {
  parseHHmm(qh.start);
  parseHHmm(qh.end);
  if (!DateTime.now().setZone(qh.timezone).isValid) {
    throw new Error(`Invalid IANA timezone: ${qh.timezone}`);
  }
  if (qh.start === qh.end) {
    throw new Error('Quiet hours start and end must differ');
  }
}

/**
 * Check if `instant` falls into the user's quiet-hours window.
 *
 * The window is interpreted in the user's timezone. Windows that wrap past
 * midnight (e.g. 22:00–08:00) are supported.
 */
export function isInsideQuietHours(qh: QuietHours, instant: Date): boolean {
  const local = DateTime.fromJSDate(instant, { zone: qh.timezone });
  if (!local.isValid) return false;

  const { h: sh, m: sm } = parseHHmm(qh.start);
  const { h: eh, m: em } = parseHHmm(qh.end);

  const nowMinutes = local.hour * 60 + local.minute;
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  if (startMinutes < endMinutes) {
    // Same-day window: [start, end)
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  // Wrapping window: [start, 24:00) ∪ [00:00, end)
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}
