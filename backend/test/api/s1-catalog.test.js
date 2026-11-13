import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { resetDatabase, pool } from '../helpers/db.js';

const app = createApp();
beforeAll(resetDatabase);
afterAll(() => pool.end());

describe('GET /api/flights', () => {
  it('returns the 240 flights that land at NRT, HND, KIX, DXB or AUH, sorted by arrival', async () => {
    const res = await request(app).get('/api/flights');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(240);
    for (const f of res.body) expect(['NRT', 'HND', 'KIX', 'DXB', 'AUH']).toContain(f.to);
    const arrivals = res.body.map((f) => f.arrivalLocal);
    expect(arrivals).toEqual([...arrivals].sort());
  });

  it('uses the contract shape with local minute times', async () => {
    const res = await request(app).get('/api/flights');
    expect(res.body.find((f) => f.flightId === 'FL-401')).toEqual({
      flightId: 'FL-401',
      airline: 'AirVeda',
      flightNumber: 'AV 520',
      from: 'BLR',
      to: 'NRT',
      arrivalLocal: '2027-04-10T10:30',
    });
  });
});

describe('GET /api/hotels', () => {
  it('returns all 49 hotels', async () => {
    const res = await request(app).get('/api/hotels');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(49);
    expect(res.body.find((h) => h.hotelId === 'HTL-TYO-004')).toEqual({
      hotelId: 'HTL-TYO-004', name: 'Ueno Garden Inn', city: 'Tokyo', area: 'Ueno',
    });
  });
});

describe('GET /api/price-range', () => {
  it('FL-401 + Ueno Garden Inn -> the Menon range', async () => {
    const res = await request(app).get('/api/price-range?flightId=FL-401&hotelId=HTL-TYO-004');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      airport: 'NRT',
      city: 'Tokyo',
      area: 'Ueno',
      distanceKm: 73.3,
      driveMinutes: 90,
      priceMinInr: 10200,
      priceMaxInr: 16800,
      landingAt: '2027-04-10T10:30',
      earliestPickupAt: '2027-04-10T11:30',
    });
  });

  it('FL-401 + Namba Sunrise Hotel (Osaka) -> 422 with one R1 violation', async () => {
    const res = await request(app).get('/api/price-range?flightId=FL-401&hotelId=HTL-OSA-001');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RULE_VIOLATION');
    expect(res.body.violations).toEqual([
      { rule: 'R1', field: 'hotelId', message: 'NRT does not serve Osaka. It serves: Tokyo.' },
    ]);
  });

  it('DXB flight with an Abu Dhabi hotel is fine (DXB serves Abu Dhabi)', async () => {
    const flights = (await request(app).get('/api/flights')).body;
    const dxb = flights.find((f) => f.to === 'DXB');
    const hotels = (await request(app).get('/api/hotels')).body;
    const auhHotel = hotels.find((h) => h.city === 'Abu Dhabi');
    const res = await request(app).get(`/api/price-range?flightId=${dxb.flightId}&hotelId=${auhHotel.hotelId}`);
    expect(res.status).toBe(200);
    expect(res.body.airport).toBe('DXB');
  });

  it('unknown flight or hotel -> 404', async () => {
    const a = await request(app).get('/api/price-range?flightId=FL-999&hotelId=HTL-TYO-004');
    expect(a.status).toBe(404);
    expect(a.body.code).toBe('NOT_FOUND');
    const b = await request(app).get('/api/price-range?flightId=FL-401&hotelId=HTL-NOPE');
    expect(b.status).toBe(404);
  });

  it('missing parameters -> 400', async () => {
    const res = await request(app).get('/api/price-range?flightId=FL-401');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });
});
