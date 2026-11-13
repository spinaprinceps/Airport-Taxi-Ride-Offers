// Change request rules (R1, R2, R9). Pure, no database.
import { v } from '../errors.js';
import { checkPickup, earliestPickup } from './requestRules.js';

// booking: { airport, flightId, pickupAt }
// flight:  the new flight row when input.newFlightId is set, else the booking's current flight row; null = unknown
// input:   { newFlightId?, newPickupAt? } (at least one set)
// Returns { flightId, pickupAt, violations }.
export function resolveChange(booking, flight, input) {
  const flightId = input.newFlightId ?? booking.flightId;
  // 1. The flight exists
  if (!flight) {
    return { flightId, pickupAt: null, violations: [v('R1', 'newFlightId', `Flight ${flightId} does not exist.`)] };
  }
  // 2. Same arrival airport
  if (flight.to_airport !== booking.airport) {
    return {
      flightId, pickupAt: null,
      violations: [v('R9', 'newFlightId', `A change must keep the same arrival airport (${booking.airport}).`)],
    };
  }
  // 3. Pickup: given, or landing + MIN_PICKUP_GAP_MIN
  const pickupAt = input.newPickupAt ? input.newPickupAt.slice(0, 16) : earliestPickup(flight);
  // 4. R2
  const r2 = checkPickup(flight, pickupAt, 'newPickupAt');
  if (r2) return { flightId, pickupAt, violations: [r2] };
  // 5. Something must change
  if (flightId === booking.flightId && pickupAt === booking.pickupAt) {
    return { flightId, pickupAt, violations: [v('R9', 'newPickupAt', 'Nothing to change.')] };
  }
  return { flightId, pickupAt, violations: [] };
}
