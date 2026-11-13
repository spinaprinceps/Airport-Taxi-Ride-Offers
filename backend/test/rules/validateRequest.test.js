import { describe, it, expect } from 'vitest';
import { validateRequest } from '../../src/rules/requestRules.js';

const flight = { flight_id: 'FL-401', to_airport: 'NRT', arrival_local: '2027-04-10T10:30' };
const hotel = { hotel_id: 'HTL-TYO-004', city: 'Tokyo', area: 'Ueno' };
const airport = { code: 'NRT', servesCities: ['Tokyo'] };
const route = { airport: 'NRT', city: 'Tokyo', area: 'Ueno', drive_minutes: 90, price_min_inr: 10200, price_max_inr: 16800 };

const menon = {
  travelerName: 'Menon family', flightId: 'FL-401', hotelId: 'HTL-TYO-004',
  adults: 2, childAges: [6], largeBags: 3, smallBags: 2,
  pickupAt: '2027-04-10T11:30', carType: null, priceInr: 12000,
};
const check = (patch, ctx = {}) =>
  validateRequest({ ...menon, ...patch }, ctx.flight ?? flight, 'hotel' in ctx ? ctx.hotel : hotel, airport, route);

describe('validateRequest (R1-R3, all violations at once)', () => {
  it('Menon passes', () => {
    expect(check({})).toEqual([]);
  });

  it('R3 range ends are allowed, one rupee outside is refused with the range', () => {
    expect(check({ priceInr: 10200 })).toEqual([]);
    expect(check({ priceInr: 16800 })).toEqual([]);
    expect(check({ priceInr: 10199 })).toEqual([{
      rule: 'R3', field: 'priceInr',
      message: 'Price ₹10,199 is below the minimum ₹10,200 (range ₹10,200 – ₹16,800).',
    }]);
    expect(check({ priceInr: 16801 })[0].message).toBe(
      'Price ₹16,801 is above the maximum ₹16,800 (range ₹10,200 – ₹16,800).');
  });

  it('R2 pickup must be at least landing + 60', () => {
    expect(check({ pickupAt: '2027-04-10T11:29' })).toEqual([{
      rule: 'R2', field: 'pickupAt',
      message: 'Pickup 10 Apr 11:29 is too early: the flight lands 10 Apr 10:30, so the earliest pickup is 10 Apr 11:30.',
    }]);
    expect(check({ pickupAt: null })).toEqual([]);
  });

  it('adults 0, child age 18, large bags -1 -> three R1 violations', () => {
    const out = check({ adults: 0, childAges: [18], largeBags: -1 });
    expect(out.map((x) => [x.rule, x.field])).toEqual([
      ['R1', 'adults'], ['R1', 'childAges'], ['R1', 'largeBags'],
    ]);
  });

  it('unknown hotel is an R1 violation (and price is not checked without a route)', () => {
    const out = validateRequest({ ...menon, hotelId: 'HTL-X', priceInr: 1 }, flight, null, airport, null);
    expect(out).toEqual([{ rule: 'R1', field: 'hotelId', message: 'Hotel HTL-X does not exist.' }]);
  });

  it('a landing after 23:00 gives an earliest pickup on the next calendar day', () => {
    const late = { ...flight, arrival_local: '2027-04-10T23:15' };
    const out = validateRequest({ ...menon, pickupAt: '2027-04-10T23:59' }, late, hotel, airport, route);
    expect(out[0].message).toContain('earliest pickup is 11 Apr 00:15');
    expect(validateRequest({ ...menon, pickupAt: '2027-04-11T00:15' }, late, hotel, airport, route)).toEqual([]);
  });

  it('collects R1 + R2 + R3 together', () => {
    const out = check({ adults: 0, pickupAt: '2027-04-10T11:00', priceInr: 9000 });
    expect(out.map((x) => x.rule)).toEqual(['R1', 'R2', 'R3']);
  });
});
