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

// The traveler's taxi list for one request, with supplier and car. Ties keep creation order.
export async function listRequestOffers(requestId, { desc = false, type = null } = {}, db = { query }) {
  const { rows } = await db.query(
    `SELECT o.offer_id, o.company_id, c.name AS company_name, c.rating, o.vehicle_id,
            v.type, v.seats, v.large_bags, v.small_bags, o.price_inr, o.status
       FROM offers o
       JOIN companies c ON c.company_id = o.company_id
       JOIN vehicles v ON v.vehicle_id = o.vehicle_id
      WHERE o.request_id = $1 AND ($2::text IS NULL OR v.type = $2)
      ORDER BY o.price_inr ${desc ? 'DESC' : 'ASC'}, o.created_at, o.offer_id`,
    [requestId, type],
  );
  return rows.map((r) => ({
    offerId: r.offer_id,
    companyId: r.company_id,
    companyName: r.company_name,
    rating: r.rating,
    vehicleId: r.vehicle_id,
    type: r.type,
    seats: r.seats,
    largeBags: r.large_bags,
    smallBags: r.small_bags,
    priceInr: r.price_inr,
    status: r.status,
  }));
}

// Locks one offer row (FOR UPDATE) inside a transaction.
export async function lockOffer(offerId, db) {
  const { rows } = await db.query(
    `SELECT offer_id, request_id, company_id, vehicle_id, price_inr, status
       FROM offers WHERE offer_id = $1 FOR UPDATE`,
    [offerId],
  );
  return rows[0] ? toOffer(rows[0]) : null;
}

export async function setOfferStatus(offerId, status, db = { query }) {
  const { rows } = await db.query(
    `UPDATE offers SET status = $2, decided_at = (now() AT TIME ZONE 'UTC') WHERE offer_id = $1
     RETURNING offer_id, request_id, company_id, vehicle_id, price_inr, status`,
    [offerId, status],
  );
  return toOffer(rows[0]);
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
