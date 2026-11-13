// Offer rules (R3-R7). Pure, no database.
import { v } from '../errors.js';
import { checkPrice } from './requestRules.js';
import { checkVehicle, r4Violations } from './eligibility.js';

// R7: a supplier assigns only its own car.
export function checkOwnership(company, vehicle, ownerName) {
  if (vehicle.companyId === company.companyId) return null;
  return v('R7', 'vehicleId', `${vehicle.vehicleId} belongs to ${ownerName}, not ${company.name}.`);
}

// Every R3-R6 violation of offering `vehicle` at `priceInr`, in rule order.
// request: API request object (has priceMinInr / priceMaxInr from its route).
export function validateOffer(request, company, vehicle, busyTimes, priceInr) {
  const out = [];
  const price = checkPrice({ price_min_inr: request.priceMinInr, price_max_inr: request.priceMaxInr }, priceInr);
  if (price) out.push(price);
  out.push(...r4Violations(request, company));
  out.push(...checkVehicle(request, vehicle, busyTimes)); // R5 then R6
  return out;
}
