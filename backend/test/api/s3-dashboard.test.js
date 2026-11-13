import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { resetDatabase, pool } from '../helpers/db.js';

const app = createApp();

const MENON = {
  travelerName: 'Menon family', flightId: 'FL-401', hotelId: 'HTL-TYO-004',
  adults: 2, childAges: [6], largeBags: 3, smallBags: 2,
  pickupAt: '2027-04-10T11:30', carType: null, priceInr: 12000,
};
async function postRequest(patch = {}) {
  const res = await request(app).post('/api/requests').set('Idempotency-Key', randomUUID()).send({ ...MENON, ...patch });
  expect(res.status).toBe(201);
  return res.body.request.requestId;
}
const dashboard = (companyId) => request(app).get(`/api/suppliers/${companyId}/requests`);
const detail = (companyId, requestId) => request(app).get(`/api/suppliers/${companyId}/requests/${requestId}`);
const entry = (list, requestId) => list.find((x) => x.request.requestId === requestId);

let menon, bus, at14;
beforeAll(async () => {
  await resetDatabase();
  menon = await postRequest();
  bus = await postRequest({ carType: 'BUS' });
  at14 = await postRequest({ pickupAt: '2027-04-10T14:00' });
});
afterAll(() => pool.end());

describe('GET /api/suppliers/:companyId/requests', () => {
  it('Sakura sees the Menon request with only SC-3 fitting and free', async () => {
    const res = await dashboard('TX-JP-01');
    expect(res.status).toBe(200);
    const e = entry(res.body, menon);
    expect(e.request).toMatchObject({ requestId: menon, travelerName: 'Menon family', passengers: 3, busyUntil: '2027-04-10T14:30' });
    expect(e.fittingFreeVehicles).toEqual([
      { vehicleId: 'SC-3', type: 'SUV', seats: 6, largeBags: 4, smallBags: 3 },
    ]);
    expect(e.myOffers).toEqual([]);
  });

  it('Edo Premium Cars sees it with EP-1 and EP-2', async () => {
    const e = entry((await dashboard('TX-JP-03')).body, menon);
    expect(e.fittingFreeVehicles.map((v) => v.vehicleId)).toEqual(['EP-1', 'EP-2']);
  });

  it('Narita Star Taxi (no Ueno) and Haneda Family Rides (HND only) do not see it', async () => {
    expect(entry((await dashboard('TX-JP-02')).body, menon)).toBeUndefined();
    expect(entry((await dashboard('TX-JP-04')).body, menon)).toBeUndefined();
  });

  it('carType BUS: neither Sakura nor Edo sees it (no bus)', async () => {
    expect(entry((await dashboard('TX-JP-01')).body, bus)).toBeUndefined();
    expect(entry((await dashboard('TX-JP-03')).body, bus)).toBeUndefined();
  });

  it('pickup 14:00: SC-2 is free again (RIDE-0001 ends 14:00)', async () => {
    const e = entry((await dashboard('TX-JP-01')).body, at14);
    expect(e.fittingFreeVehicles.map((v) => v.vehicleId)).toEqual(['SC-2', 'SC-3']);
  });

  it('seed REQ-0001 (HND -> Shibuya, 8 Apr 09:45) is on Sakura\'s dashboard from the start', async () => {
    const e = entry((await dashboard('TX-JP-01')).body, 'REQ-0001');
    expect(e).toBeDefined();
    expect(e.request.pickupAt).toBe('2027-04-08T09:45');
  });

  it('lists only OPEN requests, sorted by pickup time', async () => {
    const list = (await dashboard('TX-JP-01')).body;
    expect(list.every((x) => x.request.status === 'OPEN')).toBe(true);
    const pickups = list.map((x) => x.request.pickupAt);
    expect(pickups).toEqual([...pickups].sort());
  });

  it('unknown supplier -> 404', async () => {
    const res = await dashboard('TX-NOPE');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/suppliers/:companyId/requests/:requestId', () => {
  it('Sakura: one verdict per car', async () => {
    const res = await detail('TX-JP-01', menon);
    expect(res.status).toBe(200);
    expect(res.body.request.requestId).toBe(menon);
    const byId = Object.fromEntries(res.body.vehicles.map((v) => [v.vehicleId, v]));
    expect(Object.keys(byId)).toEqual(['SC-1', 'SC-2', 'SC-3', 'SC-4']);
    expect(byId['SC-1']).toEqual({
      vehicleId: 'SC-1', type: 'SEDAN', seats: 4, largeBags: 2, smallBags: 2, ok: false,
      violations: [{ rule: 'R5', field: 'largeBags', message: 'Needs 3 large-bag spaces, SC-1 has 2.' }],
    });
    expect(byId['SC-4'].violations).toEqual([
      { rule: 'R5', field: 'largeBags', message: 'Needs 3 large-bag spaces, SC-4 has 1.' },
    ]);
    expect(byId['SC-2'].violations).toEqual([
      { rule: 'R6', field: 'vehicleId', message: 'SC-2 is busy 10 Apr 11:00 – 14:00.' },
    ]);
    expect(byId['SC-3']).toMatchObject({ ok: true, violations: [] });
    expect(res.body.myOffers).toEqual([]);
  });

  it('Narita Star Taxi -> 403 with an R4 violation and no request details', async () => {
    const res = await detail('TX-JP-02', menon);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body.violations).toHaveLength(1);
    expect(res.body.violations[0].rule).toBe('R4');
    expect(res.body.violations[0].message).toContain('does not drive to Tokyo / Ueno');
    expect(res.body.request).toBeUndefined();
  });

  it('Haneda Family Rides -> 403 R4 (does not work at NRT)', async () => {
    const res = await detail('TX-JP-04', menon);
    expect(res.status).toBe(403);
    expect(res.body.violations[0].message).toContain('does not work at NRT');
  });

  it('R4 hours: Edo is closed at 22:30', async () => {
    const late = await postRequest({ flightId: 'FL-405', pickupAt: null });
    const res = await detail('TX-JP-03', late);
    expect(res.status).toBe(403);
    expect(res.body.violations[0].message).toBe('Edo Premium Cars is closed at 22:30 (open 07:00–22:00).');
  });

  it('a supplier that passes R4 sees the detail even when no car fits (BUS request)', async () => {
    const res = await detail('TX-JP-01', bus);
    expect(res.status).toBe(200);
    expect(res.body.vehicles.every((v) => !v.ok)).toBe(true);
  });

  it('unknown supplier or request -> 404', async () => {
    expect((await detail('TX-NOPE', menon)).status).toBe(404);
    expect((await detail('TX-JP-01', 'REQ-9999')).status).toBe(404);
  });
});
