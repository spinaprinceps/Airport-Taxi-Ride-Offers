import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { resetDatabase, count, pool } from '../helpers/db.js';

const app = createApp();
beforeAll(resetDatabase);
afterAll(() => pool.end());

const MENON = {
  travelerName: 'Menon family', flightId: 'FL-401', hotelId: 'HTL-TYO-004',
  adults: 2, childAges: [6], largeBags: 3, smallBags: 2,
  pickupAt: '2027-04-10T11:30', carType: null, priceInr: 12000,
};
const post = (patch = {}, key = randomUUID()) =>
  request(app).post('/api/requests').set('Idempotency-Key', key).send({ ...MENON, ...patch });

describe('POST /api/requests', () => {
  it('Menon -> 201 with the full request object and 2 suppliers', async () => {
    const res = await post();
    expect(res.status).toBe(201);
    expect(res.body.request).toMatchObject({
      status: 'OPEN',
      travelerName: 'Menon family',
      flight: { flightId: 'FL-401', flightNumber: 'AV 520', airline: 'AirVeda', to: 'NRT', arrivalLocal: '2027-04-10T10:30' },
      hotel: { hotelId: 'HTL-TYO-004', name: 'Ueno Garden Inn', city: 'Tokyo', area: 'Ueno' },
      adults: 2, childAges: [6], passengers: 3, largeBags: 3, smallBags: 2,
      pickupAt: '2027-04-10T11:30', busyUntil: '2027-04-10T14:30',
      carType: null, priceInr: 12000, priceMinInr: 10200, priceMaxInr: 16800, driveMinutes: 90,
    });
    expect(res.body.request.requestId).toMatch(/^REQ-\d{4,}$/);
    expect(Number(res.body.request.requestId.slice(4))).toBeGreaterThanOrEqual(1001);
    expect(res.body.serveability).toEqual({ supplierCount: 2, reason: null });
  });

  it('R3: both range ends accepted, one rupee outside refused with the range', async () => {
    expect((await post({ priceInr: 10200 })).status).toBe(201);
    expect((await post({ priceInr: 16800 })).status).toBe(201);
    for (const priceInr of [10199, 16801]) {
      const res = await post({ priceInr });
      expect(res.status).toBe(422);
      expect(res.body.violations).toHaveLength(1);
      expect(res.body.violations[0]).toMatchObject({ rule: 'R3', field: 'priceInr' });
      expect(res.body.violations[0].message).toContain('range ₹10,200 – ₹16,800');
    }
  });

  it('R2: 11:29 refused; null pickup stored as landing + 60', async () => {
    const bad = await post({ pickupAt: '2027-04-10T11:29' });
    expect(bad.status).toBe(422);
    expect(bad.body.violations[0].rule).toBe('R2');
    expect(bad.body.violations[0].message).toContain('earliest pickup is 10 Apr 11:30');

    const ok = await post({ pickupAt: null });
    expect(ok.status).toBe(201);
    expect(ok.body.request.pickupAt).toBe('2027-04-10T11:30');
  });

  it('a date-time with Z or an offset -> 400', async () => {
    expect((await post({ pickupAt: '2027-04-10T11:30Z' })).status).toBe(400);
    expect((await post({ pickupAt: '2027-04-10T11:30+09:00' })).status).toBe(400);
  });

  it('adults 0, childAges [18], largeBags -1 -> 422 with three R1 violations', async () => {
    const res = await post({ adults: 0, childAges: [18], largeBags: -1 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RULE_VIOLATION');
    expect(res.body.violations.map((x) => x.rule)).toEqual(['R1', 'R1', 'R1']);
  });

  it('wrong shapes -> 400', async () => {
    expect((await post({ adults: 2.5 })).status).toBe(400);
    expect((await post({ priceInr: '12,000' })).status).toBe(400);
    expect((await post({ carType: 'LIMO' })).status).toBe(400);
    const res = await post({ travelerName: undefined });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('unknown flight -> 422 R1; Osaka hotel on NRT -> 422 R1', async () => {
    const a = await post({ flightId: 'FL-999' });
    expect(a.status).toBe(422);
    expect(a.body.violations[0]).toMatchObject({ rule: 'R1', field: 'flightId' });
    const b = await post({ hotelId: 'HTL-OSA-001' });
    expect(b.status).toBe(422);
    expect(b.body.violations[0].message).toBe('NRT does not serve Osaka. It serves: Tokyo.');
  });

  it('same Idempotency-Key twice -> one row, second call 200 with the same request', async () => {
    const key = randomUUID();
    const before = await count('ride_requests');
    const first = await post({}, key);
    const second = await post({}, key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.request.requestId).toBe(first.body.request.requestId);
    expect(await count('ride_requests')).toBe(before + 1);
  });

  it('7 adults -> 201, 0 suppliers, reason names R5', async () => {
    const res = await post({ adults: 7, childAges: [] });
    expect(res.status).toBe(201);
    expect(res.body.serveability).toEqual({
      supplierCount: 0,
      reason: '2 suppliers drive NRT → Tokyo / Ueno and are open at 11:30, but none has a car with 7 seats, 3 large and 2 small bags (R5).',
    });
  });

  it('FL-405 (lands 21:30, pickup 22:30) -> 1 supplier: Sakura open until 23:00, Edo closes 22:00', async () => {
    const res = await post({ flightId: 'FL-405', pickupAt: null });
    expect(res.status).toBe(201);
    expect(res.body.request.pickupAt).toBe('2027-04-10T22:30');
    expect(res.body.request.busyUntil).toBe('2027-04-11T01:30');
    expect(res.body.serveability.supplierCount).toBe(1);
  });
});

describe('GET /api/requests', () => {
  it('lists requests newest first with serveability, offerCount and bookingNumber', async () => {
    const res = await request(app).get('/api/requests');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(3);
    expect(res.body[0]).toHaveProperty('request');
    expect(res.body[0]).toHaveProperty('serveability');
    expect(res.body[0]).toMatchObject({ offerCount: 0, bookingNumber: null });
    const ids = res.body.map((x) => x.request.requestId);
    expect(ids.indexOf('REQ-0001')).toBeGreaterThan(0); // seeds come after app requests
  });

  it('filters by traveler name (case-insensitive, part of the name)', async () => {
    const res = await request(app).get('/api/requests?traveler=kavya');
    expect(res.body.map((x) => x.request.requestId)).toEqual(['REQ-0001']);
  });

  it('GET /api/requests/:id returns one; unknown -> 404', async () => {
    const one = await request(app).get('/api/requests/REQ-0001');
    expect(one.status).toBe(200);
    expect(one.body.request).toMatchObject({ requestId: 'REQ-0001', travelerName: 'Kavya Rao', pickupAt: '2027-04-08T09:45' });
    expect((await request(app).get('/api/requests/REQ-9999')).status).toBe(404);
  });
});
