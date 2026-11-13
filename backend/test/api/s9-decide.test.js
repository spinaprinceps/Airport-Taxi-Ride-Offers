import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { resetDatabase, pool } from '../helpers/db.js';
import { makeBooking } from '../helpers/flow.js';

const app = createApp();
beforeAll(resetDatabase);
afterAll(() => pool.end());

const send = (bn, body) => request(app).post(`/api/bookings/${bn}/change-requests`).send(body);
const accept = (companyId, changeId) => request(app).post(`/api/suppliers/${companyId}/change-requests/${changeId}/accept`);
const reject = (companyId, changeId, body = {}) =>
  request(app).post(`/api/suppliers/${companyId}/change-requests/${changeId}/reject`).send(body);
const summary = async (bn) => (await request(app).get(`/api/bookings/${bn}`)).body;
const busyOf = async (bn) => (await pool.query(
  `SELECT start_at, end_at FROM vehicle_busy_times WHERE booking_number = $1`, [bn])).rows[0];

describe('accept / reject a change request', () => {
  let menon;

  it('accept "pickup 12:00" as Sakura -> 200; booking 12:00; SC-3 busy 12:00–15:00 (overlapped its own slot)', async () => {
    menon = await makeBooking(app); // SC-3, 10 Apr 11:30 – 14:30
    const c = (await send(menon, { newPickupAt: '2027-04-10T12:00' })).body;

    const list = (await request(app).get('/api/suppliers/TX-JP-01/change-requests')).body;
    expect(list[0]).toEqual({
      change: c,
      booking: { bookingNumber: menon, travelerName: 'Menon family', vehicleId: 'SC-3',
        pickupAt: '2027-04-10T11:30', busyUntil: '2027-04-10T14:30' },
      newBusyUntil: '2027-04-10T15:00',
      vehicleFreeAtNewTime: true,
    });

    const res = await accept('TX-JP-01', c.changeId);
    expect(res.status).toBe(200);
    expect(res.body.change).toMatchObject({ status: 'ACCEPTED', decidedBy: 'SUPPLIER', decidedAt: expect.any(String) });
    expect(res.body.booking).toMatchObject({ bookingNumber: menon, pickupAt: '2027-04-10T12:00', busyUntil: '2027-04-10T15:00' });
    expect(await busyOf(menon)).toEqual({ start_at: '2027-04-10T12:00', end_at: '2027-04-10T15:00' });
    expect((await summary(menon)).changeRequests[0].status).toBe('ACCEPTED');
  });

  it('car busy at the new time -> 409 R6; change REJECTED by SYSTEM with the reason; booking unchanged', async () => {
    await makeBooking(app, { travelerName: 'Later family', pickupAt: '2027-04-10T15:00' }); // SC-3 busy 15:00 – 18:00
    const c = (await send(menon, { newPickupAt: '2027-04-10T13:00' })).body;

    const list = (await request(app).get('/api/suppliers/TX-JP-01/change-requests')).body;
    expect(list[0].vehicleFreeAtNewTime).toBe(false);

    const res = await accept('TX-JP-01', c.changeId);
    expect(res.status).toBe(409);
    expect(res.body.violations).toEqual([{ rule: 'R6', field: 'vehicleId', message: 'SC-3 is busy 10 Apr 15:00 – 18:00.' }]);

    const s = await summary(menon);
    expect(s.pickupAt).toBe('2027-04-10T12:00');
    expect(s.changeRequests[0]).toMatchObject({
      changeId: c.changeId, status: 'REJECTED', decidedBy: 'SYSTEM', reason: 'SC-3 is busy 10 Apr 15:00 – 18:00.',
    });
    expect(await busyOf(menon)).toEqual({ start_at: '2027-04-10T12:00', end_at: '2027-04-10T15:00' });
  });

  it('accept the FL-405 change -> pickup 22:30, busy until 11 Apr 01:30 (crosses midnight)', async () => {
    const bn = await makeBooking(app, { travelerName: 'Night family', pickupAt: '2027-04-16T10:00' });
    const c = (await send(bn, { newFlightId: 'FL-405' })).body;
    const res = await accept('TX-JP-01', c.changeId);
    expect(res.status).toBe(200);
    expect(res.body.booking).toMatchObject({
      flight: { flightId: 'FL-405', flightNumber: 'NS 811', arrivalLocal: '2027-04-10T21:30' },
      pickupAt: '2027-04-10T22:30', busyUntil: '2027-04-11T01:30',
    });
  });

  it('Edo accepts Sakura\'s change -> 403; accepting an accepted change -> 409', async () => {
    const bn = await makeBooking(app, { travelerName: 'Owner check', pickupAt: '2027-04-17T10:00' });
    const c = (await send(bn, { newPickupAt: '2027-04-17T10:30' })).body;
    const edo = await accept('TX-JP-03', c.changeId);
    expect(edo.status).toBe(403);
    expect(edo.body.code).toBe('FORBIDDEN');
    expect((await accept('TX-JP-01', c.changeId)).status).toBe(200);
    const again = await accept('TX-JP-01', c.changeId);
    expect(again.status).toBe(409);
    expect(again.body.message).toBe(`Change request ${c.changeId} is already ACCEPTED.`);
  });

  it('reject with a reason -> REJECTED by SUPPLIER; booking unchanged; a new change can then be sent', async () => {
    const bn = await makeBooking(app, { travelerName: 'Reject check', pickupAt: '2027-04-18T10:00' });
    const c = (await send(bn, { newPickupAt: '2027-04-18T11:00' })).body;
    const res = await reject('TX-JP-01', c.changeId, { reason: 'No driver at 11:00' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'REJECTED', decidedBy: 'SUPPLIER', reason: 'No driver at 11:00' });
    expect((await summary(bn)).pickupAt).toBe('2027-04-18T10:00');
    expect((await send(bn, { newPickupAt: '2027-04-18T10:30' })).status).toBe(201);
  });

  it('accept and reject sent together -> one 200 and one 409', async () => {
    const bn = await makeBooking(app, { travelerName: 'Race', pickupAt: '2027-04-19T10:00' });
    const c = (await send(bn, { newPickupAt: '2027-04-19T10:30' })).body;
    const results = await Promise.all([accept('TX-JP-01', c.changeId), reject('TX-JP-01', c.changeId)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('unknown change or supplier -> 404', async () => {
    expect((await accept('TX-JP-01', 999999)).status).toBe(404);
    expect((await accept('TX-NOPE', 1)).status).toBe(404);
    expect((await request(app).get('/api/suppliers/TX-NOPE/change-requests')).status).toBe(404);
  });

  it('the supplier list shows PENDING first', async () => {
    const list = (await request(app).get('/api/suppliers/TX-JP-01/change-requests')).body;
    const statuses = list.map((x) => x.change.status);
    const firstDecided = statuses.findIndex((s) => s !== 'PENDING');
    expect(statuses.slice(firstDecided).includes('PENDING')).toBe(false);
  });
});
