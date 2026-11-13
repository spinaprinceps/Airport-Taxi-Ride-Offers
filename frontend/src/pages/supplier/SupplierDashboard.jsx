import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useLoad } from '../../useLoad.js';
import { POLL_MS, carSpec, dateTime, inr, toNumber } from '../../format.js';
import ErrorBox from '../../components/ErrorBox.jsx';
import { JumpNav, Loading, RequestFacts, Status, SUPPLIER_OFFER_LABELS, Window } from '../../components/Bits.jsx';

// One supplier's whole dashboard on one page: incoming requests it can serve, its offers,
// and change requests on its bookings.
export default function SupplierDashboard() {
  const { companyId } = useParams();

  const suppliers = useLoad(() => api.suppliers(), []);
  const requests = useLoad(() => api.supplierRequests(companyId), [companyId], POLL_MS);
  const offers = useLoad(() => api.supplierOffers(companyId), [companyId], POLL_MS);
  const changes = useLoad(() => api.supplierChanges(companyId), [companyId], POLL_MS);

  const me = (suppliers.data ?? []).find((s) => s.companyId === companyId);
  const pending = (changes.data ?? []).filter((c) => c.change.status === 'PENDING').length;
  const count = (load) => (load.data ? ` (${load.data.length})` : '');
  const changesLabel = `Change requests${pending ? ` (${pending} pending)` : count(changes)}`;

  return (
    <>
      <h1>Supplier dashboard · {me ? me.name : companyId}</h1>
      {me ? (
        <p className="muted">
          {me.companyId} · airports {me.airports.join(', ')} · open {me.serviceFrom}–{me.serviceUntil} · ★ {me.rating}
        </p>
      ) : null}
      <JumpNav
        items={[
          ['incoming', `Incoming requests${count(requests)}`],
          ['my-offers', `My offers${count(offers)}`],
          ['changes', changesLabel],
        ]}
      />

      <section id="incoming">
        <h2>Incoming requests{count(requests)}</h2>
        <Requests companyId={companyId} load={requests} onChange={offers.reload} />
      </section>

      <section id="my-offers">
        <h2>My offers{count(offers)}</h2>
        <Offers load={offers} />
      </section>

      <section id="changes">
        <h2>{changesLabel}</h2>
        <Changes companyId={companyId} load={changes} />
      </section>
    </>
  );
}

// GET /api/suppliers/:companyId/requests — only OPEN requests this supplier can serve (R4), earliest pickup first.
function Requests({ companyId, load, onChange }) {
  const { data, error, reload } = load;
  const refresh = () => Promise.all([reload(), onChange()]);
  return (
    <>
      <ErrorBox error={error} />
      {!data && !error ? <Loading /> : null}
      {data && data.length === 0 ? <p className="empty">No open request you can serve right now.</p> : null}
      {(data ?? []).map((item) => (
        <RequestCard key={item.request.requestId} companyId={companyId} item={item} refresh={refresh} />
      ))}
    </>
  );
}

// One incoming request with every detail. Accept = assign a car with a price; or reject with a reason.
function RequestCard({ companyId, item, refresh }) {
  const { request: r, fittingFreeVehicles, myOffers, invite } = item;
  const [vehicleId, setVehicleId] = useState('');
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [working, setWorking] = useState(false);
  const [showCars, setShowCars] = useState(false);

  const offered = new Set(myOffers.map((o) => o.vehicleId));
  const cars = fittingFreeVehicles.filter((c) => !offered.has(c.vehicleId));
  const chosen = cars.some((c) => c.vehicleId === vehicleId) ? vehicleId : (cars[0]?.vehicleId ?? '');
  const declined = invite?.status === 'DECLINED';

  async function act(fn) {
    setWorking(true);
    setError(null);
    try {
      await fn();
      setPrice('');
      setReason('');
    } catch (err) {
      setError(err);
    }
    await refresh();
    setWorking(false);
  }

  const assign = (ev) => {
    ev.preventDefault();
    act(() => api.createOffer(companyId, r.requestId, { vehicleId: chosen, priceInr: toNumber(price) }));
  };
  const decline = () => act(() => api.declineRequest(companyId, r.requestId, reason));

  return (
    <section className={`card request-card${declined ? ' declined' : ''}`}>
      <div className="title-row">
        <h3>{r.requestId} · {r.flight.to} → {r.hotel.city} / {r.hotel.area}</h3>
        <span>
          {invite?.status === 'REQUESTED' ? <span className="status status-asked">TRAVELER ASKED YOU</span> : null}
          {declined ? <Status value="DECLINED" labels={{ DECLINED: 'REJECTED BY YOU' }} /> : null}
        </span>
      </div>
      <RequestFacts request={r} />

      {myOffers.length > 0 ? (
        <p className="summary spaced">
          <strong>Assigned by you:</strong>{' '}
          {myOffers.map((o) => (
            <span key={o.offerId}>
              {o.vehicleId} at {inr(o.priceInr)} <Status value={o.status} labels={SUPPLIER_OFFER_LABELS} />{' '}
            </span>
          ))}
        </p>
      ) : null}

      <ErrorBox error={error} />
      {declined ? (
        <div className="foot">
          <span>You rejected this request{invite.reason ? `: ${invite.reason}` : '.'}</span>
        </div>
      ) : (
        <div className="foot decide">
          <form className="row" onSubmit={assign}>
            <strong>Accept:</strong>
            <select value={chosen} onChange={(ev) => setVehicleId(ev.target.value)} aria-label={`Car for ${r.requestId}`}>
              {cars.length === 0 ? <option value="">No other car fits and is free</option> : null}
              {cars.map((c) => <option key={c.vehicleId} value={c.vehicleId}>{c.vehicleId} · {carSpec(c)}</option>)}
            </select>
            <input
              inputMode="numeric"
              placeholder={`Price ₹ (${inr(r.priceMinInr)} – ${inr(r.priceMaxInr)})`}
              aria-label={`Price for ${r.requestId}`}
              value={price}
              onChange={(ev) => setPrice(ev.target.value)}
            />
            <button className="primary" type="submit" disabled={working}>Assign car</button>
          </form>
          <div className="row">
            <strong>Reject:</strong>
            <input
              placeholder="Reason, shown to the traveler (optional)"
              aria-label={`Reason to reject ${r.requestId}`}
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
            />
            <button type="button" disabled={working} onClick={decline}>Reject request</button>
          </div>
        </div>
      )}

      <details className="other-car" onToggle={(ev) => setShowCars(ev.currentTarget.open)}>
        <summary>Can my other cars take this ride?</summary>
        {showCars ? <CarVerdicts companyId={companyId} requestId={r.requestId} /> : null}
      </details>
    </section>
  );
}

