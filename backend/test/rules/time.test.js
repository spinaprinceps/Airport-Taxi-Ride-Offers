import { describe, it, expect } from 'vitest';
import { isLocalDateTime, addMinutes, pretty } from '../../src/time.js';

describe('time helpers', () => {
  it('accepts local date-times and refuses zones', () => {
    expect(isLocalDateTime('2027-04-10T11:30')).toBe(true);
    expect(isLocalDateTime('2027-04-10T11:30Z')).toBe(false);
    expect(isLocalDateTime('2027-04-10T11:30+05:30')).toBe(false);
    expect(isLocalDateTime('10/04/2027 11:30')).toBe(false);
  });

  it('adds minutes across midnight without zone shifts', () => {
    expect(addMinutes('2027-04-10T10:30', 60)).toBe('2027-04-10T11:30');
    expect(addMinutes('2027-04-10T23:30', 120)).toBe('2027-04-11T01:30');
  });

  it('pretty prints for messages', () => {
    expect(pretty('2027-04-10T11:00')).toBe('10 Apr 11:00');
  });
});
