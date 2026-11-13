import { describe, it, expect } from 'vitest';
import { checkAirportServesCity } from '../../src/rules/requestRules.js';

const nrt = { code: 'NRT', servesCities: ['Tokyo'] };
const dxb = { code: 'DXB', servesCities: ['Dubai', 'Abu Dhabi'] };
const auh = { code: 'AUH', servesCities: ['Abu Dhabi'] };
const del = { code: 'DEL', servesCities: [] };

describe('checkAirportServesCity (R1)', () => {
  it('passes when the airport serves the hotel city', () => {
    expect(checkAirportServesCity(nrt, { city: 'Tokyo' })).toBeNull();
    expect(checkAirportServesCity(dxb, { city: 'Abu Dhabi' })).toBeNull();
  });

  it('names the airport, the city and what it does serve', () => {
    expect(checkAirportServesCity(nrt, { city: 'Osaka' })).toEqual({
      rule: 'R1',
      field: 'hotelId',
      message: 'NRT does not serve Osaka. It serves: Tokyo.',
    });
    expect(checkAirportServesCity(auh, { city: 'Dubai' }).message).toBe(
      'AUH does not serve Dubai. It serves: Abu Dhabi.',
    );
  });

  it('an airport with no cities is not an arrival airport', () => {
    expect(checkAirportServesCity(del, { city: 'Tokyo' })).toMatchObject({
      rule: 'R1',
      field: 'flightId',
      message: 'DEL is not an arrival airport for this service (NRT, HND, KIX, DXB, AUH).',
    });
  });
});
