import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { resetDatabase, pool } from '../helpers/db.js';
import { makeBooking } from '../helpers/flow.js';

const app = createApp();
let bn; // Menon on SC-3, 10 Apr 11:30 – 14:30

beforeAll(async () => {
  await resetDatabase();
  bn = await makeBooking(app);
});
// Each case starts with no pending change (one pending change per booking).
beforeEach(() => pool.query(`DELETE FROM change_requests`));
afterAll(() => pool.end());

const send = (body, number = bn) => request(app).post(`/api/bookings/${number}/change-requests`).send(body);

describe('POST /api/bookings/:bookingNumber/change-requests', () => {
  it('new pickup 12:00 -> 201 PENDING; the booking is unchanged', async () => {
    const res = await send({ newPickupAt: '2027-04-10T12:00' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      changeId: expect.any(Number), bookingNumber: bn, status: 'PENDING',
      oldFlightId: 'FL-401', oldPickupAt: '2027-04-10T11:30',
      newFlightId: 'FL-401', newPickupAt: '2027-04-10T12:00',
      reason: null, decidedBy: null, createdAt: expect.any(String), decidedAt: null,
    });
    const summary = (await request(app).get(`/api/bookings/${bn}`)).body;
    expect(summary.pickupAt).toBe('2027-04-10T11:30');
    expect(summary.changeRequests).toHaveLength(1);
    expect(summary.changeRequests[0].status).toBe('PENDING');
  });

  it('flight-only change FL-402 (lands 11 Apr 10:30) -> pickup 11 Apr 11:30', async () => {
    const res = await send({ newFlightId: 'FL-402' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ newFlightId: 'FL-402', newPickupAt: '2027-04-11T11:30' });
  });

  it('FL-405 (lands 21:30) -> pickup 22:30', async () => {
    const res = await send({ newFlightId: 'FL-405', newPickupAt: null });
    expect(res.status).toBe(201);
    expect(res.body.newPickupAt).toBe('2027-04-10T22:30');
  });

  it('pickup 11:00 -> 422 R2 earliest pickup is 11:30', async () => {
    const res = await send({ newPickupAt: '2027-04-10T11:00' });
    expect(res.status).toBe(422);
    expect(res.body.violations).toEqual([{
      rule: 'R2', field: 'newPickupAt',
      message: 'Pickup 10 Apr 11:00 is too early: the flight lands 10 Apr 10:30, so the earliest pickup is 10 Apr 11:30.',
    }]);
  });

  it('FL-405 with pickup 12:00 -> 422 R2 (12:00 is before 22:30)', async () => {
    const res = await send({ newFlightId: 'FL-405', newPickupAt: '2027-04-10T12:00' });
    expect(res.status).toBe(422);
    expect(res.body.violations[0].rule).toBe('R2');
    expect(res.body.violations[0].message).toContain('earliest pickup is 10 Apr 22:30');
  });

  it('FL-403 lands at HND -> 422 R9 same airport', async () => {
    const res = await send({ newFlightId: 'FL-403' });
    expect(res.status).toBe(422);
    expect(res.body.violations).toEqual([{
      rule: 'R9', field: 'newFlightId', message: 'A change must keep the same arrival airport (NRT).',
    }]);
  });

  it('unknown flight -> 422 R1', async () => {
    const res = await send({ newFlightId: 'FL-999' });
    expect(res.status).toBe(422);
    expect(res.body.violations).toEqual([{ rule: 'R1', field: 'newFlightId', message: 'Flight FL-999 does not exist.' }]);
  });

  it('neither field -> 400; same flight and pickup -> 422 "Nothing to change"', async () => {
    expect((await send({})).status).toBe(400);
    expect((await send({ newFlightId: null, newPickupAt: null })).status).toBe(400);
    expect((await send({ newPickupAt: '2027-04-10T11:30Z' })).status).toBe(400);
    const same = await send({ newPickupAt: '2027-04-10T11:30' });
    expect(same.status).toBe(422);
    expect(same.body.violations).toEqual([{ rule: 'R9', field: 'newPickupAt', message: 'Nothing to change.' }]);
  });

  it('a second change while one is PENDING -> 409', async () => {
    expect((await send({ newPickupAt: '2027-04-10T12:00' })).status).toBe(201);
    const res = await send({ newPickupAt: '2027-04-10T12:30' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`Booking ${bn} already has a pending change request.`);
  });

  it('unknown booking -> 404', async () => {
    expect((await send({ newPickupAt: '2027-04-10T12:00' }, '1234567890')).status).toBe(404);
  });
});
