import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api.js';
import { bookingNo, dateTime, inr } from '../format.js';
import ErrorList from '../components/ErrorList.jsx';
import Status from '../components/Status.jsx';
import { POLL_MS, recall, remember, useLoad } from '../useLoad.js';

export default function MyRequests() {
  const [name, setName] = useState(recall('travelerName'));
  const [query, setQuery] = useState(recall('travelerName'));

  const { data, error } = useLoad(
    () => get(`/api/requests${query.trim() ? `?traveler=${encodeURIComponent(query.trim())}` : ''}`),
    [query],
    POLL_MS,
  );

  function search(e) {
    e.preventDefault();
    remember('travelerName', name.trim());
    setQuery(name);
  }

  return (
    <>
      <div className="title-row">
        <h1>My requests</h1>
        <Link to="/traveler/new" className="btn">New request</Link>
      </div>

      <form className="card inline-form" onSubmit={search}>
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Empty shows every request" />
        </label>
        <button type="submit">Show</button>
      </form>

      <ErrorList error={error} />
      {!data && !error && <p className="muted">Loading…</p>}
      {data && data.length === 0 && <p className="muted">No requests yet.</p>}

      <ul className="list">
        {data?.map(({ request: r, serveability, offerCount, bookingNumber }) => (
          <li key={r.requestId}>
            <Link to={`/traveler/requests/${encodeURIComponent(r.requestId)}`} className="row-link">
              <div className="row-main">
                <strong>{r.requestId}</strong> <Status value={r.status} />
                <div>{r.flight.to} → {r.hotel.city} / {r.hotel.area} · pickup {dateTime(r.pickupAt)}</div>
                <div className="muted">{r.travelerName} · {inr(r.priceInr)} · {r.carType ?? 'any car'}</div>
              </div>
              <div className="row-side">
                {r.status === 'BOOKED'
                  ? <span>Booking <strong>{bookingNo(bookingNumber)}</strong></span>
                  : (
                    <>
                      <span><strong>{offerCount}</strong> offer{offerCount === 1 ? '' : 's'}</span>
                      <span className="muted small">
                        {serveability?.supplierCount ?? 0} supplier{serveability?.supplierCount === 1 ? '' : 's'} can serve
                      </span>
                    </>
                  )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
