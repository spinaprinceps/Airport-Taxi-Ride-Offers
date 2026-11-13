import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { get, post } from '../api.js';
import { bags, bookingNo, dateTime, inr, people } from '../format.js';
import ErrorList from '../components/ErrorList.jsx';
import Status from '../components/Status.jsx';
import { POLL_MS, useLoad } from '../useLoad.js';

const TABS = [
  ['requests', 'Open requests'],
  ['offers', 'My offers'],
  ['changes', 'Change requests'],
];

export default function SupplierDashboard() {
  const { companyId } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'requests';

  return (
    <>
      <h1>Supplier dashboard</h1>
      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setParams({ tab: key })}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'requests' && <OpenRequests companyId={companyId} />}
      {tab === 'offers' && <MyOffers companyId={companyId} />}
      {tab === 'changes' && <ChangeRequests companyId={companyId} />}
    </>
  );
}

function OpenRequests({ companyId }) {
  const { data, error } = useLoad(
    () => get(`/api/suppliers/${encodeURIComponent(companyId)}/requests`), [companyId], POLL_MS);

  if (error && !data) return <ErrorList error={error} />;
  if (!data) return <p className="muted">Loading…</p>;
  if (data.length === 0) {
    return <p className="muted">No open requests you can serve right now. This list refreshes every few seconds.</p>;
  }

  return (
    <ul className="list">
      {data.map(({ request: r, fittingFreeVehicles, myOffers }) => (
        <li key={r.requestId}>
          <Link to={`/supplier/${encodeURIComponent(companyId)}/requests/${encodeURIComponent(r.requestId)}`} className="row-link">
            <div className="row-main">
              <div><strong>{r.requestId}</strong> · {r.travelerName}</div>
              <div>{r.flight.to} → {r.hotel.city} / {r.hotel.area} · pickup <strong>{dateTime(r.pickupAt)}</strong></div>
              <div className="muted">{people(r.adults, r.childAges)} · {bags(r.largeBags, r.smallBags)} · {r.carType ?? 'any car'}</div>
              <div className="small">
                Cars that fit and are free: {fittingFreeVehicles.map((v) => v.vehicleId).join(', ')}
              </div>
            </div>
            <div className="row-side">
              <span className="price">{inr(r.priceInr)}</span>
              {myOffers.length > 0
                ? <span className="small">{myOffers.length} offer{myOffers.length === 1 ? '' : 's'} sent</span>
                : <span className="small accent">Assign a car →</span>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MyOffers({ companyId }) {
  const { data, error } = useLoad(
    () => get(`/api/suppliers/${encodeURIComponent(companyId)}/offers`), [companyId], POLL_MS);

  if (error && !data) return <ErrorList error={error} />;
  if (!data) return <p className="muted">Loading…</p>;
  if (data.length === 0) return <p className="muted">You have not sent any offers yet.</p>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Offer</th><th>Request</th><th>Traveler</th><th>Pickup</th><th>Car</th><th>Price</th><th>Status</th></tr>
        </thead>
        <tbody>
          {data.map((o) => (
            <tr key={o.offerId}>
              <td>#{o.offerId}</td>
              <td>{o.requestId}</td>
              <td>{o.travelerName}</td>
              <td>{dateTime(o.pickupAt)}</td>
              <td>{o.vehicleId}</td>
              <td>{inr(o.priceInr)}</td>
              <td>
                <Status value={o.status} />
                {o.bookingNumber && <div className="small">Booking {bookingNo(o.bookingNumber)}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChangeRequests({ companyId }) {
  const base = `/api/suppliers/${encodeURIComponent(companyId)}/change-requests`;
  const { data, error, reload } = useLoad(() => get(base), [companyId], POLL_MS);
  const [busy, setBusy] = useState(null);
  const [errors, setErrors] = useState({});
  const [reasons, setReasons] = useState({});

  async function decide(changeId, kind) {
    setBusy(changeId);
    setErrors((e) => ({ ...e, [changeId]: null }));
    try {
      await post(`${base}/${changeId}/${kind}`, kind === 'reject' ? { reason: reasons[changeId] || null } : {});
    } catch (err) {
      setErrors((e) => ({ ...e, [changeId]: err }));
    } finally {
      setBusy(null);
      reload();
    }
  }

  if (error && !data) return <ErrorList error={error} />;
  if (!data) return <p className="muted">Loading…</p>;
  if (data.length === 0) return <p className="muted">No change requests.</p>;

  return (
    <ul className="list">
      {data.map(({ change: c, booking: b, newBusyUntil, vehicleFreeAtNewTime }) => (
        <li key={c.changeId} className="stack">
          <div className="row-main">
            <div>
              <strong>#{c.changeId}</strong> · booking {bookingNo(b.bookingNumber)} · {b.travelerName} · {b.vehicleId}
              {' '}<Status value={c.status} /> {c.decidedBy && <span className="muted small">by {c.decidedBy}</span>}
            </div>
            <div>
              Now: {c.oldFlightId}, pickup {dateTime(c.oldPickupAt)} <span className="muted">(busy until {dateTime(b.busyUntil)})</span>
            </div>
            <div>
              Asked: {c.newFlightId}, pickup <strong>{dateTime(c.newPickupAt)}</strong> <span className="muted">(busy until {dateTime(newBusyUntil)})</span>
            </div>
            {c.status === 'PENDING' && (
              <div className={vehicleFreeAtNewTime ? 'ok-text small' : 'warn-text small'}>
                {vehicleFreeAtNewTime ? `${b.vehicleId} is free at the new time.` : `${b.vehicleId} is busy at the new time.`}
              </div>
            )}
            {c.reason && <div className="muted">Reason: {c.reason}</div>}
          </div>
          {c.status === 'PENDING' && (
            <div className="decide">
              <input
                placeholder="Reason (optional, for reject)"
                value={reasons[c.changeId] ?? ''}
                onChange={(e) => setReasons((r) => ({ ...r, [c.changeId]: e.target.value }))}
              />
              <div className="actions">
                <button type="button" onClick={() => decide(c.changeId, 'accept')} disabled={busy !== null}>Accept</button>
                <button type="button" className="secondary" onClick={() => decide(c.changeId, 'reject')} disabled={busy !== null}>Reject</button>
              </div>
            </div>
          )}
          <ErrorList error={errors[c.changeId]} />
        </li>
      ))}
    </ul>
  );
}
