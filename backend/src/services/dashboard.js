// Supplier dashboard (S3): open requests a supplier can serve, and per-car verdicts.
import { forbidden, notFound } from '../errors.js';
import { evaluateSupplier, r4Violations } from '../rules/eligibility.js';
import { getCompany, listBusyTimes } from '../repos/companies.js';
import { getRequest, listRequests } from '../repos/requests.js';
import { listCompanyOffers } from '../repos/offers.js';
import { toRequestObject } from './requests.js';

const carInfo = ({ vehicleId, type, seats, largeBags, smallBags }) => ({ vehicleId, type, seats, largeBags, smallBags });

export async function requireCompany(companyId) {
  const company = await getCompany(companyId);
  if (!company) throw notFound(`Supplier ${companyId} not found.`);
  return company;
}

// Only OPEN requests this supplier can serve: R4 passes and at least one car passes R5 and R6.
export async function listForSupplier(companyId) {
  const company = await requireCompany(companyId);
  const [rows, busyTimes] = await Promise.all([
    listRequests({ status: 'OPEN' }),
    listBusyTimes(company.vehicles.map((x) => x.vehicleId)),
  ]);

  const visible = [];
  for (const row of rows) {
    const request = toRequestObject(row);
    if (r4Violations(request, company).length) continue;
    const { vehicles } = evaluateSupplier(request, company, company.vehicles, busyTimes);
    const okIds = new Set(vehicles.filter((x) => x.ok).map((x) => x.vehicleId));
    if (!okIds.size) continue;
    visible.push({
      request,
      fittingFreeVehicles: company.vehicles.filter((x) => okIds.has(x.vehicleId)).map(carInfo),
    });
  }
  visible.sort((a, b) =>
    a.request.pickupAt.localeCompare(b.request.pickupAt) || a.request.requestId.localeCompare(b.request.requestId));

  const offers = await listCompanyOffers(companyId, visible.map((x) => x.request.requestId));
  return visible.map((x) => ({ ...x, myOffers: offers.filter((o) => o.requestId === x.request.requestId) }));
}

// One request with a verdict per car. 403 R4 if this supplier cannot serve it (details are not shown).
export async function detailForSupplier(companyId, requestId) {
  const company = await requireCompany(companyId);
  const row = await getRequest(requestId);
  if (!row) throw notFound(`Request ${requestId} not found.`);

  const request = toRequestObject(row);
  const r4 = r4Violations(request, company);
  if (r4.length) throw forbidden(`${company.name} cannot serve request ${requestId}.`, r4);

  const busyTimes = await listBusyTimes(company.vehicles.map((x) => x.vehicleId));
  const { vehicles } = evaluateSupplier(request, company, company.vehicles, busyTimes);
  const verdicts = new Map(vehicles.map((x) => [x.vehicleId, x]));

  return {
    request,
    vehicles: company.vehicles.map((car) => ({
      ...carInfo(car),
      ok: verdicts.get(car.vehicleId).ok,
      violations: verdicts.get(car.vehicleId).violations,
    })),
    myOffers: await listCompanyOffers(companyId, [requestId]),
  };
}
