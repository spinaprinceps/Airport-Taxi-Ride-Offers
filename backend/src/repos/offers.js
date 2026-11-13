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

// The supplier's "My offers" tab. Newest first.
export async function listCompanyOffersWithRequest(companyId, db = { query }) {
  const { rows } = await db.query(
    `SELECT o.offer_id, o.request_id, r.traveler_name, r.pickup_at, o.vehicle_id, o.price_inr, o.status,
            b.booking_number
       FROM offers o
       JOIN ride_requests r ON r.request_id = o.request_id
       LEFT JOIN bookings b ON b.offer_id = o.offer_id
      WHERE o.company_id = $1
      ORDER BY o.created_at DESC, o.offer_id DESC`,
    [companyId],
  );
  return rows.map((r) => ({
    offerId: r.offer_id,
    requestId: r.request_id,
    travelerName: r.traveler_name,
    pickupAt: r.pickup_at,
    vehicleId: r.vehicle_id,
    priceInr: r.price_inr,
    status: r.status,
    bookingNumber: r.booking_number,
  }));
}

export async function offerExists(requestId, vehicleId, db = { query }) {
  const { rows } = await db.query(
    `SELECT 1 FROM offers WHERE request_id = $1 AND vehicle_id = $2`, [requestId, vehicleId]);
  return rows.length > 0;
}

export async function insertOffer({ requestId, companyId, vehicleId, priceInr }, db = { query }) {
  const { rows } = await db.query(
    `INSERT INTO offers (request_id, company_id, vehicle_id, price_inr, status)
     VALUES ($1, $2, $3, $4, 'OFFERED')
     RETURNING offer_id, request_id, company_id, vehicle_id, price_inr, status`,
    [requestId, companyId, vehicleId, priceInr],
  );
  return toOffer(rows[0]);
}
