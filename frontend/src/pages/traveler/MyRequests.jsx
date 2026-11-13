import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useLoad } from '../../useLoad.js';
import { POLL_MS, bags, dateTime, inr, party } from '../../format.js';
import ErrorBox from '../../components/ErrorBox.jsx';
import { Loading, Status, scrollToId } from '../../components/Bits.jsx';
import RequestPanel from './RequestPanel.jsx';

// What is happening with a request, in one line.
function statusLine({ request, serveability, offerCount, bookingNumber }, onOpenBooking) {
  if (bookingNumber) {
    return (
      <span className="ok-text">
        Booked. Booking number{' '}
        <button type="button" className="link" onClick={() => onOpenBooking(bookingNumber)}>{bookingNumber}</button>
      </span>
    );
  }
  if (request.status !== 'OPEN') return null;
  if (offerCount > 0) {
    return <strong>{offerCount} {offerCount === 1 ? 'taxi' : 'taxis'} offered. Book one or reject below.</strong>;
  }
  if (serveability.supplierCount === 0) {
    return <span className="warn-text"><strong>No supplier can serve this.</strong> {serveability.reason}</span>;
  }
  return (
    <span>
      <strong>Waiting for offers.</strong> {serveability.supplierCount}{' '}
      {serveability.supplierCount === 1 ? 'supplier' : 'suppliers'} can serve this request.
    </span>
  );
}

// GET /api/requests?traveler= — newest first. Each card opens inline to show its suppliers and offers.
export default function MyRequests({ name, focus, onOpenBooking }) {
  const { data, error, loading, reload } = useLoad(() => api.listRequests(name), [name], POLL_MS);
  const [opened, setOpened] = useState(() => new Set(focus ? [focus] : []));
  const hasFocus = Boolean(focus && data?.some((v) => v.request.requestId === focus));

  // A request named in the URL (just posted, or an old link) is opened and scrolled to.
  useEffect(() => {
    if (!focus) return;
    setOpened((s) => new Set(s).add(focus));
    if (hasFocus) scrollToId(`request-${focus}`);
  }, [focus, hasFocus]);

  const toggle = (id) => setOpened((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : null}
      {data && data.length === 0 ? <p className="empty">No requests for “{name}” yet. Post one under “New request”.</p> : null}
      {(data ?? []).map((view) => {
        const r = view.request;
        const isOpen = opened.has(r.requestId);
        return (
          <section className="card request-card" key={r.requestId} id={`request-${r.requestId}`}>
            <div className="title-row">
              <h2>{r.requestId} · {r.flight.to} → {r.hotel.name}, {r.hotel.city} / {r.hotel.area}</h2>
              <span>
                {r.shareOk ? <span className="status status-shared">SHARING OK</span> : null} <Status value={r.status} />
              </span>
            </div>
            <p className="summary">
              Flight {r.flight.flightNumber} · pickup {dateTime(r.pickupAt)} · {party(r)} · bags {bags(r)} ·{' '}
              {r.carType ?? 'any car'} · your price {inr(r.priceInr)}{' '}
              <span className="muted">(range {inr(r.priceMinInr)} – {inr(r.priceMaxInr)})</span>
            </p>
            <div className="foot">
              {statusLine(view, onOpenBooking)}
              <button type="button" onClick={() => toggle(r.requestId)} aria-expanded={isOpen}>
                {isOpen ? 'Hide suppliers and offers' : 'Show suppliers and offers'}
              </button>
            </div>
            {isOpen ? <RequestPanel view={view} onBooked={(n) => onOpenBooking(n, true)} onChanged={reload} /> : null}
          </section>
        );
      })}
    </>
  );
}
