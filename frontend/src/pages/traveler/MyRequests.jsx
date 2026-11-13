import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listRequests } from '../../api/requests.js';
import { dateTime, inr } from '../../format.js';
import { POLL_MS, useApi } from '../../useApi.js';
import ErrorList from '../../components/ErrorList.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Serveability from '../../components/Serveability.jsx';

// GET /api/requests?traveler= — the traveler's own requests, newest first.
export default function MyRequests() {
  const [params, setParams] = useSearchParams();
  const name = params.get('name') ?? '';
  const [draft, setDraft] = useState(name);

  const { data, error, loading } = useApi(() => listRequests(name), [name], { pollMs: POLL_MS });

  function search(e) {
    e.preventDefault();
    const n = draft.trim();
    setParams(n ? { name: n } : {});
  }

  const q = name ? `?name=${encodeURIComponent(name)}` : '';

  return (
    <>
      <div className="page-head">
        <h1>My requests</h1>
        <Link to={`/traveler/new${q}`} className="btn">New request</Link>
      </div>

      <form className="card inline-form" onSubmit={search}>
        <label>
          Traveler name <span className="hint">empty shows every request</span>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Menon family" />
        </label>
        <button type="submit">Show</button>
      </form>

      <ErrorList error={error} />
      {loading && <p className="muted">Loading requests…</p>}
      {data && data.length === 0 && (
        <p className="muted">No requests{name ? ` for “${name}”` : ''} yet.</p>
      )}
      {data && data.length > 0 && (
        <ul className="list">
          {data.map(({ request: r, serveability, offerCount, bookingNumber }) => (
            <li key={r.requestId}>
              <Link to={`/traveler/requests/${encodeURIComponent(r.requestId)}${q}`} className="row-link card">
                <div className="row-top">
                  <span className="strong">{r.requestId}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div>
                  {r.travelerName} · {r.flight.flightNumber} → {r.hotel.name}, {r.hotel.city} / {r.hotel.area}
                </div>
                <div className="muted">
                  Pickup {dateTime(r.pickupAt)} · {r.passengers} seats · {inr(r.priceInr)}
                  {' · '}{offerCount} offer{offerCount === 1 ? '' : 's'}
                  {bookingNumber ? ` · booking ${bookingNumber}` : ''}
                </div>
                <Serveability serveability={serveability} compact />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
