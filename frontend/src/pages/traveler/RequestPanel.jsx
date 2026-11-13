import { useState } from 'react';
import { api } from '../../api.js';
import { useLoad } from '../../useLoad.js';
import { CAR_TYPES, POLL_MS, carSpec, inr } from '../../format.js';
import ErrorBox from '../../components/ErrorBox.jsx';
import { Loading, Status, TRAVELER_OFFER_LABELS } from '../../components/Bits.jsx';

// min–max of the prices a supplier has quoted so far (all its offers), or null if it has none.
function spread(offers) {
  if (!offers?.length) return null;
  const prices = offers.map((o) => o.priceInr);
  return { min: Math.min(...prices), max: Math.max(...prices), count: prices.length };
}

// Inside a request card: the suppliers that can serve it (with a Request button), and the offers list
// (Book / Reject), which also shows the suppliers that rejected the request.
export default function RequestPanel({ view, onBooked, onChanged }) {
  const { request, offerCount, serveability } = view;
  const requestId = request.requestId;
  const open = request.status === 'OPEN';

  const [sort, setSort] = useState('price_asc');
  const [type, setType] = useState('');
  const [offerError, setOfferError] = useState(null);
  const [askError, setAskError] = useState(null);
  const [working, setWorking] = useState(false);

  const suppliers = useLoad(() => api.requestSuppliers(requestId), [requestId], POLL_MS);
  const offers = useLoad(() => api.listRequestOffers(requestId, { sort, type }), [requestId, sort, type], POLL_MS);

  // Each supplier's own price range: what it has quoted so far. Loaded once per set of suppliers.
  const ids = (suppliers.data ?? []).map((s) => s.companyId).join(',');
  const quotes = useLoad(async () => {
    if (!ids) return {};
    const pairs = await Promise.all(ids.split(',').map(async (id) => [id, spread(await api.supplierOffers(id))]));
    return Object.fromEntries(pairs);
  }, [ids]);

  async function act(setError, fn) {
    setWorking(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err);
    }
    await Promise.all([suppliers.reload(), offers.reload(), onChanged()]);
    setWorking(false);
  }

  const ask = (companyId) => act(setAskError, () => api.askSupplier(requestId, companyId));
  const reject = (offerId) => act(setOfferError, () => api.rejectOffer(offerId));
  const book = (offerId) => act(setOfferError, async () => {
    const { bookingNumber } = await api.bookOffer(offerId);
    onBooked(bookingNumber);
  });

  const offeredBy = new Set((offers.data ?? []).map((o) => o.companyId));
  const declined = (suppliers.data ?? []).filter((s) => s.invite?.status === 'DECLINED');
  const rows = [
    ...(offers.data ?? []),
    ...(type ? [] : declined.map((s) => ({
      offerId: `declined-${s.companyId}`, companyName: s.name, rating: s.rating, status: 'DECLINED', reason: s.invite.reason,
    }))),
  ];

  return (
    <div className="panel">
      {open ? (
        <>
          <h3>Suppliers that can serve this request ({suppliers.data ? suppliers.data.length : '…'})</h3>
          <p className="muted">
            Each one works at {request.flight.to}, drives to {request.hotel.city} / {request.hotel.area}, is open at
            your pickup time and has a car that fits and is free. Click Request to ask one directly: when it accepts
            (assigns a car and price) or rejects, the answer shows in the offers list below.
          </p>
          <ErrorBox error={askError ?? suppliers.error} />
          {!suppliers.data && !suppliers.error ? <Loading /> : null}
          {suppliers.data && suppliers.data.length === 0 ? (
            <p className="empty">{serveability.reason ?? 'No supplier can serve this request.'}</p>
          ) : null}
          {suppliers.data && suppliers.data.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Supplier</th><th>Cars that fit and are free</th><th>Price range</th><th /></tr>
                </thead>
                <tbody>
                  {suppliers.data.map((s) => {
                    const q = quotes.data?.[s.companyId];
                    return (
                      <tr key={s.companyId}>
                        <td>
                          <strong>{s.name}</strong>
                          <div className="muted">★ {s.rating} · open {s.serviceFrom}–{s.serviceUntil}</div>
                        </td>
                        <td>
                          {s.vehicles.map((car) => (
                            <div key={car.vehicleId}>{car.vehicleId} <span className="muted">{carSpec(car)}</span></div>
                          ))}
                        </td>
                        <td>
                          {!quotes.data ? <span className="muted">…</span> : q ? (
                            <>
                              <strong>{q.min === q.max ? inr(q.min) : `${inr(q.min)} – ${inr(q.max)}`}</strong>
                              <div className="muted">from {q.count} {q.count === 1 ? 'quote' : 'quotes'} so far</div>
                            </>
                          ) : <span className="muted">No quotes yet</span>}
                          <div className="muted">allowed here: {inr(request.priceMinInr)} – {inr(request.priceMaxInr)}</div>
                        </td>
                        <td className="cell-actions">
                          {offeredBy.has(s.companyId) ? (
                            <span className="muted">Offered, see below</span>
                          ) : !s.invite ? (
                            <button
                              className="primary"
                              disabled={working}
                              aria-label={`Request ${s.name}`}
                              onClick={() => ask(s.companyId)}
                            >
                              Request
                            </button>
                          ) : s.invite.status === 'REQUESTED' ? (
                            <span><Status value="REQUESTED" /> <span className="muted">waiting for their answer</span></span>
                          ) : (
                            <Status value="DECLINED" labels={TRAVELER_OFFER_LABELS} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="title-row spaced">
        <h3>Offers ({offerCount}){declined.length ? ` · ${declined.length} rejected by supplier` : ''}</h3>
        <div className="row">
          <label className="inline">
            Sort
            <select value={sort} onChange={(ev) => setSort(ev.target.value)}>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </label>
          <label className="inline">
            Car type
            <select value={type} onChange={(ev) => setType(ev.target.value)}>
              <option value="">All</option>
              {CAR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
      </div>

      <ErrorBox error={offerError ?? offers.error} />
      {!offers.data && !offers.error ? <Loading /> : null}
      {offers.data && rows.length === 0 ? (
        <p className="empty">
          {offerCount === 0
            ? 'No taxi offered yet. This list refreshes every few seconds.'
            : 'No offer matches this car type.'}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Supplier</th><th>Car</th><th>Price</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.offerId}>
                  <td>
                    <strong>{o.companyName}</strong>
                    <div className="muted">★ {o.rating}</div>
                  </td>
                  <td>
                    {o.vehicleId ? (
                      <>
                        {o.vehicleId}
                        <div className="muted">{carSpec(o)}</div>
                        {open && o.status === 'OFFERED' && !o.vehicleFreeNow ? (
                          <div className="warn-text">This car has become busy at your pickup time.</div>
                        ) : null}
                      </>
                    ) : '—'}
                  </td>
                  <td>{o.priceInr !== undefined ? <strong>{inr(o.priceInr)}</strong> : '—'}</td>
                  <td>
                    <Status value={o.status} labels={TRAVELER_OFFER_LABELS} />
                    {o.reason ? <div className="muted">{o.reason}</div> : null}
                  </td>
                  <td className="cell-actions">
                    {open && o.status === 'OFFERED' ? (
                      <>
                        <button className="primary" disabled={working} onClick={() => book(o.offerId)}>Book</button>
                        <button disabled={working} onClick={() => reject(o.offerId)}>Reject</button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
