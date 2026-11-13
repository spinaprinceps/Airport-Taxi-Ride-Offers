import { describe, it, expect } from 'vitest';
import { resolveChange } from '../../src/rules/changeRules.js';

const booking = { airport: 'NRT', flightId: 'FL-401', pickupAt: '2027-04-10T11:30' };
const fl401 = { flight_id: 'FL-401', to_airport: 'NRT', arrival_local: '2027-04-10T10:30' };
const fl405 = { flight_id: 'FL-405', to_airport: 'NRT', arrival_local: '2027-04-10T21:30' };
const fl403 = { flight_id: 'FL-403', to_airport: 'HND', arrival_local: '2027-04-10T08:30' };

describe('resolveChange', () => {
  it('pickup only keeps the flight', () => {
    expect(resolveChange(booking, fl401, { newPickupAt: '2027-04-10T12:00' }))
      .toEqual({ flightId: 'FL-401', pickupAt: '2027-04-10T12:00', violations: [] });
  });

  it('flight only sets pickup to landing + 60', () => {
    expect(resolveChange(booking, fl405, { newFlightId: 'FL-405' }))
      .toEqual({ flightId: 'FL-405', pickupAt: '2027-04-10T22:30', violations: [] });
  });

  it('a landing + 60 past midnight moves the pickup to the next day', () => {
    const late = { flight_id: 'FL-X', to_airport: 'NRT', arrival_local: '2027-04-10T23:30' };
    expect(resolveChange(booking, late, { newFlightId: 'FL-X' }).pickupAt).toBe('2027-04-11T00:30');
  });

  it('different airport -> R9; unknown flight -> R1', () => {
    expect(resolveChange(booking, fl403, { newFlightId: 'FL-403' }).violations.map((x) => x.rule)).toEqual(['R9']);
    expect(resolveChange(booking, null, { newFlightId: 'FL-999' }).violations.map((x) => x.rule)).toEqual(['R1']);
  });

  it('nothing to change -> R9', () => {
    expect(resolveChange(booking, fl401, { newPickupAt: '2027-04-10T11:30' }).violations[0].message).toBe('Nothing to change.');
  });
});
