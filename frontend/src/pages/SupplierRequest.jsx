import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, post } from '../api.js';
import { inr } from '../format.js';
import ErrorList from '../components/ErrorList.jsx';
import RequestFacts from '../components/RequestFacts.jsx';
import Status from '../components/Status.jsx';
import { POLL_MS, useLoad } from '../useLoad.js';

// One request as a supplier sees it: every car with its verdict, and the offer form (S4).
export default function SupplierRequest() {
  const { companyId, requestId } = useParams();
  const path = `/api/suppliers/${encodeURIComponent(companyId)}/requests/${encodeURIComponent(requestId)}`;
  const { data, error, reload } = useLoad(() => get(path), [path], POLL_MS);

  const [vehicleId, setVehicleId] = useState('');
  const [price, setPrice] = useState('');
  const [offerError, setOfferError] = useState(null);
  const [sent, setSent] = useState(null);
  const [sending, setSending] = useState(false);

  // Defaults once: the first car that fits and is free, and the traveler's price.
  useEffect(() => {
    if (!data) return;
    setVehicleId((v) => v || (data.vehicles.find((x) => x.ok) ?? data.vehicles[0])?.vehicleId || '');
    setPrice((p) => (p === '' ? String(data.request.priceInr) : p));
  }, [data]);

  async function send(e) {
    e.preventDefault();
    setOfferError(null);
    setSent(null);
    setSending(true);
    try {
      const offer = await post(`/api/suppliers/${encodeURIComponent(companyId)}/requests/${encodeURIComponent(requestId)}/offers`, {
        vehicleId,
        priceInr: price.trim() === '' ? null : Number(price),
      });
      setSent(offer);
      reload();
    } catch (err) {
      setOfferError(err);
    } finally {
      setSending(false);
    }
  }

  const back = <p><Link to={`/supplier/${encodeURIComponent(companyId)}`}>← Open requests</Link></p>;

  if (error && !data) return <>{back}<h1>Request {requestId}</h1><ErrorList error={error} /></>;
  if (!data) return <p className="muted">Loading…</p>;

  const { request: r, vehicles, myOffers } = data;

  return (
    <>
      {back}
      <h1>Request {r.requestId} <Status value={r.status} /></h1>

      <section className="card">
        <RequestFacts request={r} />
      </section>

      <section className="card">
        <h2>Your cars</h2>
        <ul className="list">
          {vehicles.map((v) => (
            <li key={v.vehicleId} className={v.ok ? '' : 'dim'}>
              <div className="row-main">
                <div>
                  <strong>{v.vehicleId}</strong> · {v.type} · {v.seats} seats · {v.largeBags} large / {v.smallBags} small bags
                </div>
                {v.ok
                  ? <div className="ok-text small">Fits and is free.</div>
                  : v.violations.map((x, i) => (
                    <div key={i} className="warn-text small"><strong>{x.rule}:</strong> {x.message}</div>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <form className="card" onSubmit={send} noValidate>
        <h2>Assign a car</h2>
        {r.status !== 'OPEN' && <div className="banner">This request is {r.status}; the server will refuse new offers.</div>}
        <div className="grid-2">
          <label>
            Car
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              {vehicles.map((v) => (
                <option key={v.vehicleId} value={v.vehicleId}>
                  {v.vehicleId} · {v.type}{v.ok ? '' : ' (does not fit / busy)'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Price (₹) <span className="muted hint">range {inr(r.priceMinInr)} – {inr(r.priceMaxInr)}</span>
            <input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
        </div>
        <ErrorList error={offerError} />
        {sent && <div className="banner success">Offer #{sent.offerId} sent: {sent.vehicleId} for {inr(sent.priceInr)}.</div>}
        <button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send offer'}</button>
      </form>

      {myOffers.length > 0 && (
        <section className="card">
          <h2>Your offers on this request</h2>
          <ul className="list">
            {myOffers.map((o) => (
              <li key={o.offerId}>
                <div className="row-main">#{o.offerId} · {o.vehicleId} · {inr(o.priceInr)}</div>
                <div className="row-side"><Status value={o.status} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
