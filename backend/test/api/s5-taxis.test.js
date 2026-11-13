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
async function offer(companyId, requestId, vehicleId, priceInr) {
  const res = await request(app).post(`/api/suppliers/${companyId}/requests/${requestId}/offers`).send({ vehicleId, priceInr });
  expect(res.status).toBe(201);
  return res.body.offerId;
}
const taxis = (requestId, query = '') => request(app).get(`/api/requests/${requestId}/offers${query}`);
const reject = (offerId) => request(app).post(`/api/offers/${offerId}/reject`);

let menon, sc3, ep2, ep1;
beforeAll(async () => {
  await resetDatabase();
  menon = await postRequest();
  sc3 = await offer('TX-JP-01', menon, 'SC-3', 12500);
  ep2 = await offer('TX-JP-03', menon, 'EP-2', 11800);
});
afterAll(() => pool.end());

describe('GET /api/requests/:requestId/offers', () => {
  it('default order is price ascending: EP-2 then SC-3, with supplier and car details', async () => {
    const res = await taxis(menon);
    expect(res.status).toBe(200);
    expect(res.body.map((o) => o.vehicleId)).toEqual(['EP-2', 'SC-3']);
    expect(res.body[0]).toEqual({
      offerId: ep2, companyId: 'TX-JP-03', companyName: 'Edo Premium Cars', rating: 4.8, // the data file's value (the plan's example says 4.6)
      vehicleId: 'EP-2', type: 'SUV', seats: 6, largeBags: 3, smallBags: 3,
      priceInr: 11800, status: 'OFFERED', vehicleFreeNow: true, groupId: null, shared: null,
    });
  });

  it('price_desc reverses the order', async () => {
    const res = await taxis(menon, '?sort=price_desc');
    expect(res.body.map((o) => o.vehicleId)).toEqual(['SC-3', 'EP-2']);
  });

  it('type=SUV returns only the two SUVs after a SEDAN offer is added', async () => {
    ep1 = await offer('TX-JP-03', menon, 'EP-1', 12000);
    expect((await taxis(menon)).body).toHaveLength(3);
    const res = await taxis(menon, '?type=SUV');
    expect(res.body.map((o) => o.vehicleId)).toEqual(['EP-2', 'SC-3']);
  });

  it('equal prices sort by creation time', async () => {
    const id = await postRequest();
    const first = await offer('TX-JP-03', id, 'EP-2', 12000);
    const second = await offer('TX-JP-01', id, 'SC-3', 12000);
    expect((await taxis(id)).body.map((o) => o.offerId)).toEqual([first, second]);
    expect((await taxis(id, '?sort=price_desc')).body.map((o) => o.offerId)).toEqual([first, second]);
  });

  it('vehicleFreeNow is false when the car became busy at that time', async () => {
    await pool.query(
      `INSERT INTO vehicle_busy_times (vehicle_id, start_at, end_at, source)
       VALUES ('EP-2', '2027-04-10T12:00', '2027-04-10T13:00', 'BOOKING')`);
    const res = await taxis(menon);
    expect(res.body.find((o) => o.vehicleId === 'EP-2').vehicleFreeNow).toBe(false);
    expect(res.body.find((o) => o.vehicleId === 'SC-3').vehicleFreeNow).toBe(true);
    await pool.query(`DELETE FROM vehicle_busy_times WHERE vehicle_id = 'EP-2' AND source = 'BOOKING'`);
  });

  it('unknown request -> 404; bad sort or type -> 400', async () => {
    expect((await taxis('REQ-9999')).status).toBe(404);
    expect((await taxis(menon, '?sort=rating')).status).toBe(400);
    expect((await taxis(menon, '?type=LIMO')).status).toBe(400);
  });
});

describe('POST /api/offers/:offerId/reject', () => {
  it('reject EP-2 -> REJECTED; request stays OPEN; other offers stay OFFERED', async () => {
    const res = await reject(ep2);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      offerId: ep2, requestId: menon, companyId: 'TX-JP-03', vehicleId: 'EP-2', priceInr: 11800, status: 'REJECTED', groupId: null,
    });
    const req = await request(app).get(`/api/requests/${menon}`);
    expect(req.body.request.status).toBe('OPEN');
    const list = (await taxis(menon)).body;
    expect(list.find((o) => o.offerId === sc3).status).toBe('OFFERED');
    expect(list.find((o) => o.offerId === ep1).status).toBe('OFFERED');
  });

  it('rejecting again -> 200 unchanged', async () => {
    const res = await reject(ep2);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJECTED');
  });

  it('Edo\'s "My offers" shows REJECTED', async () => {
    const mine = (await request(app).get('/api/suppliers/TX-JP-03/offers')).body;
    expect(mine.find((o) => o.offerId === ep2).status).toBe('REJECTED');
  });

  it('BOOKED or NOT_CHOSEN offer -> 409', async () => {
    await pool.query(`UPDATE offers SET status = 'BOOKED' WHERE offer_id = $1`, [sc3]);
    await pool.query(`UPDATE offers SET status = 'NOT_CHOSEN' WHERE offer_id = $1`, [ep1]);
    const a = await reject(sc3);
    expect(a.status).toBe(409);
    expect(a.body.message).toBe(`Offer ${sc3} is BOOKED and cannot be rejected.`);
    expect((await reject(ep1)).status).toBe(409);
  });

  it('unknown or malformed offer id -> 404', async () => {
    expect((await reject(999999)).status).toBe(404);
    expect((await reject('abc')).status).toBe(404);
  });
});
