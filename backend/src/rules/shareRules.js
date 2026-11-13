// Shared rides: when can two requests share one car, and what is the combined party. Pure, no database.
// a, b: API request objects (services/requests.js toRequestObject).
import { BUSY_DRIVE_FACTOR, SHARE_PICKUP_WINDOW_MIN } from '../config.js';
import { addMinutes, parse } from '../time.js';

const minutesApart = (x, y) => Math.abs(parse(x) - parse(y)) / 60000;

// Why these two requests cannot share, or null if they can.
export function pairProblem(a, b) {
  if (a.requestId === b.requestId) return 'A request cannot share with itself.';
  if (!a.shareOk || !b.shareOk) return 'Both travelers must agree to share.';
  if (a.status !== 'OPEN' || b.status !== 'OPEN') return 'Both requests must be open.';
  if (a.flight.flightId !== b.flight.flightId) return 'Both requests must be on the same flight.';
  if (a.hotel.city !== b.hotel.city || a.hotel.area !== b.hotel.area) return 'Both requests must go to the same area.';
  if (minutesApart(a.pickupAt, b.pickupAt) > SHARE_PICKUP_WINDOW_MIN) {
    return `The pickups are more than ${SHARE_PICKUP_WINDOW_MIN} min apart.`;
  }
  if (a.carType && b.carType && a.carType !== b.carType) return `One asked for a ${a.carType}, the other for a ${b.carType}.`;
  return null;
}

// The later of the two pickups (R2 still holds for both).
export const sharedPickup = (a, b) => (parse(a.pickupAt) >= parse(b.pickupAt) ? a.pickupAt : b.pickupAt);

// A request-like object for the two parties together, so the existing R4–R6 checks run on it unchanged.
// Different hotels in the same area are treated as one trip (no extra stop time).
export function combinedRequest(a, b) {
  const pickupAt = sharedPickup(a, b);
  return {
    ...a,
    requestId: `${a.requestId}+${b.requestId}`,
    pickupAt,
    busyUntil: addMinutes(pickupAt, BUSY_DRIVE_FACTOR * a.driveMinutes),
    adults: a.adults + b.adults,
    childAges: [...a.childAges, ...b.childAges],
    passengers: a.passengers + b.passengers,
    largeBags: a.largeBags + b.largeBags,
    smallBags: a.smallBags + b.smallBags,
    carType: a.carType ?? b.carType ?? null,
  };
}
