// SQL only.
import { query } from '../db.js';

// One row per request with everything the request object needs.
const selectSql = `
  SELECT r.request_id, r.status, r.traveler_name, r.flight_id, r.hotel_id, r.airport, r.city, r.area,
         r.drive_minutes, r.adults, r.child_ages, r.large_bags, r.small_bags, r.pickup_at, r.car_type,
         r.price_inr, r.created_at,
         f.flight_number, f.airline, f.arrival_at,
         h.name AS hotel_name,
         rt.price_min_inr, rt.price_max_inr,
         (SELECT count(*)::int FROM offers o WHERE o.request_id = r.request_id) AS offer_count,
         (SELECT b.booking_number FROM bookings b WHERE b.request_id = r.request_id) AS booking_number
    FROM ride_requests r
    JOIN flights f ON f.flight_id = r.flight_id
    JOIN hotels h ON h.hotel_id = r.hotel_id
    JOIN routes rt ON rt.airport = r.airport AND rt.city = r.city AND rt.area = r.area`;

export async function getRequest(requestId, db = { query }) {
  const { rows } = await db.query(`${selectSql} WHERE r.request_id = $1`, [requestId]);
  return rows[0] ?? null;
}

export async function findIdByIdempotencyKey(key, db = { query }) {
  const { rows } = await db.query(`SELECT request_id FROM ride_requests WHERE idempotency_key = $1`, [key]);
  return rows[0]?.request_id ?? null;
}

// Newest first. traveler = optional part of the name, case-insensitive.
export async function listRequests({ traveler = null, status = null } = {}, db = { query }) {
  const { rows } = await db.query(
    `${selectSql}
      WHERE ($1::text IS NULL OR r.traveler_name ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR r.status = $2)
      ORDER BY r.created_at DESC, r.request_id DESC`,
    [traveler, status],
  );
  return rows;
}

export async function insertRequest(row, db = { query }) {
  const { rows } = await db.query(
    `INSERT INTO ride_requests (request_id, source, idempotency_key, traveler_name, flight_id, hotel_id,
                                airport, city, area, drive_minutes, adults, child_ages, large_bags, small_bags,
                                pickup_at, car_type, price_inr, status)
     VALUES ('REQ-' || nextval('ride_request_seq'), 'APP', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $13, $14, $15, 'OPEN')
     RETURNING request_id`,
    [row.idempotencyKey, row.travelerName, row.flightId, row.hotelId, row.airport, row.city, row.area,
      row.driveMinutes, row.adults, row.childAges, row.largeBags, row.smallBags, row.pickupAt, row.carType,
      row.priceInr],
  );
  return rows[0].request_id;
}
