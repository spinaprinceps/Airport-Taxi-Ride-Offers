// Requests feature (S2): post a request, list requests, one request.
import { z } from 'zod';
import { BUSY_DRIVE_FACTOR } from '../config.js';
import { isLocalDateTime, addMinutes } from '../time.js';
import { notFound, ruleViolation, validation } from '../errors.js';
import { validateRequest, earliestPickup } from '../rules/requestRules.js';
import { summarize } from '../rules/eligibility.js';
import { resolveTrip } from './catalog.js';
import * as repo from '../repos/requests.js';
import { loadCompanies, listBusyTimes } from '../repos/companies.js';

export const CAR_TYPES = ['HATCHBACK', 'SEDAN', 'SUV', 'BUS'];

// Shape only (400). Ranges and business rules are R1-R3 (422).
const int = () => z.number().int().min(-2147483648).max(2147483647);
const localDateTime = z.string().refine(isLocalDateTime, {
  message: 'Use a local date-time like 2027-04-10T11:30 (no Z, no offset).',
});

export const requestBody = z.object({
  travelerName: z.string().trim().min(1, 'travelerName is required.').max(200),
  flightId: z.string().trim().min(1).max(50),
  hotelId: z.string().trim().min(1).max(50),
  adults: int(),
  childAges: z.array(int()).max(50).default([]),
  largeBags: int(),
  smallBags: int(),
  pickupAt: localDateTime.nullable().optional().default(null),
  carType: z.enum(CAR_TYPES).nullable().optional().default(null),
  priceInr: int(),
});

// DB row (repos/requests.js) -> the request object of the API contract.
export function toRequestObject(r) {
  return {
    requestId: r.request_id,
    status: r.status,
    travelerName: r.traveler_name,
    flight: {
      flightId: r.flight_id,
      flightNumber: r.flight_number,
      airline: r.airline,
      to: r.airport,
      arrivalLocal: r.arrival_at,
    },
    hotel: { hotelId: r.hotel_id, name: r.hotel_name, city: r.city, area: r.area },
    adults: r.adults,
    childAges: r.child_ages,
    passengers: r.adults + r.child_ages.length,
    largeBags: r.large_bags,
    smallBags: r.small_bags,
    pickupAt: r.pickup_at,
    busyUntil: addMinutes(r.pickup_at, BUSY_DRIVE_FACTOR * r.drive_minutes),
    carType: r.car_type,
    priceInr: r.price_inr,
    priceMinInr: r.price_min_inr,
    priceMaxInr: r.price_max_inr,
    driveMinutes: r.drive_minutes,
  };
}

// Serveability is computed live (busy times change). A booked request is no longer looking for a supplier.
function serveabilityOf(request, companies, busyTimes) {
  if (request.status !== 'OPEN') return { supplierCount: null, reason: null };
  return summarize(request, companies, busyTimes);
}

async function view(row, ctx) {
  const { companies, busyTimes } = ctx ?? { companies: await loadCompanies(), busyTimes: await listBusyTimes() };
  const request = toRequestObject(row);
  return {
    request,
    serveability: serveabilityOf(request, companies, busyTimes),
    offerCount: row.offer_count,
    bookingNumber: row.booking_number,
  };
}

export async function getRequestView(requestId) {
  const row = await repo.getRequest(requestId);
  if (!row) throw notFound(`Request ${requestId} not found.`);
  return view(row);
}

export async function listRequestViews({ traveler }) {
  const [rows, companies, busyTimes] = await Promise.all([
    repo.listRequests({ traveler: traveler?.trim() || null }), loadCompanies(), listBusyTimes(),
  ]);
  return Promise.all(rows.map((row) => view(row, { companies, busyTimes })));
}

// Returns { status: 201 | 200, body }.
export async function createRequest(rawBody, idempotencyKey) {
  if (idempotencyKey !== undefined && (idempotencyKey.length < 1 || idempotencyKey.length > 200)) {
    throw validation('Idempotency-Key must be 1 to 200 characters.');
  }
  const input = requestBody.parse(rawBody ?? {});

  if (idempotencyKey) {
    const existing = await repo.findIdByIdempotencyKey(idempotencyKey);
    if (existing) return { status: 200, body: await getRequestView(existing) };
  }

  const { flight, hotel, airport, route } = await resolveTrip(input.flightId, input.hotelId);
  const violations = validateRequest(input, flight, hotel, airport, route);
  if (violations.length) throw ruleViolation(violations);

  let requestId;
  try {
    requestId = await repo.insertRequest({
      ...input,
      idempotencyKey: idempotencyKey ?? null,
      airport: route.airport,
      city: route.city,
      area: route.area,
      driveMinutes: route.drive_minutes,
      pickupAt: input.pickupAt ? input.pickupAt.slice(0, 16) : earliestPickup(flight),
    });
  } catch (err) {
    // Same key sent twice at the same time: the second insert loses the race.
    if (err.code === '23505' && err.constraint === 'ride_requests_idempotency_key_key') {
      const existing = await repo.findIdByIdempotencyKey(idempotencyKey);
      return { status: 200, body: await getRequestView(existing) };
    }
    throw err;
  }
  return { status: 201, body: await getRequestView(requestId) };
}
