import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { resetDatabase, pool } from '../helpers/db.js';
import { postRequest, makeOffer, makeBooking } from '../helpers/flow.js';

const app = createApp();
const suppliers = (requestId) => request(app).get(`/api/requests/${requestId}/suppliers`);
const ask = (requestId, companyId) => request(app).post(`/api/requests/${requestId}/suppliers/${companyId}/ask`);
const decline = (companyId, requestId, body) =>
  request(app).post(`/api/suppliers/${companyId}/requests/${requestId}/decline`).send(body);
const dashboard = (companyId) => request(app).get(`/api/suppliers/${companyId}/requests`);
const detail = (companyId, requestId) => request(app).get(`/api/suppliers/${companyId}/requests/${requestId}`);

let menon;
beforeAll(async () => {
  await resetDatabase();
  menon = await postRequest(app);
});
afterAll(() => pool.end());

describe('GET /api/requests/:requestId/suppliers', () => {
  it('lists the suppliers that can serve the request, with their cars that fit and are free', async () => {
    const res = await suppliers(menon);
    expect(res.status).toBe(200);
    expect(res.body.map((s) => s.companyId)).toEqual(['TX-JP-01', 'TX-JP-03']);
    expect(res.body[0]).toEqual({
      companyId: 'TX-JP-01', name: 'Sakura Cabs', rating: 4.4, serviceFrom: '06:00', serviceUntil: '23:00',
      vehicles: [{ vehicleId: 'SC-3', type: 'SUV', seats: 6, largeBags: 4, smallBags: 3 }],
      invite: null,
    });
    expect(res.body[1].vehicles.map((v) => v.vehicleId)).toEqual(['EP-1', 'EP-2']);
  });

  it('is empty when no supplier can serve, and 404 for an unknown request', async () => {
    const big = await postRequest(app, { adults: 7 });
    expect((await suppliers(big)).body).toEqual([]);
    expect((await suppliers('REQ-9999')).status).toBe(404);
  });

  it('is empty for a booked request', async () => {
    const number = await makeBooking(app, { pickupAt: '2027-04-10T16:00' });
    const { rows } = await pool.query('SELECT request_id FROM bookings WHERE booking_number = $1', [number]);
    expect((await suppliers(rows[0].request_id)).body).toEqual([]);
  });
});

describe('POST /api/requests/:requestId/suppliers/:companyId/ask', () => {
  it('saves the ask; the supplier sees it on its dashboard and on the request', async () => {
    const res = await ask(menon, 'TX-JP-01');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ requestId: menon, companyId: 'TX-JP-01', status: 'REQUESTED', reason: null });

    expect((await suppliers(menon)).body[0].invite).toEqual({ status: 'REQUESTED', reason: null });
    const card = (await dashboard('TX-JP-01')).body.find((x) => x.request.requestId === menon);
    expect(card.invite).toEqual({ status: 'REQUESTED', reason: null });
    expect((await detail('TX-JP-01', menon)).body.invite).toEqual({ status: 'REQUESTED', reason: null });
  });

  it('asking again changes nothing (200)', async () => {
    const res = await ask(menon, 'TX-JP-01');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REQUESTED');
  });

  it('a supplier that was not asked still sees the request (R4), with invite null', async () => {
    const card = (await dashboard('TX-JP-03')).body.find((x) => x.request.requestId === menon);
    expect(card.invite).toBeNull();
  });

  it('refuses a supplier that cannot serve the request, with the rule', async () => {
    const res = await ask(menon, 'TX-JP-02'); // Narita Star does not drive to Ueno
    expect(res.status).toBe(422);
    expect(res.body.violations).toEqual([
      { rule: 'R4', field: 'area', message: 'Narita Star Taxi does not drive to Tokyo / Ueno.' },
    ]);
  });

  it('refuses a supplier with no car that fits and is free, listing why per car', async () => {
    const bus = await postRequest(app, { carType: 'BUS' });
    const res = await ask(bus, 'TX-JP-01');
    expect(res.status).toBe(422);
    expect(res.body.violations.every((x) => x.rule === 'R5' || x.rule === 'R6')).toBe(true);
    expect(res.body.violations.length).toBeGreaterThan(0);
  });

  it('404 for an unknown request or supplier; 409 for a booked request', async () => {
    expect((await ask('REQ-9999', 'TX-JP-01')).status).toBe(404);
    expect((await ask(menon, 'TX-XX-99')).status).toBe(404);
    const number = await makeBooking(app, { pickupAt: '2027-04-10T19:00' });
    const { rows } = await pool.query('SELECT request_id FROM bookings WHERE booking_number = $1', [number]);
    expect((await ask(rows[0].request_id, 'TX-JP-01')).status).toBe(409);
  });
});

describe('POST /api/suppliers/:companyId/requests/:requestId/decline', () => {
  it('saves the decline with the reason; the traveler sees it', async () => {
    const res = await decline('TX-JP-01', menon, { reason: 'No driver that morning' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      requestId: menon, companyId: 'TX-JP-01', status: 'DECLINED', reason: 'No driver that morning',
    });
    expect((await suppliers(menon)).body[0].invite).toEqual({ status: 'DECLINED', reason: 'No driver that morning' });
  });

  it('the traveler cannot ask a supplier that declined (409)', async () => {
    const res = await ask(menon, 'TX-JP-01');
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Sakura Cabs declined this request.');
  });

  it('a supplier can decline a request it was not asked for, without a reason', async () => {
    const res = await decline('TX-JP-03', menon);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'DECLINED', reason: null });
  });

  it('403 R4 for a supplier that cannot serve it; 404 for unknown ids', async () => {
    const res = await decline('TX-JP-02', menon, {});
    expect(res.status).toBe(403);
    expect(res.body.violations[0].rule).toBe('R4');
    expect((await decline('TX-JP-01', 'REQ-9999', {})).status).toBe(404);
    expect((await decline('TX-XX-99', menon, {})).status).toBe(404);
  });

  it('409 when the supplier has already assigned a car to the request', async () => {
    const other = await postRequest(app, { pickupAt: '2027-04-11T09:00' });
    await makeOffer(app, 'TX-JP-01', other, 'SC-3');
    const res = await decline('TX-JP-01', other, {});
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`Sakura Cabs has already assigned a car to ${other}.`);
  });
});
