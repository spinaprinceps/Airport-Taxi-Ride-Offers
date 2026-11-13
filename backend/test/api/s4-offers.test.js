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
const offer = (companyId, requestId, body) =>
  request(app).post(`/api/suppliers/${companyId}/requests/${requestId}/offers`).send(body);

let menon;
beforeAll(async () => {
  await resetDatabase();
  menon = await postRequest();
});
afterAll(() => pool.end());

describe('POST /api/suppliers/:companyId/requests/:requestId/offers', () => {
  it('Sakura assigns SC-3 at 12500 -> 201 OFFERED', async () => {
    const res = await offer('TX-JP-01', menon, { vehicleId: 'SC-3', priceInr: 12500 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      offerId: expect.any(Number), requestId: menon, companyId: 'TX-JP-01',
      vehicleId: 'SC-3', priceInr: 12500, status: 'OFFERED',
    });
  });

  it('Sakura assigns SC-2 -> 422 R6 with the busy window', async () => {
    const res = await offer('TX-JP-01', menon, { vehicleId: 'SC-2', priceInr: 12500 });
    expect(res.status).toBe(422);
    expect(res.body.violations).toEqual([
      { rule: 'R6', field: 'vehicleId', message: 'SC-2 is busy 10 Apr 11:00 – 14:00.' },
    ]);
  });

  it('Sakura assigns SC-1 at 17000 -> 422 with R3 and R5 together', async () => {
    const res = await offer('TX-JP-01', menon, { vehicleId: 'SC-1', priceInr: 17000 });
    expect(res.status).toBe(422);
    expect(res.body.violations.map((x) => x.rule)).toEqual(['R3', 'R5']);
    expect(res.body.violations[0].message).toBe('Price ₹17,000 is above the maximum ₹16,800 (range ₹10,200 – ₹16,800).');
    expect(res.body.violations[1].message).toBe('Needs 3 large-bag spaces, SC-1 has 2.');
  });

  it('price ends 10200 and 16800 accepted on fresh requests; 10199 refused R3', async () => {
    expect((await offer('TX-JP-01', await postRequest(), { vehicleId: 'SC-3', priceInr: 10200 })).status).toBe(201);
    expect((await offer('TX-JP-01', await postRequest(), { vehicleId: 'SC-3', priceInr: 16800 })).status).toBe(201);
    const res = await offer('TX-JP-01', await postRequest(), { vehicleId: 'SC-3', priceInr: 10199 });
    expect(res.status).toBe(422);
    expect(res.body.violations.map((x) => x.rule)).toEqual(['R3']);
  });

  it('Sakura assigns EP-2 (Edo\'s car) -> 403 R7', async () => {
    const res = await offer('TX-JP-01', menon, { vehicleId: 'EP-2', priceInr: 12500 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body.violations).toEqual([
      { rule: 'R7', field: 'vehicleId', message: 'EP-2 belongs to Edo Premium Cars, not Sakura Cabs.' },
    ]);
  });

  it('Narita Star Taxi assigns NS-2 on the Menon request -> 422 R4', async () => {
    const res = await offer('TX-JP-02', menon, { vehicleId: 'NS-2', priceInr: 12500 });
    expect(res.status).toBe(422);
    expect(res.body.violations.map((x) => x.rule)).toEqual(['R4']);
    expect(res.body.violations[0].message).toBe('Narita Star Taxi does not drive to Tokyo / Ueno.');
  });

  it('Sakura assigns SC-3 twice on the same request -> second call 409', async () => {
    const id = await postRequest();
    expect((await offer('TX-JP-01', id, { vehicleId: 'SC-3', priceInr: 12500 })).status).toBe(201);
    const res = await offer('TX-JP-01', id, { vehicleId: 'SC-3', priceInr: 12000 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
    expect(res.body.message).toBe(`SC-3 is already offered on ${id}.`);
  });

  it('Edo assigns EP-1 and EP-2 on the Menon request -> two offers (G1)', async () => {
    const a = await offer('TX-JP-03', menon, { vehicleId: 'EP-1', priceInr: 11500 });
    const b = await offer('TX-JP-03', menon, { vehicleId: 'EP-2', priceInr: 11800 });
    expect([a.status, b.status]).toEqual([201, 201]);
    const dash = await request(app).get(`/api/suppliers/TX-JP-03/requests/${menon}`);
    expect(dash.body.myOffers.map((o) => o.vehicleId)).toEqual(['EP-1', 'EP-2']);
  });

  it('carType SUV: Edo assigns EP-1 (SEDAN) -> 422 R5 (G2)', async () => {
    const suv = await postRequest({ carType: 'SUV' });
    const res = await offer('TX-JP-03', suv, { vehicleId: 'EP-1', priceInr: 12000 });
    expect(res.status).toBe(422);
    expect(res.body.violations).toEqual([
      { rule: 'R5', field: 'carType', message: 'Traveler asked for SUV, EP-1 is a SEDAN.' },
    ]);
  });

  it('request not OPEN -> 409', async () => {
    const id = await postRequest();
    await pool.query(`UPDATE ride_requests SET status = 'BOOKED' WHERE request_id = $1`, [id]);
    const res = await offer('TX-JP-01', id, { vehicleId: 'SC-3', priceInr: 12500 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`Request ${id} is not open (BOOKED).`);
  });

  it('unknown supplier, request or car -> 404; wrong shape -> 400', async () => {
    expect((await offer('TX-NOPE', menon, { vehicleId: 'SC-3', priceInr: 12500 })).status).toBe(404);
    expect((await offer('TX-JP-01', 'REQ-9999', { vehicleId: 'SC-3', priceInr: 12500 })).status).toBe(404);
    expect((await offer('TX-JP-01', menon, { vehicleId: 'XX-9', priceInr: 12500 })).status).toBe(404);
    expect((await offer('TX-JP-01', menon, { vehicleId: 'SC-3', priceInr: '12,500' })).status).toBe(400);
    expect((await offer('TX-JP-01', menon, { priceInr: 12500 })).status).toBe(400);
  });

  it('an offer does not make the car busy: SC-3 still fits Sakura\'s other open requests', async () => {
    const id = await postRequest();
    const dash = await request(app).get('/api/suppliers/TX-JP-01/requests');
    const e = dash.body.find((x) => x.request.requestId === id);
    expect(e.fittingFreeVehicles.map((x) => x.vehicleId)).toContain('SC-3');
  });
});

describe('GET /api/suppliers/:companyId/offers', () => {
  it('Edo\'s offers, newest first, with traveler and pickup', async () => {
    const res = await request(app).get('/api/suppliers/TX-JP-03/offers');
    expect(res.status).toBe(200);
    expect(res.body.slice(0, 2).map((o) => o.vehicleId)).toEqual(['EP-2', 'EP-1']);
    expect(res.body[0]).toEqual({
      offerId: expect.any(Number), requestId: menon, travelerName: 'Menon family',
      pickupAt: '2027-04-10T11:30', vehicleId: 'EP-2', priceInr: 11800, status: 'OFFERED', bookingNumber: null,
    });
  });

  it('unknown supplier -> 404', async () => {
    expect((await request(app).get('/api/suppliers/TX-NOPE/offers')).status).toBe(404);
  });
});
