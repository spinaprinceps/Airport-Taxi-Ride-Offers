// Change requests: the traveler sends one (S8), the supplier accepts or rejects it (S9).
// Lock order everywhere: booking, then change request.
import { z } from 'zod';
import { withTransaction } from '../db.js';
import { BUSY_DRIVE_FACTOR } from '../config.js';
import { conflict, forbidden, notFound, ruleViolation, validation } from '../errors.js';
import { isLocalDateTime, addMinutes } from '../time.js';
import { resolveChange } from '../rules/changeRules.js';
import { checkPickup } from '../rules/requestRules.js';
import { busyViolation, findClash } from '../rules/eligibility.js';
import { getFlight } from '../repos/catalog.js';
import { listBusyTimes, lockVehicle } from '../repos/companies.js';
import { lockBooking, moveBooking } from '../repos/bookings.js';
import * as repo from '../repos/changes.js';
import { getBookingSummary, normalizeBookingNumber } from './bookings.js';
import { requireCompany } from './dashboard.js';

const changeBody = z.object({
  newFlightId: z.string().trim().min(1).max(50).nullable().optional(),
  newPickupAt: z.string().refine(isLocalDateTime, {
    message: 'Use a local date-time like 2027-04-10T11:30 (no Z, no offset).',
  }).nullable().optional(),
});

// S8: the traveler asks for a new flight and/or pickup. The booking does not change until the supplier accepts.
export async function submitChange(rawNumber, rawBody) {
  const input = changeBody.parse(rawBody ?? {});
  if (!input.newFlightId && !input.newPickupAt) {
    throw validation('Send a new flight, a new pickup time, or both.', [
      { rule: null, field: 'newFlightId', message: 'Set newFlightId or newPickupAt.' },
    ]);
  }
  const bookingNumber = normalizeBookingNumber(rawNumber);
  if (!bookingNumber) throw notFound('Booking not found');

  return withTransaction(async (db) => {
    const booking = await lockBooking(bookingNumber, db);
    if (!booking) throw notFound('Booking not found');
    if (booking.groupId !== null) {
      throw conflict('A shared ride cannot change flight or pickup: it would move the other family too.');
    }
    if (await repo.hasPendingChange(bookingNumber, db)) {
      throw conflict(`Booking ${bookingNumber} already has a pending change request.`);
    }

    const flight = await getFlight(input.newFlightId ?? booking.flightId, db);
    const { flightId, pickupAt, violations } = resolveChange(booking, flight, input);
    if (violations.length) throw ruleViolation(violations);

    try {
      return await repo.insertChange({
        bookingNumber, oldFlightId: booking.flightId, oldPickupAt: booking.pickupAt,
        newFlightId: flightId, newPickupAt: pickupAt,
      }, db);
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'cr_one_pending_per_booking') {
        throw conflict(`Booking ${bookingNumber} already has a pending change request.`);
      }
      throw err;
    }
  });
}

const busyUntilFor = (pickupAt, driveMinutes) => addMinutes(pickupAt, BUSY_DRIVE_FACTOR * driveMinutes);

// The car's busy times without this booking's own slot (a small delay must not clash with itself).
async function otherBusyTimes(booking, db) {
  return (await listBusyTimes([booking.vehicleId], db)).filter((b) => b.bookingNumber !== booking.bookingNumber);
}

// S9: the supplier's change-requests tab.
export async function listSupplierChanges(companyId) {
  await requireCompany(companyId);
  const rows = await repo.listCompanyChanges(companyId);
  const busy = await listBusyTimes([...new Set(rows.map((r) => r.vehicleId))]);
  return rows.map((r) => {
    const newBusyUntil = busyUntilFor(r.change.newPickupAt, r.driveMinutes);
    const others = busy.filter((b) => b.bookingNumber !== r.change.bookingNumber);
    return {
      change: r.change,
      booking: {
        bookingNumber: r.change.bookingNumber,
        travelerName: r.travelerName,
        vehicleId: r.vehicleId,
        pickupAt: r.pickupAt,
        busyUntil: busyUntilFor(r.pickupAt, r.driveMinutes),
      },
      newBusyUntil,
      vehicleFreeAtNewTime: !findClash(r.vehicleId, r.change.newPickupAt, newBusyUntil, others),
    };
  });
}