// GET /api/suppliers/:companyId/requests/:requestId — a verdict per car, loaded when opened.
function CarVerdicts({ companyId, requestId }) {
  const { data, error } = useLoad(() => api.supplierRequest(companyId, requestId), [companyId, requestId]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Car</th><th>Can it take this ride?</th></tr></thead>
        <tbody>
          {data.vehicles.map((car) => (
            <tr key={car.vehicleId}>
              <td>
                <strong>{car.vehicleId}</strong>
                <div className="muted">{carSpec(car)}</div>
              </td>
              <td>
                {car.ok ? <span className="ok-text">Fits and is free</span> : (
                  <ul className="violations">
                    {car.violations.map((x, i) => <li key={i}><span className="rule">{x.rule}</span> {x.message}</li>)}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// GET /api/suppliers/:companyId/offers — newest first.
function Offers({ load }) {
  const { data, error } = load;
  return (
    <>
      <ErrorBox error={error} />
      {!data && !error ? <Loading /> : null}
      {data && data.length === 0 ? <p className="empty">You have not assigned a car yet.</p> : null}
      {data && data.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>Request</th><th>Traveler</th><th>Pickup</th><th>Car</th><th>Price</th><th>Status</th><th>Booking</th></tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.offerId}>
                  <td>{o.offerId}</td>
                  <td>{o.requestId}</td>
                  <td>{o.travelerName}</td>
                  <td>{dateTime(o.pickupAt)}</td>
                  <td>{o.vehicleId}</td>
                  <td>{inr(o.priceInr)}</td>
                  <td><Status value={o.status} labels={SUPPLIER_OFFER_LABELS} /></td>
                  <td>{o.bookingNumber ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

// GET /api/suppliers/:companyId/change-requests — PENDING first; accept or reject each.
function Changes({ companyId, load }) {
  const { data, error, reload } = load;
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState({});

  async function decide(fn) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err); // a busy car is saved as REJECTED by SYSTEM; the reload below shows it
    }
    await reload();
    setBusy(false);
  }

  return (
    <>
      <ErrorBox error={actionError ?? error} />
      {!data && !error ? <Loading /> : null}
      {data && data.length === 0 ? <p className="empty">No change requests on your bookings.</p> : null}
      {data && data.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>Booking</th><th>Car</th><th>Now</th><th>Asked for</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {data.map(({ change: c, booking: b, newBusyUntil, vehicleFreeAtNewTime }) => (
                <tr key={c.changeId}>
                  <td>{c.changeId}</td>
                  <td>
                    {b.bookingNumber}
                    <div className="muted">{b.travelerName}</div>
                  </td>
                  <td>{b.vehicleId}</td>
                  <td>
                    <Window from={b.pickupAt} until={b.busyUntil} />
                    <div className="muted">when asked: {dateTime(c.oldPickupAt)}</div>
                  </td>
                  <td>
                    <strong><Window from={c.newPickupAt} until={newBusyUntil} /></strong>
                    {c.newFlightId !== c.oldFlightId
                      ? <div className="muted">flight {c.oldFlightId} → {c.newFlightId}</div>
                      : null}
                    {c.status === 'PENDING' ? (
                      <div className={vehicleFreeAtNewTime ? 'ok-text' : 'warn-text'}>
                        {vehicleFreeAtNewTime ? `${b.vehicleId} is free then` : `${b.vehicleId} is busy then`}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <Status value={c.status} />
                    {c.decidedBy ? <div className="muted">by {c.decidedBy}</div> : null}
                    {c.reason ? <div className="muted">{c.reason}</div> : null}
                  </td>
                  <td className="cell-actions">
                    {c.status === 'PENDING' ? (
                      <>
                        <button className="primary" disabled={busy} onClick={() => decide(() => api.acceptChange(companyId, c.changeId))}>
                          Accept
                        </button>
                        <input
                          placeholder="Reason (optional)"
                          value={reasons[c.changeId] ?? ''}
                          onChange={(ev) => setReasons((r) => ({ ...r, [c.changeId]: ev.target.value }))}
                        />
                        <button disabled={busy} onClick={() => decide(() => api.rejectChange(companyId, c.changeId, reasons[c.changeId]))}>
                          Reject
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
