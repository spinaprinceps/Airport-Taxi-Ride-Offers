import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { applySchema } from '../../src/db.js';
import { loadData } from '../../src/loader.js';
import { resetDatabase, pool } from '../helpers/db.js';

const app = createApp();

const MENON = {
  travelerName: 'Menon family', flightId: 'FL-401', hotelId: 'HTL-TYO-004',
  adults: 2, childAges: [6], largeBags: 3, smallBags: 2,
  pickupAt: '2027-04-10T11:30', carType: null, priceInr: 12000,
};

let bookingNumber, requestId;
beforeAll(async () => {
  await resetDatabase();
  const r = await request(app).post('/api/requests').set('Idempotency-Key', randomUUID()).send(MENON);
  requestId = r.body.request.requestId;
  const o = await request(app).post(`/api/suppliers/TX-JP-01/requests/${requestId}/offers`).send({ vehicleId: 'SC-3', priceInr: 12500 });
  const b = await request(app).post(`/api/offers/${o.body.offerId}/book`);
  bookingNumber = b.body.bookingNumber;
});
afterAll(() => pool.end());

describe('GET /api/bookings/:bookingNumber', () => {
  it('returns the booking summary', async () => {
    const res = await request(app).get(`/api/bookings/${bookingNumber}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      bookingNumber, status: 'CONFIRMED', travelerName: 'Menon family',
      flight: { flightId: 'FL-401', flightNumber: 'AV 520', airline: 'AirVeda', to: 'NRT', arrivalLocal: '2027-04-10T10:30' },
      hotel: { hotelId: 'HTL-TYO-004', name: 'Ueno Garden Inn', city: 'Tokyo', area: 'Ueno' },
      pickupAt: '2027-04-10T11:30', busyUntil: '2027-04-10T14:30',
      supplier: { companyId: 'TX-JP-01', name: 'Sakura Cabs' },
      vehicle: { vehicleId: 'SC-3', type: 'SUV', seats: 6 },
      priceInr: 12500,
      adults: 2, childAges: [6], largeBags: 3, smallBags: 2,
      shared: null, changeRequests: [],
    });
  });

  it('spaces and dashes in the number are ignored', async () => {
    const spaced = `${bookingNumber.slice(0, 3)} ${bookingNumber.slice(3, 6)}-${bookingNumber.slice(6)}`;
    const res = await request(app).get(`/api/bookings/${encodeURIComponent(spaced)}`);
    expect(res.status).toBe(200);
    expect(res.body.bookingNumber).toBe(bookingNumber);
  });

  it('unused, short or non-numeric numbers -> 404 "Booking not found"', async () => {
    const unused = bookingNumber === '1234567890' ? '1234567891' : '1234567890';
    for (const n of [unused, '12345', 'abc']) {
      const res = await request(app).get(`/api/bookings/${n}`);
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'Booking not found' });
    }
  });

  it('after a restart (schema + loader again) the booking and the BOOKED request are still there', async () => {
    await applySchema();
    await loadData();
    expect((await request(app).get(`/api/bookings/${bookingNumber}`)).status).toBe(200);
    expect((await request(app).get(`/api/requests/${requestId}`)).body.request.status).toBe('BOOKED');
  });
});