const parseChangeId = (raw) => (/^\d{1,15}$/.test(String(raw)) ? Number(raw) : null);

// Locks booking then change; checks it exists, belongs to companyId and is PENDING.
async function lockForDecision(companyId, rawChangeId, db) {
  const changeId = parseChangeId(rawChangeId);
  if (changeId === null) throw notFound(`Change request ${rawChangeId} not found.`);
  const { rows } = await db.query(`SELECT booking_number FROM change_requests WHERE change_id = $1`, [changeId]);
  if (!rows[0]) throw notFound(`Change request ${changeId} not found.`);

  const booking = await lockBooking(rows[0].booking_number, db);
  const change = await repo.lockChange(changeId, db);
  if (booking.companyId !== companyId) {
    throw forbidden(`Change request ${changeId} is for another supplier's booking.`);
  }
  if (change.status !== 'PENDING') throw conflict(`Change request ${changeId} is already ${change.status}.`);
  return { booking, change };
}

// S9: accept. Re-checks R2 and that the car is free at the new time (R6), leaving out the booking's own slot.
// If the car is busy, the change is saved as REJECTED by SYSTEM and the call returns 409 R6.
export async function acceptChange(companyId, rawChangeId) {
  await requireCompany(companyId);
  const outcome = await withTransaction(async (db) => {
    const { booking, change } = await lockForDecision(companyId, rawChangeId, db);

    const flight = await getFlight(change.newFlightId, db);
    const r2 = checkPickup(flight, change.newPickupAt, 'newPickupAt');
    if (r2) throw ruleViolation([r2]);

    const newBusyUntil = busyUntilFor(change.newPickupAt, booking.driveMinutes);
    await lockVehicle(booking.vehicleId, db);
    let clash = findClash(booking.vehicleId, change.newPickupAt, newBusyUntil, await otherBusyTimes(booking, db));
    if (!clash) {
      await db.query('SAVEPOINT move');
      try {
        await moveBooking(booking, { flightId: change.newFlightId, pickupAt: change.newPickupAt, busyUntil: newBusyUntil }, db);
      } catch (err) {
        if (err.code !== '23P01') throw err;
        await db.query('ROLLBACK TO SAVEPOINT move');
        clash = findClash(booking.vehicleId, change.newPickupAt, newBusyUntil, await otherBusyTimes(booking, db))
          ?? { startAt: change.newPickupAt, endAt: newBusyUntil };
      }
    }
    if (clash) {
      const violation = busyViolation(booking.vehicleId, clash);
      await repo.decideChange(change.changeId, { status: 'REJECTED', decidedBy: 'SYSTEM', reason: violation.message }, db);
      return { busy: violation, bookingNumber: booking.bookingNumber };
    }
    const decided = await repo.decideChange(change.changeId, { status: 'ACCEPTED', decidedBy: 'SUPPLIER' }, db);
    return { change: decided, bookingNumber: booking.bookingNumber };
  });

  // Committed. A busy car is reported after the SYSTEM rejection is saved.
  if (outcome.busy) throw conflict(outcome.busy.message, [outcome.busy]);
  return { change: outcome.change, booking: await getBookingSummary(outcome.bookingNumber) };
}

const rejectBody = z.object({ reason: z.string().trim().max(500).nullable().optional() }).optional();

// S9: reject (optional reason). The booking is unchanged.
export async function rejectChange(companyId, rawChangeId, rawBody) {
  const body = rejectBody.parse(rawBody ?? {}) ?? {};
  await requireCompany(companyId);
  return withTransaction(async (db) => {
    const { change } = await lockForDecision(companyId, rawChangeId, db);
    return repo.decideChange(change.changeId, {
      status: 'REJECTED', decidedBy: 'SUPPLIER', reason: body.reason || null,
    }, db);
  });
}
