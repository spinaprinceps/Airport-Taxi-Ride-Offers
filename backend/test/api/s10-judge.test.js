// Judge-style tests: other airports, seed data, midnight, restart. Expected suppliers are worked out by hand
// from data/problem-2/taxi_companies.json (airports, areas, hours, cars) and booked_rides.json.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { applySchema } from '../../src/db.js';
import { loadData } from '../../src/loader.js';
import { resetDatabase, count, pool } from '../helpers/db.js';
import { postRequest, makeOffer } from '../helpers/flow.js';

const app = createApp();
beforeAll(resetDatabase);
afterAll(() => pool.end());

const SUPPLIERS = ['TX-JP-01', 'TX-JP-02', 'TX-JP-03', 'TX-JP-04', 'TX-JP-05', 'TX-JP-06',
  'TX-AE-01', 'TX-AE-02', 'TX-AE-03', 'TX-AE-04', 'TX-AE-05'];
const SMALL_PARTY = { adults: 1, childAges: [], largeBags: 1, smallBags: 1, carType: null };

// Which suppliers have this request on their dashboard?
async function seenBy(requestId) {
  const out = [];
  for (const id of SUPPLIERS) {
    const list = (await request(app).get(`/api/suppliers/${id}/requests`)).body;
    if (list.some((x) => x.request.requestId === requestId)) out.push(id);
  }
  return out;
}
const detail = (companyId, requestId) => request(app).get(`/api/suppliers/${companyId}/requests/${requestId}`);
const carVerdict = async (companyId, requestId, vehicleId) =>
  (await detail(companyId, requestId)).body.vehicles.find((v) => v.vehicleId === vehicleId);

describe('a request at each other airport reaches exactly the right dashboards', () => {
  const cases = [
    ['HND -> Tokyo / Shibuya', 'FL-1190', 'HTL-TYO-008', 3100, '2027-04-11T10:00', ['TX-JP-01', 'TX-JP-03', 'TX-JP-04']],
    ['KIX -> Osaka / Umeda', 'FL-1187', 'HTL-OSA-003', 7200, '2027-04-11T10:00', ['TX-JP-05']],
    ['KIX -> Kyoto / Gion', 'FL-1187', 'HTL-KYO-001', 14400, '2027-04-11T10:00', ['TX-JP-05', 'TX-JP-06']],
    ['DXB -> Dubai / Downtown', 'FL-1195', 'HTL-DXB-003', 1100, '2027-04-11T10:00', ['TX-AE-01', 'TX-AE-02', 'TX-AE-03']],
    ['DXB -> Abu Dhabi / Corniche', 'FL-1195', 'HTL-AUH-001', 10800, '2027-04-11T10:00', ['TX-AE-02', 'TX-AE-03']],
    ['AUH -> Abu Dhabi / Saadiyat', 'FL-1193', 'HTL-AUH-004', 2200, '2027-04-11T10:00', ['TX-AE-02', 'TX-AE-04']],
  ];
  for (const [name, flightId, hotelId, priceInr, pickupAt, expected] of cases) {
    it(name, async () => {
      const id = await postRequest(app, { ...SMALL_PARTY, travelerName: name, flightId, hotelId, priceInr, pickupAt });
      const got = (await request(app).get(`/api/requests/${id}`)).body.serveability;
      expect(got).toEqual({ supplierCount: expected.length, reason: null });
      expect(await seenBy(id)).toEqual(expected);
    });
  }
});

describe('R1 across airports', () => {
  it('AUH with a Dubai hotel is refused (AUH serves only Abu Dhabi)', async () => {
    const res = await request(app).post('/api/requests').set('Idempotency-Key', 'r1-auh-dubai')
      .send({ ...SMALL_PARTY, travelerName: 'R1', flightId: 'FL-1193', hotelId: 'HTL-DXB-003', priceInr: 1500, pickupAt: null });
    expect(res.status).toBe(422);
    expect(res.body.violations).toEqual([
      { rule: 'R1', field: 'hotelId', message: 'AUH does not serve Dubai. It serves: Abu Dhabi.' },
    ]);
  });
  // DXB + an Abu Dhabi hotel is accepted: see "DXB -> Abu Dhabi / Corniche" above.
});

