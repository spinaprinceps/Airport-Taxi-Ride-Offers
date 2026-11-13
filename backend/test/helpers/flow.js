// Test helpers that drive the API like the frontend does.
import request from 'supertest';
import { randomUUID } from 'node:crypto';

export const MENON = {
  travelerName: 'Menon family', flightId: 'FL-401', hotelId: 'HTL-TYO-004',
  adults: 2, childAges: [6], largeBags: 3, smallBags: 2,
  pickupAt: '2027-04-10T11:30', carType: null, priceInr: 12000,
};

export async function postRequest(app, patch = {}) {
  const res = await request(app).post('/api/requests').set('Idempotency-Key', randomUUID()).send({ ...MENON, ...patch });
  if (res.status !== 201) throw new Error(`postRequest ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.request.requestId;
}

export async function makeOffer(app, companyId, requestId, vehicleId, priceInr = 12500) {
  const res = await request(app).post(`/api/suppliers/${companyId}/requests/${requestId}/offers`).send({ vehicleId, priceInr });
  if (res.status !== 201) throw new Error(`makeOffer ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.offerId;
}

// Post a request, offer the car, book it. Returns the booking number.
export async function makeBooking(app, { companyId = 'TX-JP-01', vehicleId = 'SC-3', ...patch } = {}) {
  const requestId = await postRequest(app, patch);
  const offerId = await makeOffer(app, companyId, requestId, vehicleId);
  const res = await request(app).post(`/api/offers/${offerId}/book`);
  if (res.status !== 201) throw new Error(`book ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.bookingNumber;
}
