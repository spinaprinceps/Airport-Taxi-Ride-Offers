// SQL only.
import { query } from '../db.js';

export async function listCompanies() {
  const { rows } = await query(
    `SELECT c.company_id, c.name, c.service_from, c.service_until, c.rating,
            COALESCE(
              (SELECT array_agg(ca.airport_code ORDER BY ca.sort_order)
                 FROM company_airports ca WHERE ca.company_id = c.company_id),
              '{}') AS airports
       FROM companies c
      ORDER BY c.sort_order`,
  );
  return rows;
}

export async function listArrivalFlights(airports) {
  const { rows } = await query(
    `SELECT flight_id, airline, flight_number, from_airport, to_airport, arrival_local
       FROM flights
      WHERE to_airport = ANY($1)
      ORDER BY arrival_local, flight_id`,
    [airports],
  );
  return rows;
}

export async function listHotels() {
  const { rows } = await query(
    `SELECT hotel_id, name, city, area FROM hotels ORDER BY city, area, name`,
  );
  return rows;
}

export async function getFlight(flightId, db = { query }) {
  const { rows } = await db.query(
    `SELECT flight_id, airline, flight_number, from_airport, to_airport, arrival_local
       FROM flights WHERE flight_id = $1`,
    [flightId],
  );
  return rows[0] ?? null;
}

export async function getHotel(hotelId, db = { query }) {
  const { rows } = await db.query(
    `SELECT hotel_id, name, city, area FROM hotels WHERE hotel_id = $1`,
    [hotelId],
  );
  return rows[0] ?? null;
}

// { code, servesCities: [...] }
export async function getAirport(code, db = { query }) {
  const { rows } = await db.query(
    `SELECT a.code,
            COALESCE((SELECT array_agg(city ORDER BY city) FROM airport_cities WHERE airport_code = a.code), '{}')
              AS serves_cities
       FROM airports a WHERE a.code = $1`,
    [code],
  );
  return rows[0] ? { code: rows[0].code, servesCities: rows[0].serves_cities } : null;
}

export async function getRoute(airport, city, area, db = { query }) {
  const { rows } = await db.query(
    `SELECT airport, city, area, distance_km, drive_minutes, price_min_inr, price_max_inr
       FROM routes WHERE airport = $1 AND city = $2 AND area = $3`,
    [airport, city, area],
  );
  return rows[0] ?? null;
}
