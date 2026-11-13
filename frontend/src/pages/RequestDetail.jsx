import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, post } from '../api.js';
import { bookingNo, inr } from '../format.js';
import ErrorList from '../components/ErrorList.jsx';
import RequestFacts from '../components/RequestFacts.jsx';
import Status from '../components/Status.jsx';
import { POLL_MS, useLoad } from '../useLoad.js';

const CAR_TYPES = ['HATCHBACK', 'SEDAN', 'SUV', 'BUS'];

// One request and its taxi list. Polls so new offers appear without a refresh.
export default function RequestDetail() {
  const { requestId } = useParams();
  const [sort, setSort] = useState('price_asc');
  const [type, setType] = useState('');
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [booked, setBooked] = useState(null);

  const req = useLoad(() => get(`/api/requests/${encodeURIComponent(requestId)}`), [requestId], POLL_MS);
  const offers = useLoad(
    () => get(`/api/requests/${encodeURIComponent(requestId)}/offers?sort=${sort}${type ? `&type=${type}` : ''}`),
    [requestId, sort, type],
    POLL_MS,
  );

  async function act(offerId, kind) {
    setActionError(null);
    setBusy(`${kind}-${offerId}`);
    try {
      const res = await post(`/api/offers/${offerId}/${kind}`);
      if (kind === 'book') setBooked(res.bookingNumber);
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(null);
      req.reload();
      offers.reload();
    }
  }

  if (req.error && !req.data) return <><h1>Request {requestId}</h1><ErrorList error={req.error} /></>;
  if (!req.data) return <p className="muted">Loading…</p>;

  const { request: r, serveability, bookingNumber } = req.data;
  const number = booked ?? bookingNumber;
  const open = r.status === 'OPEN';

  return (
    <>
      <p><Link to="/traveler/requests">← My requests</Link></p>
      <div className="title-row">
        <h1>Request {r.requestId} <Status value={r.status} /></h1>
      </div>

      {number && (
        <div className="banner success" role="status">
          Booked. Your booking number is <strong className="big">{bookingNo(number)}</strong>
          {' '}<Link to={`/booking/${number}`}>View booking →</Link>
        </div>
      )}

      <section className="card">
        <RequestFacts request={r} />
        {open && serveability && (
          <p className={serveability.supplierCount ? 'muted' : 'warn-box'}>
            {serveability.supplierCount
              ? `${serveability.supplierCount} supplier${serveability.supplierCount === 1 ? '' : 's'} can serve this request.`
              : `No supplier can serve this request right now. ${serveability.reason ?? ''}`}
          </p>
        )}
      </section>

      <section className="card">
        <div className="title-row">
          <h2>Taxi offers</h2>
          <div className="filters">
            <label className="compact">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
            </label>
            <label className="compact">
              Car type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">All</option>
                {CAR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
        </div>

        <ErrorList error={actionError} />
        <ErrorList error={offers.error} />
        {!offers.data && !offers.error && <p className="muted">Loading offers…</p>}
        {offers.data?.length === 0 && (
          <p className="muted">No offers yet. This page refreshes by itself every few seconds.</p>
        )}

        <ul className="list">
          {offers.data?.map((o) => (
            <li key={o.offerId} className={`offer ${o.status !== 'OFFERED' ? 'dim' : ''}`}>
              <div className="row-main">
                <div><strong>{o.companyName}</strong> <span className="muted">★ {o.rating}</span> <Status value={o.status} /></div>
                <div>{o.vehicleId} · {o.type} · {o.seats} seats · {o.largeBags} large / {o.smallBags} small bags</div>
                {!o.vehicleFreeNow && o.status === 'OFFERED' && (
                  <div className="warn-text small">This car is now busy at your pickup time.</div>
                )}
              </div>
              <div className="row-side">
                <span className="price">{inr(o.priceInr)}</span>
                {o.status === 'OFFERED' && open && (
                  <div className="actions">
                    <button type="button" onClick={() => act(o.offerId, 'book')} disabled={busy !== null}>
                      {busy === `book-${o.offerId}` ? 'Booking…' : 'Book'}
                    </button>
                    <button type="button" className="secondary" onClick={() => act(o.offerId, 'reject')} disabled={busy !== null}>
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
