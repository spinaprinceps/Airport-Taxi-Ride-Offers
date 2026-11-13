// Invites (S11): the traveler sees which suppliers can serve a request and can ask one of them;
// a supplier can decline a request. Who sees a request is still decided by R4 only (services/dashboard.js).
import { z } from 'zod';
import { conflict, forbidden, notFound, ruleViolation } from '../errors.js';
import { evaluateSupplier, r4Violations } from '../rules/eligibility.js';
import { loadCompanies, listBusyTimes } from '../repos/companies.js';
import { getRequest } from '../repos/requests.js';
import { listCompanyOffers } from '../repos/offers.js';
import * as repo from '../repos/invites.js';
import { requireCompany } from './dashboard.js';
import { toRequestObject } from './requests.js';

const carInfo = ({ vehicleId, type, seats, largeBags, smallBags }) => ({ vehicleId, type, seats, largeBags, smallBags });

// What the API shows of an invite next to a request or a supplier.
export const inviteView = (invite) => (invite ? { status: invite.status, reason: invite.reason } : null);

async function requireRequest(requestId) {
  const row = await getRequest(requestId);
  if (!row) throw notFound(`Request ${requestId} not found.`);
  return toRequestObject(row);
}

// The suppliers that can serve an OPEN request (R4 and at least one car passing R5 and R6), in file order,
// each with its cars that fit and are free. A booked request is no longer looking for a supplier: [].
export async function listRequestSuppliers(requestId) {
  const request = await requireRequest(requestId);
  if (request.status !== 'OPEN') return [];

  const [companies, busyTimes, invites] = await Promise.all([
    loadCompanies(), listBusyTimes(), repo.listInvitesForRequest(requestId),
  ]);
  const inviteOf = new Map(invites.map((i) => [i.companyId, i]));

  const out = [];
  for (const company of companies) {
    if (r4Violations(request, company).length) continue;
    const { vehicles } = evaluateSupplier(request, company, company.vehicles, busyTimes);
    const okIds = new Set(vehicles.filter((x) => x.ok).map((x) => x.vehicleId));
    if (!okIds.size) continue;
    out.push({
      companyId: company.companyId,
      name: company.name,
      rating: company.rating,
      serviceFrom: company.serviceFrom,
      serviceUntil: company.serviceUntil,
      vehicles: company.vehicles.filter((x) => okIds.has(x.vehicleId)).map(carInfo),
      invite: inviteView(inviteOf.get(company.companyId)),
    });
  }
  return out;
}

// The traveler asks one supplier. Returns { status: 201 | 200, body: invite }.
// Check order: request 404 -> supplier 404 -> not OPEN 409 -> R4 422 -> no car fits and is free 422 (R5/R6)
// -> declined 409.
export async function askSupplier(requestId, companyId) {
  const request = await requireRequest(requestId);
  const company = await requireCompany(companyId);
  if (request.status !== 'OPEN') throw conflict(`Request ${requestId} is not open (${request.status}).`);

  const r4 = r4Violations(request, company);
  if (r4.length) throw ruleViolation(r4);
  const busyTimes = await listBusyTimes(company.vehicles.map((x) => x.vehicleId));
  const { vehicles } = evaluateSupplier(request, company, company.vehicles, busyTimes);
  if (!vehicles.some((x) => x.ok)) throw ruleViolation(vehicles.flatMap((x) => x.violations));

  const created = await repo.insertRequested(requestId, companyId);
  if (created) return { status: 201, body: created };
  const existing = await repo.getInvite(requestId, companyId);
  if (existing.status === 'DECLINED') throw conflict(`${company.name} declined this request.`);
  return { status: 200, body: existing };
}

const declineBody = z.object({ reason: z.string().trim().max(500).nullable().optional() }).optional();

// The supplier declines a request (asked for or not), with an optional reason.
// Check order: body 400 -> supplier 404 -> request 404 -> R4 403 -> not OPEN 409 -> already assigned a car 409.
export async function declineRequest(companyId, requestId, rawBody) {
  const body = declineBody.parse(rawBody ?? {}) ?? {};
  const company = await requireCompany(companyId);
  const request = await requireRequest(requestId);

  const r4 = r4Violations(request, company);
  if (r4.length) throw forbidden(`${company.name} cannot serve request ${requestId}.`, r4);
  if (request.status !== 'OPEN') throw conflict(`Request ${requestId} is not open (${request.status}).`);
  const offers = await listCompanyOffers(companyId, [requestId]);
  if (offers.some((o) => o.status === 'OFFERED')) {
    throw conflict(`${company.name} has already assigned a car to ${requestId}.`);
  }
  return repo.saveDeclined(requestId, companyId, body.reason || null);
}
