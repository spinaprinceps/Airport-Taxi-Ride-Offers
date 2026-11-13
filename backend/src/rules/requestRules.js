// Request rules (R1-R3). Pure, no database.
import { ARRIVAL_AIRPORTS } from '../config.js';
import { v } from '../errors.js';

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
