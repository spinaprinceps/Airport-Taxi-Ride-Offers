// Booking feature (S6): the traveler books one offer. No double booking (M6).
import { randomInt } from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { AppError, conflict, notFound } from '../errors.js';
import { busyViolation, findClash } from '../rules/eligibility.js';
import { listBusyTimes, lockVehicle } from '../repos/companies.js';
import { getRequest, lockRequest } from '../repos/requests.js';
import { lockOffer } from '../repos/offers.js';
import * as repo from '../repos/bookings.js';
import * as groups from '../repos/groups.js';
import { listBookingChanges } from '../repos/changes.js';
import { BUSY_DRIVE_FACTOR } from '../config.js';
import { addMinutes } from '../time.js';
import { toRequestObject } from './requests.js';
import { parseOfferId } from './offers.js';

// "483 019-2756" -> "4830192756"; anything that is not 10 digits (first 1-9) -> null.
export function normalizeBookingNumber(raw) {
  const s = String(raw ?? '').replace(/[\s-]/g, '');
  return /^[1-9][0-9]{9}$/.test(s) ? s : null;
}

const bookingNotFound = () => notFound('Booking not found');

// Booking summary (S7).
export async function getBookingSummary(rawNumber) {
  const bookingNumber = normalizeBookingNumber(rawNumber);
  if (!bookingNumber) throw bookingNotFound();
  const b = await repo.getBookingSummaryRow(bookingNumber);
  if (!b) throw bookingNotFound();
  return {
    bookingNumber: b.booking_number,
    status: b.status,
    travelerName: b.traveler_name,
    flight: {
      flightId: b.flight_id, flightNumber: b.flight_number, airline: b.airline,
      to: b.to_airport, arrivalLocal: b.arrival_local,
    },
    hotel: { hotelId: b.hotel_id, name: b.hotel_name, city: b.city, area: b.area },
    pickupAt: b.pickup_at,
    busyUntil: b.busy_until ?? addMinutes(b.pickup_at, BUSY_DRIVE_FACTOR * b.drive_minutes),
    supplier: { companyId: b.company_id, name: b.company_name },
    vehicle: { vehicleId: b.vehicle_id, type: b.vehicle_type, seats: b.vehicle_seats },
    priceInr: b.price_inr,
    adults: b.adults,
    childAges: b.child_ages,
    largeBags: b.large_bags,
    smallBags: b.small_bags,
    shared: b.group_id === null ? null : {
      groupId: Number(b.group_id),
      otherPartiesBooked: (await groups.countGroupBookings(b.group_id)) - 1,
    },
    changeRequests: await listBookingChanges(bookingNumber),
  };
}

// Random 10 digits, first digit 1-9.
export const newBookingNumber = () => String(randomInt(1_000_000_000, 10_000_000_000));

const busyConflict = (vehicleId, clash) => {
  const violation = busyViolation(vehicleId, clash);
  return conflict(violation.message, [violation]);
};

// Returns { status: 201 | 200, body: { bookingNumber } }.
export async function bookOffer(rawOfferId) {
  const offerId = parseOfferId(rawOfferId);
  if (offerId === null) throw notFound(`Offer ${rawOfferId} not found.`);

  // Which request? (read without a lock; the locks below are taken request first, then offer)
  const { rows } = await query(`SELECT request_id FROM offers WHERE offer_id = $1`, [offerId]);
  if (!rows[0]) throw notFound(`Offer ${offerId} not found.`);
  const requestId = rows[0].request_id;

  return withTransaction(async (db) => {
    const requestStatus = await lockRequest(requestId, 'UPDATE', db);
    const offer = await lockOffer(offerId, db);

    // 1. The offer
    if (offer.status === 'BOOKED') {
      return { status: 200, body: { bookingNumber: await repo.findBookingNumberByOffer(offerId, db) } };
    }
    if (offer.status === 'REJECTED') throw conflict(`Offer ${offerId} was rejected.`);
    if (offer.status === 'NOT_CHOSEN') throw conflict(`Offer ${offerId} was not chosen.`);

    // 2. The request
    if (requestStatus !== 'OPEN') throw conflict(`Request ${requestId} is already booked.`);
    const request = toRequestObject(await getRequest(requestId, db));

    // A shared offer: lock the group (request -> offer -> group -> car). Pickup and window are the group's.
    const group = offer.groupId === null ? null : await groups.lockGroup(offer.groupId, db);
    const pickupAt = group ? group.pickupAt : request.pickupAt;
    const busyUntil = group ? addMinutes(group.pickupAt, BUSY_DRIVE_FACTOR * request.driveMinutes) : request.busyUntil;
    const groupBusy = group ? await groups.getGroupBusyTime(group.groupId, db) : null;
    if (groupBusy && groupBusy.vehicleId !== offer.vehicleId) {
      throw conflict(`The shared ride already uses ${groupBusy.vehicleId}; offer ${offerId} is for another car.`);
    }

    // 3. Is the car still free? (M6) Lock the car first so two bookings of it run one after the other.
    //    The second family of a shared ride joins the group's busy time, so it skips this check.
    await lockVehicle(offer.vehicleId, db);
    if (!groupBusy) {
      const clash = findClash(offer.vehicleId, pickupAt, busyUntil, await listBusyTimes([offer.vehicleId], db));
      if (clash) throw busyConflict(offer.vehicleId, clash);
    }

    // 4. Booking number (retry on the rare duplicate)
    let bookingNumber = null;
    for (let i = 0; i < 4 && !bookingNumber; i++) {
      const candidate = newBookingNumber();
      const inserted = await repo.insertBooking({
        bookingNumber: candidate, requestId, offerId, companyId: offer.companyId, vehicleId: offer.vehicleId,
        flightId: request.flight.flightId, pickupAt, priceInr: offer.priceInr,
      }, db);
      if (inserted) bookingNumber = candidate;
    }
    if (!bookingNumber) throw new AppError(500, 'INTERNAL', 'Could not create a booking number.');

    // 5. Busy time: one row per trip. The exclusion constraint is the last guard against a parallel booking.
    if (!groupBusy) {
      await db.query('SAVEPOINT busy');
      try {
        await repo.insertBookingBusyTime(
          { vehicleId: offer.vehicleId, startAt: pickupAt, endAt: busyUntil, bookingNumber, groupId: offer.groupId }, db);
      } catch (err) {
        if (err.code !== '23P01') throw err;
        await db.query('ROLLBACK TO SAVEPOINT busy');
        const now = findClash(offer.vehicleId, pickupAt, busyUntil, await listBusyTimes([offer.vehicleId], db));
        throw busyConflict(offer.vehicleId, now ?? { startAt: pickupAt, endAt: busyUntil });
      }
    }

    // 6. Statuses
    await repo.markBooked(offerId, requestId, db);
    if (group) await groups.dropOtherGroupOffers(group.groupId, offer.vehicleId, db);
    return { status: 201, body: { bookingNumber } };
  });
}
