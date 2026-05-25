import { describe, expect, it } from 'vitest';
import {
  isInsideQuietHours,
  validateQuietHours,
} from '../src/domain/quietHours.js';
import type { QuietHours } from '../src/domain/types.js';

const sameDay: QuietHours = {
  start: '13:00',
  end: '15:00',
  timezone: 'Europe/Moscow',
  appliesTo: ['marketing_push'],
};

const wrapping: QuietHours = {
  start: '22:00',
  end: '08:00',
  timezone: 'Europe/Moscow',
  appliesTo: ['marketing_push'],
};

describe('quiet hours', () => {
  it('detects inside same-day window', () => {
    // 2026-05-21 14:00 Moscow = 11:00 UTC
    expect(isInsideQuietHours(sameDay, new Date('2026-05-21T11:00:00Z'))).toBe(true);
  });

  it('detects outside same-day window', () => {
    expect(isInsideQuietHours(sameDay, new Date('2026-05-21T15:30:00Z'))).toBe(false);
  });

  it('handles window wrapping past midnight (late evening)', () => {
    // 21:30 UTC = 00:30 Moscow next day → inside (after midnight, before 08:00)
    expect(isInsideQuietHours(wrapping, new Date('2026-05-21T21:30:00Z'))).toBe(true);
  });

  it('handles window wrapping past midnight (early morning)', () => {
    // 03:00 UTC = 06:00 Moscow → still inside
    expect(isInsideQuietHours(wrapping, new Date('2026-05-21T03:00:00Z'))).toBe(true);
  });

  it('respects upper bound exclusivity', () => {
    // 05:00 UTC = 08:00 Moscow → outside
    expect(isInsideQuietHours(wrapping, new Date('2026-05-21T05:00:00Z'))).toBe(false);
  });

  it('rejects invalid timezones', () => {
    expect(() =>
      validateQuietHours({ ...wrapping, timezone: 'Not/A_Zone' }),
    ).toThrow();
  });

  it('rejects equal start and end', () => {
    expect(() =>
      validateQuietHours({ ...wrapping, start: '10:00', end: '10:00' }),
    ).toThrow();
  });
});