describe('seed busy times block cars (booked_rides.json)', () => {
  it('FT-1 busy 10 Apr 05:00 – 07:00 (Falcon, DXB -> Deira at 05:50)', async () => {
    const id = await postRequest(app, { ...SMALL_PARTY, travelerName: 'FT-1', flightId: 'FL-1179', hotelId: 'HTL-DXB-001', priceInr: 700, pickupAt: null });
    expect((await carVerdict('TX-AE-01', id, 'FT-1')).violations).toEqual([
      { rule: 'R6', field: 'vehicleId', message: 'FT-1 is busy 10 Apr 05:00 – 07:00.' }]);
    expect((await carVerdict('TX-AE-01', id, 'FT-2')).ok).toBe(true);
  });

  it('GF-1 busy 9 Apr 14:00 – 16:00 (Gulf Family Vans, DXB -> Downtown at 14:30)', async () => {
    const id = await postRequest(app, { ...SMALL_PARTY, travelerName: 'GF-1', flightId: 'FL-1154', hotelId: 'HTL-DXB-003', priceInr: 1100, pickupAt: '2027-04-09T14:30' });
    expect((await carVerdict('TX-AE-03', id, 'GF-1')).violations[0].message).toBe('GF-1 is busy 9 Apr 14:00 – 16:00.');
    expect((await carVerdict('TX-AE-03', id, 'GF-2')).ok).toBe(true);
  });

  it('KA-4 busy 11 Apr 13:00 – 15:00 (Kansai, KIX -> Namba at 12:00)', async () => {
    const id = await postRequest(app, { ...SMALL_PARTY, travelerName: 'KA-4', flightId: 'FL-1187', hotelId: 'HTL-OSA-001', priceInr: 6800, pickupAt: '2027-04-11T12:00' });
    expect((await carVerdict('TX-JP-05', id, 'KA-4')).violations[0].message).toBe('KA-4 is busy 11 Apr 13:00 – 15:00.');
  });

  it('EP-1 busy 11 Apr 15:00 – 17:00 and 12 Apr 09:00 – 11:00 (Edo, HND -> Shibuya)', async () => {
    const a = await postRequest(app, { ...SMALL_PARTY, travelerName: 'EP-1 a', flightId: 'FL-1190', hotelId: 'HTL-TYO-008', priceInr: 3100, pickupAt: '2027-04-11T14:30' });
    expect((await carVerdict('TX-JP-03', a, 'EP-1')).violations[0].message).toBe('EP-1 is busy 11 Apr 15:00 – 17:00.');
    const b = await postRequest(app, { ...SMALL_PARTY, travelerName: 'EP-1 b', flightId: 'FL-1204', hotelId: 'HTL-TYO-008', priceInr: 3100, pickupAt: null });
    expect((await carVerdict('TX-JP-03', b, 'EP-1')).violations[0].message).toBe('EP-1 is busy 12 Apr 09:00 – 11:00.');
    // Back to back: pickup 14:00 + 2 x 30 min ends exactly at 15:00
    const c = await postRequest(app, { ...SMALL_PARTY, travelerName: 'EP-1 c', flightId: 'FL-1190', hotelId: 'HTL-TYO-008', priceInr: 3100, pickupAt: '2027-04-11T14:00' });
    expect((await carVerdict('TX-JP-03', c, 'EP-1')).ok).toBe(true);
  });
});

describe('Marina Rides (05:00 – 01:00, crosses midnight)', () => {
  it('a pickup at 00:30 is served; a pickup at 02:00 is not', async () => {
    const base = { ...SMALL_PARTY, flightId: 'FL-1175', hotelId: 'HTL-DXB-005', priceInr: 2600 };
    const at0030 = await postRequest(app, { ...base, travelerName: 'Marina 00:30', pickupAt: '2027-04-11T00:30' });
    const at0200 = await postRequest(app, { ...base, travelerName: 'Marina 02:00', pickupAt: '2027-04-11T02:00' });
    expect(await seenBy(at0030)).toContain('TX-AE-05');
    expect(await seenBy(at0200)).not.toContain('TX-AE-05');
    const res = await detail('TX-AE-05', at0200);
    expect(res.status).toBe(403);
    expect(res.body.violations[0].message).toBe('Marina Rides is closed at 02:00 (open 05:00–01:00).');
  });
});

