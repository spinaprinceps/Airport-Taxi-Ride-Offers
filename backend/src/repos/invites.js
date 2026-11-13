// SQL only. request_invites: a traveler asked a supplier (REQUESTED) or the supplier declined (DECLINED).
import { query } from '../db.js';

const cols = `request_id, company_id, status, reason`;

export const toInvite = (r) => ({
  requestId: r.request_id,
  companyId: r.company_id,
  status: r.status,
  reason: r.reason,
});

export async function getInvite(requestId, companyId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${cols} FROM request_invites WHERE request_id = $1 AND company_id = $2`, [requestId, companyId]);
  return rows[0] ? toInvite(rows[0]) : null;
}

export async function listInvitesForRequest(requestId, db = { query }) {
  const { rows } = await db.query(`SELECT ${cols} FROM request_invites WHERE request_id = $1`, [requestId]);
  return rows.map(toInvite);
}

export async function listInvitesForCompany(companyId, db = { query }) {
  const { rows } = await db.query(`SELECT ${cols} FROM request_invites WHERE company_id = $1`, [companyId]);
  return rows.map(toInvite);
}

// Returns the new invite, or null when one already exists for this request and supplier.
export async function insertRequested(requestId, companyId, db = { query }) {
  const { rows } = await db.query(
    `INSERT INTO request_invites (request_id, company_id, status) VALUES ($1, $2, 'REQUESTED')
     ON CONFLICT (request_id, company_id) DO NOTHING RETURNING ${cols}`,
    [requestId, companyId],
  );
  return rows[0] ? toInvite(rows[0]) : null;
}

export async function saveDeclined(requestId, companyId, reason, db = { query }) {
  const { rows } = await db.query(
    `INSERT INTO request_invites (request_id, company_id, status, reason, decided_at)
     VALUES ($1, $2, 'DECLINED', $3, (clock_timestamp() AT TIME ZONE 'UTC'))
     ON CONFLICT (request_id, company_id)
     DO UPDATE SET status = 'DECLINED', reason = EXCLUDED.reason, decided_at = EXCLUDED.decided_at
     RETURNING ${cols}`,
    [requestId, companyId, reason],
  );
  return toInvite(rows[0]);
}
