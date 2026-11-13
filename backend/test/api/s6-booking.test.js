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
async function offer(companyId, requestId, vehicleId, priceInr = 12500) {
  const res = await request(app).post(`/api/suppliers/${companyId}/requests/${requestId}/offers`).send({ vehicleId, priceInr });
  expect(res.status).toBe(201);
  return res.body.offerId;
}
const book = (offerId) => request(app).post(`/api/offers/${offerId}/book`);
const offerStatus = async (id) => (await pool.query('SELECT status FROM offers WHERE offer_id = $1', [id])).rows[0].status;
const busyOf = async (vehicleId) => (await pool.query(
  `SELECT start_at, end_at, source, booking_number FROM vehicle_busy_times WHERE vehicle_id = $1 ORDER BY start_at`,
  [vehicleId])).rows;

let menon, sc3, ep2, ep1, bookingNumber;
beforeAll(async () => {
  await resetDatabase();
  menon = await postRequest();
  sc3 = await offer('TX-JP-01', menon, 'SC-3', 12500);
  ep2 = await offer('TX-JP-03', menon, 'EP-2', 11800);
  ep1 = await offer('TX-JP-03', menon, 'EP-1', 11500);
  expect((await request(app).post(`/api/offers/${ep2}/reject`)).status).toBe(200);
});
afterAll(() => pool.end());

describe('POST /api/offers/:offerId/book', () => {
  it('book SC-3 -> 201 with a 10-digit number; request BOOKED; others NOT_CHOSEN / REJECTED; one busy time', async () => {
    const res = await book(sc3);
    expect(res.status).toBe(201);
    expect(res.body.bookingNumber).toMatch(/^[1-9][0-9]{9}$/);
    bookingNumber = res.body.bookingNumber;

    expect((await request(app).get(`/api/requests/${menon}`)).body).toMatchObject({
      request: { status: 'BOOKED' }, bookingNumber,
    });
    expect(await offerStatus(sc3)).toBe('BOOKED');
    expect(await offerStatus(ep1)).toBe('NOT_CHOSEN');
    expect(await offerStatus(ep2)).toBe('REJECTED');
    expect(await busyOf('SC-3')).toEqual([
      { start_at: '2027-04-10T11:30', end_at: '2027-04-10T14:30', source: 'BOOKING', booking_number: bookingNumber },
    ]);
  });

  it('booking the same offer again -> 200 with the same number, still one booking', async () => {
    const res = await book(sc3);
    expect(res.status).toBe(200);
    expect(res.body.bookingNumber).toBe(bookingNumber);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM bookings WHERE request_id = $1', [menon]);
    expect(rows[0].n).toBe(1);
  });

  it('rejected or not-chosen offers -> 409', async () => {
    const a = await book(ep2);
    expect(a.status).toBe(409);
    expect(a.body.message).toBe(`Offer ${ep2} was rejected.`);
    const b = await book(ep1);
    expect(b.status).toBe(409);
    expect(b.body.message).toBe(`Offer ${ep1} was not chosen.`);
  });

  it('a second request with SC-3 at 13:00 -> 409 R6 busy 11:30 – 14:30; offer stays OFFERED', async () => {
    const second = await postRequest({ travelerName: 'Second family', pickupAt: '2027-04-10T13:00' });
    // The offer is made before the Menon booking would block it on the dashboard, so insert it directly.
    const { rows } = await pool.query(
      `INSERT INTO offers (request_id, company_id, vehicle_id, price_inr) VALUES ($1, 'TX-JP-01', 'SC-3', 12500)
       RETURNING offer_id`, [second]);
    const res = await book(rows[0].offer_id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
    expect(res.body.violations).toEqual([
      { rule: 'R6', field: 'vehicleId', message: 'SC-3 is busy 10 Apr 11:30 – 14:30.' },
    ]);
    expect(await offerStatus(rows[0].offer_id)).toBe('OFFERED');
    expect((await busyOf('SC-3')).filter((b) => b.source === 'BOOKING')).toHaveLength(1);
  });

  it('back to back: a request at 14:30 on SC-3 books fine after the Menon booking', async () => {
    const third = await postRequest({ travelerName: 'Third family', pickupAt: '2027-04-10T14:30' });
    const res = await book(await offer('TX-JP-01', third, 'SC-3'));
    expect(res.status).toBe(201);
  });

  it('two Book calls for two requests on the same car at the same time -> exactly one 201 and one 409', async () => {
    const a = await postRequest({ travelerName: 'Race A', pickupAt: '2027-04-12T10:00' });
    const b = await postRequest({ travelerName: 'Race B', pickupAt: '2027-04-12T11:00' });
    const oa = await offer('TX-JP-01', a, 'SC-2');
    const ob = await offer('TX-JP-01', b, 'SC-2');
    const results = await Promise.all([book(oa), book(ob)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409).body.violations[0].rule).toBe('R6');
    expect((await busyOf('SC-2')).filter((x) => x.source === 'BOOKING')).toHaveLength(1);
  });

  it('a double click on one offer creates one booking', async () => {
    const id = await postRequest({ travelerName: 'Double click', pickupAt: '2027-04-13T10:00' });
    const o = await offer('TX-JP-03', id, 'EP-2', 12000);
    const results = await Promise.all([book(o), book(o)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(results[0].body.bookingNumber).toBe(results[1].body.bookingNumber);
  });

  it('after the Menon booking, Sakura\'s dashboard no longer lists SC-3 for an overlapping request', async () => {
    const overlapping = await postRequest({ travelerName: 'Overlap', pickupAt: '2027-04-10T12:00' });
    const dash = (await request(app).get('/api/suppliers/TX-JP-01/requests')).body;
    const e = dash.find((x) => x.request.requestId === overlapping);
    expect(e?.fittingFreeVehicles.map((v) => v.vehicleId) ?? []).not.toContain('SC-3');
    expect(dash.find((x) => x.request.requestId === menon)).toBeUndefined(); // BOOKED is off the dashboard
  });

  it('Sakura\'s "My offers" shows BOOKED with the number; Edo\'s shows NOT_CHOSEN and REJECTED', async () => {
    const sakura = (await request(app).get('/api/suppliers/TX-JP-01/offers')).body;
    expect(sakura.find((o) => o.offerId === sc3)).toMatchObject({ status: 'BOOKED', bookingNumber });
    const edo = (await request(app).get('/api/suppliers/TX-JP-03/offers')).body;
    expect(edo.find((o) => o.offerId === ep1).status).toBe('NOT_CHOSEN');
    expect(edo.find((o) => o.offerId === ep2).status).toBe('REJECTED');
  });

  it('unknown offer -> 404', async () => {
    expect((await book(999999)).status).toBe(404);
  });
});