describe('late landing: busy time crosses midnight', () => {
  it('FL-301 lands KIX 16 Apr 22:50 -> pickup 23:50; Kyoto Station booking busy until 17 Apr 03:52', async () => {
    const id = await postRequest(app, { ...SMALL_PARTY, travelerName: 'Late', flightId: 'FL-301', hotelId: 'HTL-KYO-003', priceInr: 13900, pickupAt: null });
    const r = (await request(app).get(`/api/requests/${id}`)).body.request;
    expect(r).toMatchObject({ pickupAt: '2027-04-16T23:50', busyUntil: '2027-04-17T03:52' });
    expect(await seenBy(id)).toEqual(['TX-JP-06']); // Kansai closes 23:30; Kyoto Night is 24h
    const offerId = await makeOffer(app, 'TX-JP-06', id, 'KN-1', 13900);
    const bn = (await request(app).post(`/api/offers/${offerId}/book`)).body.bookingNumber;
    const { rows } = await pool.query(`SELECT start_at, end_at FROM vehicle_busy_times WHERE booking_number = $1`, [bn]);
    expect(rows[0]).toEqual({ start_at: '2027-04-16T23:50', end_at: '2027-04-17T03:52' });
    // A request the next morning at 03:00 now finds KN-1 busy across midnight
    const next = await postRequest(app, { ...SMALL_PARTY, travelerName: 'Next', flightId: 'FL-301', hotelId: 'HTL-KYO-003', priceInr: 13900, pickupAt: '2027-04-17T03:00' });
    expect((await carVerdict('TX-JP-06', next, 'KN-1')).violations[0].message).toBe('KN-1 is busy 16 Apr 23:50 – 17 Apr 03:52.');
  });
});

describe('the three seed requests', () => {
  it('REQ-0001 (Kavya Rao, HND -> Shibuya) can be offered on and booked', async () => {
    const offerId = await makeOffer(app, 'TX-JP-01', 'REQ-0001', 'SC-1', 4500);
    const res = await request(app).post(`/api/offers/${offerId}/book`);
    expect(res.status).toBe(201);
    expect((await request(app).get(`/api/bookings/${res.body.bookingNumber}`)).body.travelerName).toBe('Kavya Rao');
  });

  it('REQ-0002 (KIX -> Namba, SEDAN) has no supplier: Kansai has no SEDAN', async () => {
    const s = (await request(app).get('/api/requests/REQ-0002')).body.serveability;
    expect(s.supplierCount).toBe(0);
    expect(s.reason).toContain('none has a SEDAN');
    expect(await seenBy('REQ-0002')).toEqual([]);
  });

  it('REQ-0003 (Iyer family, AUH -> Yas Island) is seen by Desert Rose and Capital Cabs and can be booked', async () => {
    expect(await seenBy('REQ-0003')).toEqual(['TX-AE-02', 'TX-AE-04']);
    const offerId = await makeOffer(app, 'TX-AE-02', 'REQ-0003', 'DR-2', 1300);
    expect((await request(app).post(`/api/offers/${offerId}/book`)).status).toBe(201);
  });
});

describe('restart', () => {
  it('schema + loader again keeps requests, offers, bookings and changes; no seed row is duplicated', async () => {
    const bn = (await pool.query(`SELECT booking_number FROM bookings LIMIT 1`)).rows[0].booking_number;
    expect((await request(app).post(`/api/bookings/${bn}/change-requests`).send({ newPickupAt: '2027-04-08T10:30' })).status)
      .toBeLessThan(500);
    const tables = ['ride_requests', 'offers', 'bookings', 'change_requests', 'vehicle_busy_times', 'companies', 'flights'];
    const before = {};
    for (const t of tables) before[t] = await count(t);
    await applySchema();
    await loadData();
    for (const t of tables) expect(await count(t)).toBe(before[t]);
    expect((await request(app).get('/api/requests/REQ-0001')).body.request.status).toBe('BOOKED');
  });
});
