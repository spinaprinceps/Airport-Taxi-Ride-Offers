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

// Newest first.
export async function listBookingChanges(bookingNumber, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${cols} FROM change_requests WHERE booking_number = $1 ORDER BY created_at DESC, change_id DESC`,
    [bookingNumber],
  );
  return rows.map(toChange);
}
