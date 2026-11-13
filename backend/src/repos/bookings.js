// SQL only.
import { query } from '../db.js';

// Everything the booking summary needs. busy_until comes from the booking's own busy time.
export async function getBookingSummaryRow(bookingNumber, db = { query }) {
  const { rows } = await db.query(
    `SELECT b.booking_number, b.status, b.request_id, b.offer_id, b.company_id, b.vehicle_id, b.flight_id,
            b.pickup_at, b.price_inr,
            r.traveler_name, r.hotel_id, r.city, r.area, r.drive_minutes, r.adults, r.child_ages,
            r.large_bags, r.small_bags,
            f.flight_number, f.airline, f.to_airport, f.arrival_local,
            h.name AS hotel_name,
            c.name AS company_name,
            v.type AS vehicle_type, v.seats AS vehicle_seats,
            vb.end_at AS busy_until
       FROM bookings b
       JOIN ride_requests r ON r.request_id = b.request_id
       JOIN flights f ON f.flight_id = b.flight_id
       JOIN hotels h ON h.hotel_id = r.hotel_id
       JOIN companies c ON c.company_id = b.company_id
       JOIN vehicles v ON v.vehicle_id = b.vehicle_id
       LEFT JOIN vehicle_busy_times vb ON vb.booking_number = b.booking_number
      WHERE b.booking_number = $1`,
    [bookingNumber],
  );
  return rows[0] ?? null;
}

// Locks the booking row; returns what change requests need, or null.
export async function lockBooking(bookingNumber, db) {
  const { rows } = await db.query(
    `SELECT b.booking_number, b.request_id, b.company_id, b.vehicle_id, b.flight_id, b.pickup_at,
            r.airport, r.drive_minutes
       FROM bookings b JOIN ride_requests r ON r.request_id = b.request_id
      WHERE b.booking_number = $1
        FOR UPDATE OF b`,
    [bookingNumber],
  );
  const r = rows[0];
  return r ? {
    bookingNumber: r.booking_number, requestId: r.request_id, companyId: r.company_id, vehicleId: r.vehicle_id,
    flightId: r.flight_id, pickupAt: r.pickup_at, airport: r.airport, driveMinutes: r.drive_minutes,
  } : null;
}

// Move the booking (and its request and busy time) to a new flight and pickup.
export async function moveBooking(b, { flightId, pickupAt, busyUntil }, db) {
  await db.query(`UPDATE bookings SET flight_id = $2, pickup_at = $3 WHERE booking_number = $1`,
    [b.bookingNumber, flightId, pickupAt]);
  await db.query(`UPDATE ride_requests SET flight_id = $2, pickup_at = $3 WHERE request_id = $1`,
    [b.requestId, flightId, pickupAt]);
  await db.query(`UPDATE vehicle_busy_times SET start_at = $2, end_at = $3 WHERE booking_number = $1`,
    [b.bookingNumber, pickupAt, busyUntil]);
}

export async function findBookingNumberByOffer(offerId, db = { query }) {
  const { rows } = await db.query(`SELECT booking_number FROM bookings WHERE offer_id = $1`, [offerId]);
  return rows[0]?.booking_number ?? null;
}

// Returns false when the number is already taken (caller retries with a new one).
export async function insertBooking(b, db) {
  const { rowCount } = await db.query(
    `INSERT INTO bookings (booking_number, request_id, offer_id, company_id, vehicle_id, flight_id, pickup_at,
                           price_inr, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CONFIRMED')
     ON CONFLICT (booking_number) DO NOTHING`,
    [b.bookingNumber, b.requestId, b.offerId, b.companyId, b.vehicleId, b.flightId, b.pickupAt, b.priceInr],
  );
  return rowCount === 1;
}

export async function insertBookingBusyTime({ vehicleId, startAt, endAt, bookingNumber }, db) {
  await db.query(
    `INSERT INTO vehicle_busy_times (vehicle_id, start_at, end_at, source, booking_number)
     VALUES ($1, $2, $3, 'BOOKING', $4)`,
    [vehicleId, startAt, endAt, bookingNumber],
  );
}

// Offer -> BOOKED, the request's other OFFERED offers -> NOT_CHOSEN, request -> BOOKED.
export async function markBooked(offerId, requestId, db) {
  await db.query(
    `UPDATE offers SET status = 'BOOKED', decided_at = (now() AT TIME ZONE 'UTC') WHERE offer_id = $1`, [offerId]);
  await db.query(
    `UPDATE offers SET status = 'NOT_CHOSEN', decided_at = (now() AT TIME ZONE 'UTC')
      WHERE request_id = $1 AND offer_id <> $2 AND status = 'OFFERED'`,
    [requestId, offerId],
  );
  await db.query(`UPDATE ride_requests SET status = 'BOOKED' WHERE request_id = $1`, [requestId]);
}
