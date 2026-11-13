// SQL only. Ride groups: two requests that share one car.
import { query } from '../db.js';

const toGroup = (r) => ({
  groupId: Number(r.group_id),
  flightId: r.flight_id,
  airport: r.airport,
  city: r.city,
  area: r.area,
  pickupAt: r.pickup_at,
});

// Creates a group with its two members. A member already in another group -> 23505 (caller maps it to 409).
export async function createGroup({ flightId, airport, city, area, pickupAt }, requestIds, db) {
  const { rows } = await db.query(
    `INSERT INTO ride_groups (flight_id, airport, city, area, pickup_at) VALUES ($1, $2, $3, $4, $5)
     RETURNING group_id, flight_id, airport, city, area, pickup_at`,
    [flightId, airport, city, area, pickupAt],
  );
  const group = toGroup(rows[0]);
  for (const requestId of requestIds) {
    await db.query(`INSERT INTO ride_group_members (group_id, request_id) VALUES ($1, $2)`, [group.groupId, requestId]);
  }
  return group;
}

// Locks the group row (FOR UPDATE): the two families' bookings of one group run one after the other.
export async function lockGroup(groupId, db) {
  const { rows } = await db.query(
    `SELECT group_id, flight_id, airport, city, area, pickup_at FROM ride_groups WHERE group_id = $1 FOR UPDATE`,
    [groupId],
  );
  return rows[0] ? toGroup(rows[0]) : null;
}

// The group's one busy row, or null if nobody has booked yet.
export async function getGroupBusyTime(groupId, db = { query }) {
  const { rows } = await db.query(
    `SELECT busy_id, vehicle_id, start_at, end_at, booking_number FROM vehicle_busy_times WHERE group_id = $1`,
    [groupId],
  );
  const r = rows[0];
  return r ? { busyId: r.busy_id, vehicleId: r.vehicle_id, startAt: r.start_at, endAt: r.end_at, bookingNumber: r.booking_number } : null;
}

// After a shared booking on `vehicleId`: the group's still-OFFERED offers on other cars -> NOT_CHOSEN.
export async function dropOtherGroupOffers(groupId, vehicleId, db) {
  await db.query(
    `UPDATE offers SET status = 'NOT_CHOSEN', decided_at = (now() AT TIME ZONE 'UTC')
      WHERE group_id = $1 AND vehicle_id <> $2 AND status = 'OFFERED'`,
    [groupId, vehicleId],
  );
}

// How many bookings a group has (0, 1 or 2).
export async function countGroupBookings(groupId, db = { query }) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM bookings b JOIN offers o ON o.offer_id = b.offer_id WHERE o.group_id = $1`,
    [groupId],
  );
  return rows[0].n;
}
