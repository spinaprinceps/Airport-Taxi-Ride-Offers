// SQL only. Suppliers with their airports, areas and cars; busy times of cars.
import { query } from '../db.js';

const companySql = `
  SELECT c.company_id, c.name, c.service_from, c.service_until, c.rating,
         COALESCE((SELECT array_agg(airport_code ORDER BY sort_order) FROM company_airports
                    WHERE company_id = c.company_id), '{}') AS airports,
         COALESCE((SELECT json_agg(json_build_object('city', city, 'area', area) ORDER BY city, area)
                     FROM company_areas WHERE company_id = c.company_id), '[]') AS areas,
         COALESCE((SELECT json_agg(json_build_object('vehicleId', vehicle_id, 'type', type, 'seats', seats,
                                                     'largeBags', large_bags, 'smallBags', small_bags)
                                   ORDER BY sort_order)
                     FROM vehicles WHERE company_id = c.company_id), '[]') AS vehicles
    FROM companies c`;

const toCompany = (r) => ({
  companyId: r.company_id,
  name: r.name,
  rating: r.rating,
  airports: r.airports,
  areas: r.areas,
  serviceFrom: r.service_from,
  serviceUntil: r.service_until,
  vehicles: r.vehicles,
});

export async function loadCompanies(db = { query }) {
  const { rows } = await db.query(`${companySql} ORDER BY c.sort_order`);
  return rows.map(toCompany);
}

export async function getCompany(companyId, db = { query }) {
  const { rows } = await db.query(`${companySql} WHERE c.company_id = $1`, [companyId]);
  return rows[0] ? toCompany(rows[0]) : null;
}

// One car with its owner's name.
export async function getVehicle(vehicleId, db = { query }) {
  const { rows } = await db.query(
    `SELECT v.vehicle_id, v.company_id, v.type, v.seats, v.large_bags, v.small_bags, c.name AS company_name
       FROM vehicles v JOIN companies c ON c.company_id = v.company_id
      WHERE v.vehicle_id = $1`,
    [vehicleId],
  );
  const r = rows[0];
  return r ? {
    vehicleId: r.vehicle_id, companyId: r.company_id, companyName: r.company_name,
    type: r.type, seats: r.seats, largeBags: r.large_bags, smallBags: r.small_bags,
  } : null;
}

// All busy times (seed rides + bookings), optionally only for some cars.
export async function listBusyTimes(vehicleIds = null, db = { query }) {
  const { rows } = await db.query(
    `SELECT vehicle_id, start_at, end_at, source, ride_id, booking_number
       FROM vehicle_busy_times
      WHERE $1::text[] IS NULL OR vehicle_id = ANY($1)
      ORDER BY vehicle_id, start_at`,
    [vehicleIds],
  );
  return rows.map((r) => ({
    vehicleId: r.vehicle_id,
    startAt: r.start_at,
    endAt: r.end_at,
    source: r.source,
    rideId: r.ride_id,
    bookingNumber: r.booking_number,
  }));
}
