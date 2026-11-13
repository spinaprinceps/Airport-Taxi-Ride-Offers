// SQL only.
import { query } from '../db.js';

const cols = `change_id, booking_number, old_flight_id, old_pickup_at, new_flight_id, new_pickup_at, status,
              reason, decided_by, created_at, decided_at`;

export const toChange = (r) => ({
  changeId: r.change_id,
  bookingNumber: r.booking_number,
  status: r.status,
  oldFlightId: r.old_flight_id,
  oldPickupAt: r.old_pickup_at,
  newFlightId: r.new_flight_id,
  newPickupAt: r.new_pickup_at,
  reason: r.reason,
  decidedBy: r.decided_by,
  createdAt: r.created_at,
  decidedAt: r.decided_at,
});

export async function hasPendingChange(bookingNumber, db = { query }) {
  const { rows } = await db.query(
    `SELECT 1 FROM change_requests WHERE booking_number = $1 AND status = 'PENDING'`, [bookingNumber]);
  return rows.length > 0;
}

export async function insertChange(c, db = { query }) {
  const { rows } = await db.query(
    `INSERT INTO change_requests (booking_number, old_flight_id, old_pickup_at, new_flight_id, new_pickup_at, status)
     VALUES ($1, $2, $3, $4, $5, 'PENDING') RETURNING ${cols}`,
    [c.bookingNumber, c.oldFlightId, c.oldPickupAt, c.newFlightId, c.newPickupAt],
  );
  return toChange(rows[0]);
}

export async function lockChange(changeId, db) {
  const { rows } = await db.query(`SELECT ${cols} FROM change_requests WHERE change_id = $1 FOR UPDATE`, [changeId]);
  return rows[0] ? toChange(rows[0]) : null;
}

export async function decideChange(changeId, { status, decidedBy, reason = null }, db = { query }) {
  const { rows } = await db.query(
    `UPDATE change_requests
        SET status = $2, decided_by = $3, reason = $4, decided_at = (clock_timestamp() AT TIME ZONE 'UTC')
      WHERE change_id = $1 RETURNING ${cols}`,
    [changeId, status, decidedBy, reason],
  );
  return toChange(rows[0]);
}

// The supplier's change-requests tab: PENDING first, then newest first.
export async function listCompanyChanges(companyId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${cols.split(',').map((c) => `cr.${c.trim()}`).join(', ')},
            b.vehicle_id, b.pickup_at, r.traveler_name, r.drive_minutes
       FROM change_requests cr
       JOIN bookings b ON b.booking_number = cr.booking_number
       JOIN ride_requests r ON r.request_id = b.request_id
      WHERE b.company_id = $1
      ORDER BY (cr.status = 'PENDING') DESC, cr.created_at DESC, cr.change_id DESC`,
    [companyId],
  );
  return rows.map((r) => ({
    change: toChange(r),
    vehicleId: r.vehicle_id,
    pickupAt: r.pickup_at,
    travelerName: r.traveler_name,
    driveMinutes: r.drive_minutes,
  }));
}

// Newest first.
export async function listBookingChanges(bookingNumber, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${cols} FROM change_requests WHERE booking_number = $1 ORDER BY created_at DESC, change_id DESC`,
    [bookingNumber],
  );
  return rows.map(toChange);
}
