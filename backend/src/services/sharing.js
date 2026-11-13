// Shared rides: shareable pairs on the supplier dashboard, and the shared offer (one car, a price per family).
// Pairs are worked out live from open requests; a group is stored only when the first shared offer is made.
import { z } from 'zod';
import { withTransaction } from '../db.js';
import { conflict, forbidden, notFound, ruleViolation, v, validation } from '../errors.js';
import { checkVehicle, r4Violations } from '../rules/eligibility.js';
import { checkOwnership } from '../rules/offerRules.js';
import { checkPrice } from '../rules/requestRules.js';
import { combinedRequest, pairProblem } from '../rules/shareRules.js';
import { getVehicle, listBusyTimes } from '../repos/companies.js';
import { getRequest, listRequests, lockRequest } from '../repos/requests.js';
import * as offersRepo from '../repos/offers.js';
import * as groups from '../repos/groups.js';
import { requireCompany } from './dashboard.js';
import { toRequestObject } from './requests.js';

const carInfo = ({ vehicleId, type, seats, largeBags, smallBags }) => ({ vehicleId, type, seats, largeBags, smallBags });

const partyOf = (c) => ({
  passengers: c.passengers, adults: c.adults, children: c.childAges.length,
  largeBags: c.largeBags, smallBags: c.smallBags, carType: c.carType, pickupAt: c.pickupAt, busyUntil: c.busyUntil,
});

// Two requests may form a pair unless one is already grouped with someone else.
const groupsAgree = (a, b) => a.groupId === b.groupId;

// GET /api/suppliers/:companyId/shareable-pairs — open pairs this supplier can serve with one car.
export async function listShareablePairs(companyId) {
  const company = await requireCompany(companyId);
  const [rows, busyTimes] = await Promise.all([
    listRequests({ status: 'OPEN' }),
    listBusyTimes(company.vehicles.map((x) => x.vehicleId)),
  ]);
  const sharing = rows.map(toRequestObject).filter((r) => r.shareOk);

  // Same flight and same area first (cheap bucketing), then every pair inside a bucket.
  const buckets = new Map();
  for (const r of sharing) {
    const key = `${r.flight.flightId}|${r.hotel.city}|${r.hotel.area}`;
    buckets.set(key, [...(buckets.get(key) ?? []), r]);
  }

  const pairs = [];
  for (const list of buckets.values()) {
    list.sort((x, y) => x.requestId.localeCompare(y.requestId));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]];
        if (pairProblem(a, b) || !groupsAgree(a, b)) continue;
        const combined = combinedRequest(a, b);
        if (r4Violations(combined, company).length) continue;
        const cars = company.vehicles.filter((car) => checkVehicle(combined, car, busyTimes).length === 0);
        if (!cars.length) continue;
        pairs.push({ requests: [a, b], combined: partyOf(combined), fittingFreeVehicles: cars.map(carInfo), groupId: a.groupId });
      }
    }
  }
  pairs.sort((x, y) => x.combined.pickupAt.localeCompare(y.combined.pickupAt));

  const ids = pairs.flatMap((p) => p.requests.map((r) => r.requestId));
  const mine = (await offersRepo.listCompanyOffers(companyId, ids)).filter((o) => o.groupId !== null);
  return pairs.map((p) => ({
    ...p,
    myOffers: mine.filter((o) => p.groupId !== null && o.groupId === p.groupId),
  }));
}

const sharedBody = z.object({
  requestIds: z.array(z.string().trim().min(1).max(50)).length(2),
  vehicleId: z.string().trim().min(1).max(50),
  prices: z.record(z.number().int().min(-2147483648).max(2147483647)),
});

// POST /api/suppliers/:companyId/shared-offers — one car for the pair, one offer row per family.
// R3 on each price; R4, R5 and R6 on the combined party at the shared pickup.
export async function createSharedOffer(companyId, rawBody) {
  const input = sharedBody.parse(rawBody ?? {});
  const ids = [...input.requestIds].sort();
  if (ids[0] === ids[1]) throw validation('Choose two different requests.');
  for (const id of ids) {
    if (input.prices[id] === undefined) {
      throw validation(`Set a price for ${id}.`, [{ rule: null, field: `prices.${id}`, message: 'Price is required.' }]);
    }
  }
  const company = await requireCompany(companyId);

  return withTransaction(async (db) => {
    // Both requests, in id order (a booking of either waits for this offer, and vice versa).
    for (const id of ids) {
      if (!(await lockRequest(id, 'SHARE', db))) throw notFound(`Request ${id} not found.`);
    }
    const [a, b] = await Promise.all(ids.map(async (id) => toRequestObject(await getRequest(id, db))));

    const vehicle = await getVehicle(input.vehicleId, db);
    if (!vehicle) throw notFound(`Car ${input.vehicleId} not found.`);
    const r7 = checkOwnership(company, vehicle, vehicle.companyName);
    if (r7) throw forbidden(r7.message, [r7]);

    const problem = pairProblem(a, b);
    if (problem) {
      if (a.status !== 'OPEN' || b.status !== 'OPEN') throw conflict(problem);
      throw ruleViolation([v('R10', 'requestIds', problem)]);
    }
    if (!groupsAgree(a, b)) throw conflict('One of these requests already shares a ride with another traveler.');

    // R3 per family, then R4–R6 on the combined party.
    const combined = combinedRequest(a, b);
    const violations = [];
    for (const r of [a, b]) {
      const price = checkPrice({ price_min_inr: r.priceMinInr, price_max_inr: r.priceMaxInr }, input.prices[r.requestId],
        `prices.${r.requestId}`);
      if (price) violations.push(price);
    }
    violations.push(...r4Violations(combined, company));
    violations.push(...checkVehicle(combined, vehicle, await listBusyTimes([vehicle.vehicleId], db)));
    if (violations.length) throw ruleViolation(violations);

    for (const r of [a, b]) {
      if (await offersRepo.offerExists(r.requestId, vehicle.vehicleId, db)) {
        throw conflict(`${vehicle.vehicleId} is already offered on ${r.requestId}.`);
      }
    }

    // The group: reuse it, or create it now (a parallel pairing of the same request loses on the unique key).
    let groupId = a.groupId;
    if (groupId === null) {
      await db.query('SAVEPOINT grp');
      try {
        const group = await groups.createGroup({
          flightId: a.flight.flightId, airport: a.flight.to, city: a.hotel.city, area: a.hotel.area,
          pickupAt: combined.pickupAt,
        }, ids, db);
        groupId = group.groupId;
      } catch (err) {
        if (err.code !== '23505') throw err;
        await db.query('ROLLBACK TO SAVEPOINT grp');
        throw conflict('One of these requests already shares a ride with another traveler.');
      }
    }

    const offers = [];
    for (const r of [a, b]) {
      offers.push(await offersRepo.insertOffer({
        requestId: r.requestId, companyId, vehicleId: vehicle.vehicleId, priceInr: input.prices[r.requestId], groupId,
      }, db));
    }
    return { groupId, pickupAt: combined.pickupAt, busyUntil: combined.busyUntil, offers };
  });
}
