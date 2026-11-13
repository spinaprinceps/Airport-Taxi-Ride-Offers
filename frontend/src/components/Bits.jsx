import { bags, dateTime, hhmm, inr, party } from '../format.js';

const LABELS = { NOT_CHOSEN: 'NOT CHOSEN' };

export const SUPPLIER_OFFER_LABELS = { OFFERED: 'WAITING', NOT_CHOSEN: 'NOT CHOSEN' };

// The traveler's offers list also shows suppliers that rejected the request (invite DECLINED).
export const TRAVELER_OFFER_LABELS = { NOT_CHOSEN: 'NOT CHOSEN', DECLINED: 'REJECTED BY SUPPLIER' };

export function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Sticky row of buttons that jump to the sections of a one-page dashboard.
export function JumpNav({ items }) {
  return (
    <nav className="jump">
      {items.map(([id, label]) => (
        <button key={id} type="button" onClick={() => scrollToId(id)}>{label}</button>
      ))}
    </nav>
  );
}

export function Status({ value, labels = LABELS }) {
  if (!value) return null;
  return <span className={`status status-${value.toLowerCase()}`}>{labels[value] ?? value}</span>;
}

export function Loading() {
  return <p className="muted">Loading…</p>;
}

// The facts of a request object, as the backend returns it.
export function RequestFacts({ request: r }) {
  return (
    <dl className="facts">
      <div><dt>Traveler</dt><dd>{r.travelerName}</dd></div>
      <div>
        <dt>Flight</dt>
        <dd>{r.flight.flightNumber} · {r.flight.airline} → {r.flight.to}, lands {dateTime(r.flight.arrivalLocal)}</dd>
      </div>
      <div><dt>Hotel</dt><dd>{r.hotel.name} · {r.hotel.city} / {r.hotel.area}</dd></div>
      <div><dt>Pickup</dt><dd>{dateTime(r.pickupAt)}</dd></div>
      <div><dt>Car busy until</dt><dd>{dateTime(r.busyUntil)} ({r.driveMinutes} min drive each way)</dd></div>
      <div><dt>Party</dt><dd>{party(r)} — {r.passengers} {r.passengers === 1 ? 'seat' : 'seats'}</dd></div>
      <div><dt>Bags</dt><dd>{bags(r)}</dd></div>
      <div><dt>Car type</dt><dd>{r.carType ?? 'Any'}</dd></div>
      <div>
        <dt>Price</dt>
        <dd>{inr(r.priceInr)} <span className="muted">(route range {inr(r.priceMinInr)} – {inr(r.priceMaxInr)})</span></dd>
      </div>
    </dl>
  );
}

// "10 Apr 2027, 11:30 – 14:00" (adds the date on the right only when it differs)
export function Window({ from, until }) {
  const sameDay = from && until && from.slice(0, 10) === until.slice(0, 10);
  return <>{dateTime(from)} – {sameDay ? hhmm(until) : dateTime(until)}</>;
}
