// Who can serve a request (R4, R5, R6). Pure, no database.
//
// request: the API request object — uses flight.to, hotel.city, hotel.area, pickupAt, busyUntil,
//          passengers, largeBags, smallBags, carType
// company: { companyId, name, airports[], areas[{city, area}], serviceFrom, serviceUntil, vehicles[] }
// vehicle: { vehicleId, type, seats, largeBags, smallBags }
// busyTimes: [{ vehicleId, startAt, endAt }]  (seed rides + bookings)
import { v } from '../errors.js';
import { isOpenAt } from './hours.js';
import { overlaps } from './intervals.js';
import { hhmm, pretty } from '../time.js';

const busyWindow = (start, end) =>
  start.slice(0, 10) === end.slice(0, 10) ? `${pretty(start)} – ${hhmm(end)}` : `${pretty(start)} – ${pretty(end)}`;

// The first busy time of this car that overlaps [start, end), or null.
export function findClash(vehicleId, start, end, busyTimes) {
  return busyTimes.find((b) => b.vehicleId === vehicleId && overlaps(start, end, b.startAt, b.endAt)) ?? null;
}

// R6 violation for a clash, e.g. "SC-2 is busy 10 Apr 11:00 – 14:00."
export function busyViolation(vehicleId, clash) {
  return v('R6', 'vehicleId', `${vehicleId} is busy ${busyWindow(clash.startAt, clash.endAt)}.`);
}

export function checkFit(request, vehicle) {
  const out = [];
  if (vehicle.seats < request.passengers) {
    out.push(v('R5', 'passengers', `Needs ${request.passengers} seats, ${vehicle.vehicleId} has ${vehicle.seats}.`));
  }
  if (vehicle.largeBags < request.largeBags) {
    out.push(v('R5', 'largeBags', `Needs ${request.largeBags} large-bag spaces, ${vehicle.vehicleId} has ${vehicle.largeBags}.`));
  }
  if (vehicle.smallBags < request.smallBags) {
    out.push(v('R5', 'smallBags', `Needs ${request.smallBags} small-bag spaces, ${vehicle.vehicleId} has ${vehicle.smallBags}.`));
  }
  if (request.carType && vehicle.type !== request.carType) {
    out.push(v('R5', 'carType', `Traveler asked for ${request.carType}, ${vehicle.vehicleId} is a ${vehicle.type}.`));
  }
  return out;
}

// R5 + R6 for one car. Returns the list of violations (empty = ok).
export function checkVehicle(request, vehicle, busyTimes) {
  const out = checkFit(request, vehicle);
  const clash = findClash(vehicle.vehicleId, request.pickupAt, request.busyUntil, busyTimes);
  if (clash) out.push(busyViolation(vehicle.vehicleId, clash));
  return out;
}

export function worksAtAirport(request, company) {
  return company.airports.includes(request.flight.to);
}
export function drivesToArea(request, company) {
  return company.areas.some((a) => a.city === request.hotel.city && a.area === request.hotel.area);
}
export function openAtPickup(request, company) {
  return isOpenAt(company.serviceFrom, company.serviceUntil, hhmm(request.pickupAt));
}

export function evaluateSupplier(request, company, vehicles, busyTimes) {
  return {
    worksAtAirport: worksAtAirport(request, company),
    drivesToArea: drivesToArea(request, company),
    openAtPickup: openAtPickup(request, company),
    vehicles: vehicles.map((vehicle) => {
      const violations = checkVehicle(request, vehicle, busyTimes);
      return { vehicleId: vehicle.vehicleId, ok: violations.length === 0, violations };
    }),
  };
}

// Can this company serve the request (R4 + at least one car passing R5 and R6)?
export function canServe(request, company, busyTimes) {
  const e = evaluateSupplier(request, company, company.vehicles, busyTimes);
  return e.worksAtAirport && e.drivesToArea && e.openAtPickup && e.vehicles.some((x) => x.ok);
}

const suppliers = (n) => (n === 1 ? '1 supplier' : `${n} suppliers`);
const verb = (n, one, many) => (n === 1 ? one : many);

// { supplierCount, reason }: reason names the first stage where the count drops to zero.
export function summarize(request, companies, busyTimes) {
  const atAirport = companies.filter((c) => worksAtAirport(request, c));
  const inArea = atAirport.filter((c) => drivesToArea(request, c));
  const open = inArea.filter((c) => openAtPickup(request, c));
  const fits = open.filter((c) => c.vehicles.some((x) => checkFit(request, x).length === 0));
  const free = fits.filter((c) =>
    c.vehicles.some((x) => checkFit(request, x).length === 0 && !findClash(x.vehicleId, request.pickupAt, request.busyUntil, busyTimes)));

  const { to } = request.flight;
  const place = `${request.hotel.city} / ${request.hotel.area}`;
  const time = hhmm(request.pickupAt);
  let reason = null;

  if (!atAirport.length) {
    reason = `No supplier works at ${to} (R4).`;
  } else if (!inArea.length) {
    reason = `${suppliers(atAirport.length)} ${verb(atAirport.length, 'works', 'work')} at ${to}, but none drives to ${place} (R4).`;
  } else if (!open.length) {
    reason = `${suppliers(inArea.length)} ${verb(inArea.length, 'drives', 'drive')} ${to} → ${place}, but none is open at ${time} (R4).`;
  } else if (!fits.length) {
    const car = request.carType ?? 'car';
    reason = `${suppliers(open.length)} ${verb(open.length, 'drives', 'drive')} ${to} → ${place} and ` +
      `${verb(open.length, 'is', 'are')} open at ${time}, but none has a ${car} with ${request.passengers} seats, ` +
      `${request.largeBags} large and ${request.smallBags} small bags (R5).`;
  } else if (!free.length) {
    reason = `${suppliers(fits.length)} ${verb(fits.length, 'has', 'have')} a car that fits, but every such car is busy ` +
      `between ${busyWindow(request.pickupAt, request.busyUntil).replace(' – ', ' and ')} (R6).`;
  }
  return { supplierCount: free.length, reason };
}
