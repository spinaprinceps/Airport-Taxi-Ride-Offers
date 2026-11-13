// Request rules (R1-R3). Pure, no database.
import { ARRIVAL_AIRPORTS, MIN_PICKUP_GAP_MIN } from '../config.js';
import { v } from '../errors.js';
import { addMinutes, parse, pretty } from '../time.js';

export const inr = (n) => `₹${n.toLocaleString('en-IN')}`;

// R1: the arrival airport serves the hotel's city.
// airport = { code, servesCities: [...] }, hotel = { city }
export function checkAirportServesCity(airport, hotel) {
  if (!airport.servesCities.length) {
    return v('R1', 'flightId',
      `${airport.code} is not an arrival airport for this service (${ARRIVAL_AIRPORTS.join(', ')}).`);
  }
  if (airport.servesCities.includes(hotel.city)) return null;
  return v('R1', 'hotelId',
    `${airport.code} does not serve ${hotel.city}. It serves: ${airport.servesCities.join(', ')}.`);
}

export const earliestPickup = (flight) => addMinutes(flight.arrival_at, MIN_PICKUP_GAP_MIN);

// R2: pickup >= landing + MIN_PICKUP_GAP_MIN. Returns a violation or null.
export function checkPickup(flight, pickupAt, field = 'pickupAt') {
  const earliest = earliestPickup(flight);
  if (parse(pickupAt) >= parse(earliest)) return null;
  return v('R2', field,
    `Pickup ${pretty(pickupAt)} is too early: the flight lands ${pretty(flight.arrival_at)}, ` +
    `so the earliest pickup is ${pretty(earliest)}.`);
}

// R3: min <= price <= max, both ends allowed. Returns a violation or null.
export function checkPrice(route, priceInr, field = 'priceInr') {
  const range = `range ${inr(route.price_min_inr)} – ${inr(route.price_max_inr)}`;
  if (priceInr < route.price_min_inr) {
    return v('R3', field, `Price ${inr(priceInr)} is below the minimum ${inr(route.price_min_inr)} (${range}).`);
  }
  if (priceInr > route.price_max_inr) {
    return v('R3', field, `Price ${inr(priceInr)} is above the maximum ${inr(route.price_max_inr)} (${range}).`);
  }
  return null;
}

// All R1-R3 violations of a request, in rule order. flight/hotel/airport/route may be null.
// input: { flightId, hotelId, adults, childAges, largeBags, smallBags, pickupAt|null, priceInr }
export function validateRequest(input, flight, hotel, airport, route) {
  const out = [];
  const push = (x) => x && out.push(x);

  // R1: flight and hotel exist, airport serves the city, a route exists
  if (!flight) push(v('R1', 'flightId', `Flight ${input.flightId} does not exist.`));
  if (!hotel) push(v('R1', 'hotelId', `Hotel ${input.hotelId} does not exist.`));
  if (flight && hotel && airport) {
    const served = checkAirportServesCity(airport, hotel);
    push(served);
    if (!served && !route) push(v('R1', 'hotelId', `No route from ${airport.code} to ${hotel.city} / ${hotel.area}.`));
  }
  // R1: party and bags
  if (input.adults < 1) push(v('R1', 'adults', `At least 1 adult is required (got ${input.adults}).`));
  const badAges = input.childAges.filter((a) => a < 0 || a > 17);
  if (badAges.length) push(v('R1', 'childAges', `Each child age must be 0–17 (got ${badAges.join(', ')}).`));
  if (input.largeBags < 0) push(v('R1', 'largeBags', `Large bags cannot be negative (got ${input.largeBags}).`));
  if (input.smallBags < 0) push(v('R1', 'smallBags', `Small bags cannot be negative (got ${input.smallBags}).`));

  // R2
  if (flight && input.pickupAt) push(checkPickup(flight, input.pickupAt));

  // R3
  if (route) push(checkPrice(route, input.priceInr));

  return out;
}
