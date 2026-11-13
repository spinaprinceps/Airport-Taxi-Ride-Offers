import { describe, it, expect } from 'vitest';
import { isOpenAt } from '../../src/rules/hours.js';

describe('isOpenAt (R4 hours, both ends included)', () => {
  it('normal window: Sakura 06:00-23:00', () => {
    expect(isOpenAt('06:00', '23:00', '23:00')).toBe(true);
    expect(isOpenAt('06:00', '23:00', '06:00')).toBe(true);
    expect(isOpenAt('06:00', '23:00', '23:01')).toBe(false);
    expect(isOpenAt('06:00', '23:00', '05:59')).toBe(false);
  });

  it('window crossing midnight: Marina Rides 05:00-01:00', () => {
    expect(isOpenAt('05:00', '01:00', '00:30')).toBe(true);
    expect(isOpenAt('05:00', '01:00', '01:00')).toBe(true);
    expect(isOpenAt('05:00', '01:00', '01:01')).toBe(false);
    expect(isOpenAt('05:00', '01:00', '04:59')).toBe(false);
    expect(isOpenAt('05:00', '01:00', '05:00')).toBe(true);
    expect(isOpenAt('05:00', '01:00', '23:59')).toBe(true);
  });

  it('00:00-23:59 is always open', () => {
    for (const t of ['00:00', '12:00', '23:59']) expect(isOpenAt('00:00', '23:59', t)).toBe(true);
  });

  it('accepts HH:MM:SS from the database', () => {
    expect(isOpenAt('06:00:00', '23:00:00', '23:00')).toBe(true);
  });
});
