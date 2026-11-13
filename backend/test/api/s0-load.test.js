import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadData } from '../../src/loader.js';
import { applySchema } from '../../src/db.js';
import { resetDatabase, count, pool } from '../helpers/db.js';

const EXPECTED = {
  airports: 10,
  flights: 469,
  hotels: 49,
  routes: 33,
  companies: 11,
  vehicles: 28,
  vehicle_busy_times: 6,
  ride_requests: 3,
};

async function counts() {
  const out = {};
  for (const t of Object.keys(EXPECTED)) out[t] = await count(t);
  return out;
}

beforeAll(resetDatabase);
afterAll(() => pool.end());

describe('S0: schema and data load', () => {
  it('loads every file with the expected counts', async () => {
    expect(await counts()).toEqual(EXPECTED);
  });

  it('a second boot (schema + loader again) leaves every count unchanged', async () => {
    await applySchema();
    await loadData();
    expect(await counts()).toEqual(EXPECTED);
  });

  it('seed requests get airport, city, area and drive minutes from flight, hotel and route', async () => {
    const { rows } = await pool.query(
      `SELECT request_id, source, status, airport, city, area, drive_minutes, pickup_at, child_ages
         FROM ride_requests ORDER BY request_id`,
    );
    expect(rows.map((r) => r.request_id)).toEqual(['REQ-0001', 'REQ-0002', 'REQ-0003']);
    expect(rows.every((r) => r.source === 'SEED' && r.status === 'OPEN')).toBe(true);
    expect(rows[0]).toMatchObject({ airport: 'HND', city: 'Tokyo', area: 'Shibuya', pickup_at: '2027-04-08T09:45' });
    expect(rows[2].child_ages).toEqual([3, 8]);
  });

  it('seed busy times keep the local times exactly', async () => {
    const { rows } = await pool.query(
      `SELECT vehicle_id, start_at, end_at, source FROM vehicle_busy_times WHERE ride_id = 'RIDE-0001'`,
    );
    expect(rows[0]).toEqual({ vehicle_id: 'SC-2', start_at: '2027-04-10T11:00', end_at: '2027-04-10T14:00', source: 'SEED' });
  });

  it('serves_cities becomes airport_cities rows (Indian airports and ITM have none)', async () => {
    const { rows } = await pool.query(`SELECT airport, city FROM airport_cities ORDER BY airport, city`);
    expect(rows).toEqual([
      { airport: 'AUH', city: 'Abu Dhabi' },
      { airport: 'DXB', city: 'Abu Dhabi' },
      { airport: 'DXB', city: 'Dubai' },
      { airport: 'HND', city: 'Tokyo' },
      { airport: 'KIX', city: 'Kyoto' },
      { airport: 'KIX', city: 'Osaka' },
      { airport: 'NRT', city: 'Tokyo' },
    ]);
  });

  it('the overlap constraint refuses two busy times of one car that overlap', async () => {
    await expect(
      pool.query(
        `INSERT INTO vehicle_busy_times (vehicle_id, start_at, end_at, source)
         VALUES ('SC-2', '2027-04-10T13:59', '2027-04-10T15:00', 'BOOKING')`,
      ),
    ).rejects.toMatchObject({ code: '23P01' });
  });

  it('back-to-back busy times are allowed by the constraint', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO vehicle_busy_times (vehicle_id, start_at, end_at, source)
         VALUES ('SC-2', '2027-04-10T14:00', '2027-04-10T16:00', 'BOOKING')`,
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});

describe('GET /api/suppliers', () => {
  it('returns the 11 suppliers in file order, first TX-JP-01', async () => {
    const res = await request(createApp()).get('/api/suppliers');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(11);
    expect(res.body[0]).toEqual({
      companyId: 'TX-JP-01',
      name: 'Sakura Cabs',
      airports: ['NRT', 'HND'],
      serviceFrom: '06:00',
      serviceUntil: '23:00',
      rating: 4.4,
    });
    expect(res.body.find((s) => s.companyId === 'TX-AE-05')).toMatchObject({
      name: 'Marina Rides', serviceFrom: '05:00', serviceUntil: '01:00', airports: ['DXB'],
    });
  });
});
