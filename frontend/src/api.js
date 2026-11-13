// One function per backend route. Every non-2xx response becomes an ApiError
// carrying the backend's { code, message, violations }.

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message ?? `HTTP ${status}`);
    this.status = status;
    this.code = body?.code ?? 'HTTP';
    this.violations = Array.isArray(body?.violations) ? body.violations : [];
  }
}

async function call(method, path, body, headers = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { code: 'NETWORK', message: 'Cannot reach the server.' });
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

const e = encodeURIComponent;

function qs(params) {
  const p = new URLSearchParams();
  for (const [k, val] of Object.entries(params)) if (val !== undefined && val !== null && val !== '') p.set(k, val);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const api = {
  // Catalog
  suppliers: () => call('GET', '/suppliers'),
  flights: () => call('GET', '/flights'),
  hotels: () => call('GET', '/hotels'),
  priceRange: (flightId, hotelId) => call('GET', `/price-range${qs({ flightId, hotelId })}`),

  // Requests (traveler)
  createRequest: (body, idempotencyKey) => call('POST', '/requests', body, { 'Idempotency-Key': idempotencyKey }),
  listRequests: (traveler) => call('GET', `/requests${qs({ traveler })}`),
  getRequest: (requestId) => call('GET', `/requests/${e(requestId)}`),
  listRequestOffers: (requestId, { sort, type } = {}) =>
    call('GET', `/requests/${e(requestId)}/offers${qs({ sort, type })}`),
  requestSuppliers: (requestId) => call('GET', `/requests/${e(requestId)}/suppliers`),
  askSupplier: (requestId, companyId) => call('POST', `/requests/${e(requestId)}/suppliers/${e(companyId)}/ask`),
  rejectOffer: (offerId) => call('POST', `/offers/${e(offerId)}/reject`),
  bookOffer: (offerId) => call('POST', `/offers/${e(offerId)}/book`),

  // Bookings
  getBooking: (bookingNumber) => call('GET', `/bookings/${e(bookingNumber)}`),
  submitChange: (bookingNumber, body) => call('POST', `/bookings/${e(bookingNumber)}/change-requests`, body),

  // Supplier
  supplierRequests: (companyId) => call('GET', `/suppliers/${e(companyId)}/requests`),
  supplierRequest: (companyId, requestId) => call('GET', `/suppliers/${e(companyId)}/requests/${e(requestId)}`),
  createOffer: (companyId, requestId, body) =>
    call('POST', `/suppliers/${e(companyId)}/requests/${e(requestId)}/offers`, body),
  declineRequest: (companyId, requestId, reason) =>
    call('POST', `/suppliers/${e(companyId)}/requests/${e(requestId)}/decline`, { reason: reason || null }),
  shareablePairs: (companyId) => call('GET', `/suppliers/${e(companyId)}/shareable-pairs`),
  createSharedOffer: (companyId, body) => call('POST', `/suppliers/${e(companyId)}/shared-offers`, body),
  supplierOffers: (companyId) => call('GET', `/suppliers/${e(companyId)}/offers`),
  supplierChanges: (companyId) => call('GET', `/suppliers/${e(companyId)}/change-requests`),
  acceptChange: (companyId, changeId) =>
    call('POST', `/suppliers/${e(companyId)}/change-requests/${e(changeId)}/accept`),
  rejectChange: (companyId, changeId, reason) =>
    call('POST', `/suppliers/${e(companyId)}/change-requests/${e(changeId)}/reject`, { reason: reason || null }),
};
