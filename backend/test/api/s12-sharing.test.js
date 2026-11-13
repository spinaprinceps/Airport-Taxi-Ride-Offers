import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { resetDatabase, pool } from '../helpers/db.js';
import { postRequest, makeOffer } from '../helpers/flow.js';

const app = createApp();

// Menon: 3 people, 3 large + 2 small bags. Iyer: 2 people, 1 large + 1 small. Together they fit SC-3 (SUV 6/4/3).
const SHARE = { shareOk: true };
const IYER = { travelerName: 'Iyer family', adults: 2, childAges: [], largeBags: 1, smallBags: 1, pickupAt: '2027-04-10T11:45', ...SHARE };

const pairs = (companyId) => request(app).get(`/api/suppliers/${companyId}/shareable-pairs`);
const sharedOffer = (companyId, body) => request(app).post(`/api/suppliers/${companyId}/shared-offers`).send(body);
const book = (offerId) => request(app).post(`/api/offers/${offerId}/book`);
const pairOf = (list, a, b) => list.find((p) => p.requests.map((r) => r.requestId).sort().join() === [a, b].sort().join());
const busyRows = async (vehicleId) =>
  (await pool.query(`SELECT * FROM vehicle_busy_times WHERE vehicle_id = $1 AND source = 'BOOKING'`, [vehicleId])).rows;

async function offerPair(a, b, { vehicleId = 'SC-3', pa = 9000, pb = 11000 } = {}) {
  const res = await sharedOffer('TX-JP-01', { requestIds: [a, b], vehicleId, prices: { [a]: pa < 10200 ? 10500 : pa, [b]: pb } });
  expect(res.status).toBe(201);
  return Object.fromEntries(res.body.offers.map((o) => [o.requestId, o.offerId]));
}

beforeEach(async () => { await resetDatabase(); });
afterAll(() => pool.end());

describe('POST /api/requests with shareOk', () => {
  it('stores shareOk (default false)', async () => {
    const solo = await postRequest(app);
    const shared = await postRequest(app, SHARE);
    expect((await request(app).get(`/api/requests/${solo}`)).body.request).toMatchObject({ shareOk: false, groupId: null });
    expect((await request(app).get(`/api/requests/${shared}`)).body.request).toMatchObject({ shareOk: true, groupId: null });
  });
});

describe('GET /api/suppliers/:companyId/shareable-pairs', () => {
  it('pairs two sharing requests on the same flight and area, with the combined party', async () => {
    const a = await postRequest(app, SHARE);
    const b = await postRequest(app, IYER);
    const p = pairOf((await pairs('TX-JP-01')).body, a, b);
    expect(p.combined).toMatchObject({ passengers: 5, largeBags: 4, smallBags: 3, pickupAt: '2027-04-10T11:45' });
    expect(p.fittingFreeVehicles.map((v) => v.vehicleId)).toEqual(['SC-3']);
    expect(p.groupId).toBeNull();
  });

  it('no pair when one does not share, pickups are 31 min apart, or areas differ', async () => {
    const a = await postRequest(app, SHARE);
    const notSharing = await postRequest(app, { ...IYER, shareOk: false });
    const late = await postRequest(app, { ...IYER, pickupAt: '2027-04-10T12:01' });
    const ginza = await postRequest(app, { ...IYER, hotelId: 'HTL-TYO-001' });
    const list = (await pairs('TX-JP-01')).body;
    for (const b of [notSharing, late, ginza]) expect(pairOf(list, a, b)).toBeUndefined();
  });

  it('no pair when the combined party fits no car', async () => {
    const a = await postRequest(app, SHARE);
    const b = await postRequest(app, { ...IYER, adults: 4 }); // 7 people
    expect(pairOf((await pairs('TX-JP-01')).body, a, b)).toBeUndefined();
  });
});

