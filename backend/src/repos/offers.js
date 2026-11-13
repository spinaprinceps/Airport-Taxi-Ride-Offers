// SQL only.
import { query } from '../db.js';

export const toOffer = (r) => ({
  offerId: r.offer_id,
  requestId: r.request_id,
  companyId: r.company_id,
  vehicleId: r.vehicle_id,
  priceInr: r.price_inr,
  status: r.status,
});

// Offers of one supplier, optionally only on some requests. Oldest first.
export async function listCompanyOffers(companyId, requestIds = null, db = { query }) {
  const { rows } = await db.query(
    `SELECT offer_id, request_id, company_id, vehicle_id, price_inr, status, created_at
       FROM offers
      WHERE company_id = $1 AND ($2::text[] IS NULL OR request_id = ANY($2))
      ORDER BY created_at, offer_id`,
    [companyId, requestIds],
  );
  return rows.map(toOffer);
}
