// Catalog feature: suppliers (S0); flights, hotels, price range (S1).
import * as repo from '../repos/catalog.js';
import { ARRIVAL_AIRPORTS, MIN_PICKUP_GAP_MIN } from '../config.js';
import { checkAirportServesCity } from '../rules/requestRules.js';
import { addMinutes } from '../time.js';
import { notFound, ruleViolation, validation, v } from '../errors.js';

export async function listSuppliers() {
  const rows = await repo.listCompanies();
  return rows.map((c) => ({
    companyId: c.company_id,
    name: c.name,
    airports: c.airports,
    serviceFrom: c.service_from,
    serviceUntil: c.service_until,
    rating: c.rating,
  }));
}

export async function listFlights() {
  const rows = await repo.listArrivalFlights(ARRIVAL_AIRPORTS);
  return rows.map((f) => ({
    flightId: f.flight_id,
    airline: f.airline,
    flightNumber: f.flight_number,
    from: f.from_airport,
    to: f.to_airport,
    arrivalLocal: f.arrival_local,
  }));
}

export async function listHotels() {
  const rows = await repo.listHotels();
  return rows.map((h) => ({ hotelId: h.hotel_id, name: h.name, city: h.city, area: h.area }));
}

// Looks up flight, hotel, airport and route for a trip.
// Returns { flight, hotel, airport, route, violation } where violation is an R1 violation or null.
// flight / hotel are null when the id is unknown (callers decide 404 vs R1).
export async function resolveTrip(flightId, hotelId, db) {
  const [flight, hotel] = await Promise.all([repo.getFlight(flightId, db), repo.getHotel(hotelId, db)]);
  if (!flight || !hotel) return { flight, hotel, airport: null, route: null, violation: null };

  const airport = await repo.getAirport(flight.to_airport, db);
  const violation = checkAirportServesCity(airport, hotel);
  if (violation) return { flight, hotel, airport, route: null, violation };

  const route = await repo.getRoute(airport.code, hotel.city, hotel.area, db);
  if (!route) {
    return {
      flight, hotel, airport, route: null,
      violation: v('R1', 'hotelId', `No route from ${airport.code} to ${hotel.city} / ${hotel.area}.`),
    };
  }
  return { flight, hotel, airport, route, violation: null };
}

export async function priceRange(flightId, hotelId) {
  const missing = [];
  if (!flightId) missing.push({ rule: null, field: 'flightId', message: 'flightId is required.' });
  if (!hotelId) missing.push({ rule: null, field: 'hotelId', message: 'hotelId is required.' });
  if (missing.length) throw validation('flightId and hotelId are required.', missing);

  const { flight, hotel, route, violation } = await resolveTrip(flightId, hotelId);
  if (!flight) throw notFound(`Flight ${flightId} not found.`);
  if (!hotel) throw notFound(`Hotel ${hotelId} not found.`);
  if (violation) throw ruleViolation([violation]);

  return {
    airport: route.airport,
    city: route.city,
    area: route.area,
    distanceKm: route.distance_km,
    driveMinutes: route.drive_minutes,
    priceMinInr: route.price_min_inr,
    priceMaxInr: route.price_max_inr,
    landingAt: flight.arrival_local,
    earliestPickupAt: addMinutes(flight.arrival_local, MIN_PICKUP_GAP_MIN),
  };
}