describe('POST /api/suppliers/:companyId/shared-offers', () => {
  it('creates one group and one offer per family', async () => {
    const a = await postRequest(app, SHARE);
    const b = await postRequest(app, IYER);
    const res = await sharedOffer('TX-JP-01', { requestIds: [a, b], vehicleId: 'SC-3', prices: { [a]: 10500, [b]: 10300 } });
    expect(res.status).toBe(201);
    expect(res.body.pickupAt).toBe('2027-04-10T11:45');
    expect(res.body.offers).toHaveLength(2);
    expect(new Set(res.body.offers.map((o) => o.groupId))).toEqual(new Set([res.body.groupId]));

    const offers = (await request(app).get(`/api/requests/${a}/offers`)).body;
    expect(offers[0].shared.otherParty).toEqual({ adults: 2, children: 0, largeBags: 1, smallBags: 1 });
    expect((await request(app).get(`/api/requests/${b}`)).body.request.groupId).toBe(res.body.groupId);
  });

  it('R3 on each price, R5 on the combined party, R10 when they cannot share', async () => {
    const a = await postRequest(app, SHARE);
    const b = await postRequest(app, IYER);
    const cheap = await sharedOffer('TX-JP-01', { requestIds: [a, b], vehicleId: 'SC-3', prices: { [a]: 500, [b]: 10300 } });
    expect(cheap.status).toBe(422);
    expect(cheap.body.violations.map((x) => x.rule)).toEqual(['R3']);

    const small = await sharedOffer('TX-JP-01', { requestIds: [a, b], vehicleId: 'SC-1', prices: { [a]: 10500, [b]: 10500 } });
    expect(small.status).toBe(422);
    expect(small.body.violations.every((x) => x.rule === 'R5')).toBe(true);

    const solo = await postRequest(app, { ...IYER, shareOk: false });
    const no = await sharedOffer('TX-JP-01', { requestIds: [a, solo], vehicleId: 'SC-3', prices: { [a]: 10500, [solo]: 10500 } });
    expect(no.status).toBe(422);
    expect(no.body.violations[0].rule).toBe('R10');
  });

  it('a request already grouped cannot pair with someone else (409)', async () => {
    const a = await postRequest(app, SHARE);
    const b = await postRequest(app, IYER);
    const c = await postRequest(app, { ...IYER, travelerName: 'Rao family' });
    await offerPair(a, b);
    const res = await sharedOffer('TX-JP-01', { requestIds: [a, c], vehicleId: 'SC-3', prices: { [a]: 10500, [c]: 10500 } });
    expect(res.status).toBe(409);
  });
});

describe('booking a shared ride', () => {
  it('first family creates the one busy row; second family joins it', async () => {
    const a = await postRequest(app, SHARE);
    const b = await postRequest(app, IYER);
    const ids = await offerPair(a, b);

    const first = await book(ids[a]);
    expect(first.status).toBe(201);
    expect(await busyRows('SC-3')).toHaveLength(1);

    const second = await book(ids[b]);
    expect(second.status).toBe(201);
    expect(second.body.bookingNumber).not.toBe(first.body.bookingNumber);
    const rows = await busyRows('SC-3');
    expect(rows).toHaveLength(1);
    expect(rows[0].start_at).toBe('2027-04-10T11:45');

    for (const n of [first.body.bookingNumber, second.body.bookingNumber]) {
      const s = (await request(app).get(`/api/bookings/${n}`)).body;
      expect(s.pickupAt).toBe('2027-04-10T11:45');
      expect(s.busyUntil).toBe('2027-04-10T14:45');
      expect(s.shared.otherPartiesBooked).toBe(1);
    }
  });

  it('both families booking at the same moment -> two bookings, exactly one busy row', async () => {
    const a = await postRequest(app, SHARE);
    const b = await postRequest(app, IYER);
    const ids = await offerPair(a, b);
    const [x, y] = await Promise.all([book(ids[a]), book(ids[b])]);
    expect([x.status, y.status]).toEqual([201, 201]);
    expect(await busyRows('SC-3')).toHaveLength(1);
  });

  it('family A books a solo taxi: its shared offer is NOT_CHOSEN; B can still take the car alone', async () => {
    const a = await postRequest(app, SHARE);
    const b = await postRequest(app, IYER);
    const ids = await offerPair(a, b);
    const solo = await makeOffer(app, 'TX-JP-03', a, 'EP-2');
    expect((await book(solo)).status).toBe(201);
    const { rows } = await pool.query('SELECT status FROM offers WHERE offer_id = $1', [ids[a]]);
    expect(rows[0].status).toBe('NOT_CHOSEN');

    const alone = await book(ids[b]);
    expect(alone.status).toBe(201);
    expect((await request(app).get(`/api/bookings/${alone.body.bookingNumber}`)).body.shared.otherPartiesBooked).toBe(0);
  });

  it('a change request on a shared booking is refused (409)', async () => {
    const a = await postRequest(app, SHARE);
    const b = await postRequest(app, IYER);
    const ids = await offerPair(a, b);
    const n = (await book(ids[a])).body.bookingNumber;
    const res = await request(app).post(`/api/bookings/${n}/change-requests`).send({ newPickupAt: '2027-04-10T12:30' });
    expect(res.status).toBe(409);
  });
});
