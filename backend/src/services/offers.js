// Offers feature (S4): a supplier assigns one of its cars to a request at a price.
import { z } from 'zod';
import { withTransaction } from '../db.js';
import { conflict, forbidden, notFound, ruleViolation, validation } from '../errors.js';
import { checkOwnership, validateOffer } from '../rules/offerRules.js';
import { findClash } from '../rules/eligibility.js';
import { getVehicle, listBusyTimes } from '../repos/companies.js';
import { getRequest, lockRequest } from '../repos/requests.js';
import * as repo from '../repos/offers.js';
import { requireCompany } from './dashboard.js';
import { toRequestObject, CAR_TYPES } from './requests.js';

const offerBody = z.object({
  vehicleId: z.string().trim().min(1).max(50),
  priceInr: z.number().int().min(-2147483648).max(2147483647),
});

export async function createOffer(companyId, requestId, rawBody) {
  const input = offerBody.parse(rawBody ?? {});
  const company = await requireCompany(companyId);

  return withTransaction(async (db) => {
    // Share lock: a booking of this request (FOR UPDATE) waits until this offer commits, and vice versa.
    const status = await lockRequest(requestId, 'SHARE', db);
    if (!status) throw notFound(`Request ${requestId} not found.`);

    const vehicle = await getVehicle(input.vehicleId, db);
    if (!vehicle) throw notFound(`Car ${input.vehicleId} not found.`);
    const r7 = checkOwnership(company, vehicle, vehicle.companyName);
    if (r7) throw forbidden(r7.message, [r7]);

    if (status !== 'OPEN') throw conflict(`Request ${requestId} is not open (${status}).`);
    if (await repo.offerExists(requestId, vehicle.vehicleId, db)) {
      throw conflict(`${vehicle.vehicleId} is already offered on ${requestId}.`);
    }

    const request = toRequestObject(await getRequest(requestId, db));
    const busyTimes = await listBusyTimes([vehicle.vehicleId], db);
    const violations = validateOffer(request, company, vehicle, busyTimes, input.priceInr);
    if (violations.length) throw ruleViolation(violations);

    try {
      return await repo.insertOffer({ requestId, companyId, vehicleId: vehicle.vehicleId, priceInr: input.priceInr }, db);
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'offers_request_vehicle_uniq') {
        throw conflict(`${vehicle.vehicleId} is already offered on ${requestId}.`);
      }
      throw err;
    }
  });
}

const SORTS = { price_asc: false, price_desc: true };

// Traveler's taxi list (S5). vehicleFreeNow = the car passes R6 for this request right now
// (ignoring the busy time of this request's own booking).
export async function listRequestOffers(requestId, { sort = 'price_asc', type } = {}) {
  if (!(sort in SORTS)) throw validation('sort must be price_asc or price_desc.');
  if (type !== undefined && !CAR_TYPES.includes(type)) throw validation(`type must be one of ${CAR_TYPES.join(', ')}.`);

  const row = await getRequest(requestId);
  if (!row) throw notFound(`Request ${requestId} not found.`);
  const request = toRequestObject(row);

  const offers = await repo.listRequestOffers(requestId, { desc: SORTS[sort], type: type ?? null });
  const busyTimes = (await listBusyTimes([...new Set(offers.map((o) => o.vehicleId))]))
    .filter((b) => !row.booking_number || b.bookingNumber !== row.booking_number);
  return offers.map((o) => ({
    ...o,
    vehicleFreeNow: !findClash(o.vehicleId, request.pickupAt, request.busyUntil, busyTimes),
  }));
}

export const parseOfferId = (raw) => (/^\d{1,15}$/.test(String(raw)) ? Number(raw) : null);

// Traveler rejects an offer. Repeating is a no-op (200). BOOKED / NOT_CHOSEN -> 409.
export async function rejectOffer(rawOfferId) {
  const offerId = parseOfferId(rawOfferId);
  if (offerId === null) throw notFound(`Offer ${rawOfferId} not found.`);
  return withTransaction(async (db) => {
    const offer = await repo.lockOffer(offerId, db);
    if (!offer) throw notFound(`Offer ${offerId} not found.`);
    if (offer.status === 'REJECTED') return offer;
    if (offer.status !== 'OFFERED') throw conflict(`Offer ${offerId} is ${offer.status} and cannot be rejected.`);
    return repo.setOfferStatus(offerId, 'REJECTED', db);
  });
}

export async function listSupplierOffers(companyId) {
  await requireCompany(companyId);
  return repo.listCompanyOffersWithRequest(companyId);
}
