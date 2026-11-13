import { describe, it, expect } from 'vitest';
import { overlaps } from '../../src/rules/intervals.js';

describe('overlaps (R6, half-open [start, end))', () => {
  const a = ['2027-04-10T11:00', '2027-04-10T14:00'];

  it('back to back does not overlap', () => {
    expect(overlaps(...a, '2027-04-10T14:00', '2027-04-10T16:00')).toBe(false);
    expect(overlaps('2027-04-10T14:00', '2027-04-10T16:00', ...a)).toBe(false);
  });

  it('one minute of overlap counts', () => {
    expect(overlaps(...a, '2027-04-10T13:59', '2027-04-10T16:00')).toBe(true);
  });

  it('containment and crossing midnight', () => {
    expect(overlaps(...a, '2027-04-10T12:00', '2027-04-10T12:30')).toBe(true);
    expect(overlaps('2027-04-10T23:00', '2027-04-11T01:30', '2027-04-11T01:00', '2027-04-11T02:00')).toBe(true);
  });
});
