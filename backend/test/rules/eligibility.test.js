import { describe, it, expect } from 'vitest';
import { checkVehicle, evaluateSupplier, summarize } from '../../src/rules/eligibility.js';

const sakura = {
  companyId: 'TX-JP-01', name: 'Sakura Cabs', airports: ['NRT', 'HND'],
  areas: [{ city: 'Tokyo', area: 'Ueno' }, { city: 'Tokyo', area: 'Ginza' }],
  serviceFrom: '06:00', serviceUntil: '23:00',
  vehicles: [
    { vehicleId: 'SC-1', type: 'SEDAN', seats: 4, largeBags: 2, smallBags: 2 },
    { vehicleId: 'SC-2', type: 'SUV', seats: 6, largeBags: 4, smallBags: 3 },
    { vehicleId: 'SC-3', type: 'SUV', seats: 6, largeBags: 4, smallBags: 3 },
    { vehicleId: 'SC-4', type: 'HATCHBACK', seats: 4, largeBags: 1, smallBags: 2 },
  ],
};
const edo = {
  companyId: 'TX-JP-03', name: 'Edo Premium Cars', airports: ['NRT', 'HND'],
  areas: [{ city: 'Tokyo', area: 'Ueno' }], serviceFrom: '07:00', serviceUntil: '22:00',
  vehicles: [
    { vehicleId: 'EP-1', type: 'SEDAN', seats: 4, largeBags: 3, smallBags: 2 },
    { vehicleId: 'EP-2', type: 'SUV', seats: 6, largeBags: 3, smallBags: 3 },
  ],
};
const narita = {
  companyId: 'TX-JP-02', name: 'Narita Star Taxi', airports: ['NRT'],
  areas: [{ city: 'Tokyo', area: 'Ginza' }], serviceFrom: '00:00', serviceUntil: '23:59',
  vehicles: [{ vehicleId: 'NS-2', type: 'BUS', seats: 9, largeBags: 6, smallBags: 4 }],
};
const busy = [{ vehicleId: 'SC-2', startAt: '2027-04-10T11:00', endAt: '2027-04-10T14:00' }];

const menon = {
  flight: { to: 'NRT' }, hotel: { city: 'Tokyo', area: 'Ueno' },
  pickupAt: '2027-04-10T11:30', busyUntil: '2027-04-10T14:30',
  passengers: 3, largeBags: 3, smallBags: 2, carType: null,
};

describe('checkVehicle (R5, R6)', () => {
  it('large and small bags are checked separately', () => {
    expect(checkVehicle(menon, sakura.vehicles[0], busy)).toEqual([
      { rule: 'R5', field: 'largeBags', message: 'Needs 3 large-bag spaces, SC-1 has 2.' },
    ]);
  });

  it('busy car fails R6 with its busy window', () => {
    expect(checkVehicle(menon, sakura.vehicles[1], busy)).toEqual([
      { rule: 'R6', field: 'vehicleId', message: 'SC-2 is busy 10 Apr 11:00 – 14:00.' },
    ]);
  });

  it('back to back is free: pickup 14:00 after a ride ending 14:00', () => {
    expect(checkVehicle({ ...menon, pickupAt: '2027-04-10T14:00', busyUntil: '2027-04-10T17:00' },
      sakura.vehicles[1], busy)).toEqual([]);
  });

  it('seats and car type', () => {
    const out = checkVehicle({ ...menon, passengers: 7, carType: 'SUV' }, edo.vehicles[0], []);
    expect(out).toEqual([
      { rule: 'R5', field: 'passengers', message: 'Needs 7 seats, EP-1 has 4.' },
      { rule: 'R5', field: 'carType', message: 'Traveler asked for SUV, EP-1 is a SEDAN.' },
    ]);
  });
});

describe('evaluateSupplier', () => {
  it('Sakura on the Menon request: only SC-3 ok', () => {
    const r = evaluateSupplier(menon, sakura, sakura.vehicles, busy);
    expect(r).toMatchObject({ worksAtAirport: true, drivesToArea: true, openAtPickup: true });
    expect(r.vehicles.filter((x) => x.ok).map((x) => x.vehicleId)).toEqual(['SC-3']);
  });

  it('Narita Star does not drive to Ueno', () => {
    expect(evaluateSupplier(menon, narita, narita.vehicles, [])).toMatchObject({ worksAtAirport: true, drivesToArea: false });
  });
});

describe('summarize', () => {
  const all = [sakura, narita, edo];

  it('Menon: 2 suppliers, no reason', () => {
    expect(summarize(menon, all, busy)).toEqual({ supplierCount: 2, reason: null });
  });

  it('7 passengers: reason names the R5 stage', () => {
    expect(summarize({ ...menon, passengers: 7 }, all, busy)).toEqual({
      supplierCount: 0,
      reason: '2 suppliers drive NRT → Tokyo / Ueno and are open at 11:30, but none has a car with 7 seats, 3 large and 2 small bags (R5).',
    });
  });

  it('every fitting car busy: reason names R6', () => {
    const allBusy = [...busy, { vehicleId: 'SC-3', startAt: '2027-04-10T10:00', endAt: '2027-04-10T12:00' },
      { vehicleId: 'EP-1', startAt: '2027-04-10T10:00', endAt: '2027-04-10T12:00' },
      { vehicleId: 'EP-2', startAt: '2027-04-10T10:00', endAt: '2027-04-10T12:00' }];
    expect(summarize(menon, all, allBusy).reason).toBe(
      '2 suppliers have a car that fits, but every such car is busy between 10 Apr 11:30 and 14:30 (R6).');
  });

  it('no supplier at the airport / area / hours', () => {
    expect(summarize({ ...menon, flight: { to: 'KIX' } }, all, []).reason).toBe('No supplier works at KIX (R4).');
    expect(summarize({ ...menon, hotel: { city: 'Tokyo', area: 'Shibuya' } }, all, []).reason).toBe(
      '3 suppliers work at NRT, but none drives to Tokyo / Shibuya (R4).');
    expect(summarize({ ...menon, pickupAt: '2027-04-10T23:30', busyUntil: '2027-04-11T02:30' }, [sakura, edo], []).reason)
      .toBe('2 suppliers drive NRT → Tokyo / Ueno, but none is open at 23:30 (R4).');
  });

  it('car type in the R5 sentence', () => {
    expect(summarize({ ...menon, carType: 'BUS' }, all, busy).reason).toBe(
      '2 suppliers drive NRT → Tokyo / Ueno and are open at 11:30, but none has a BUS with 3 seats, 3 large and 2 small bags (R5).');
  });
});
