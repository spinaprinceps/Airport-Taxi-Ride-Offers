import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, post } from '../api.js';
import { bags, bookingNo, dateTime, inr, people, timeOnly } from '../format.js';
import ErrorList from '../components/ErrorList.jsx';
import Status from '../components/Status.jsx';
import { POLL_MS, useLoad } from '../useLoad.js';

// Booking summary (S7) + change request (S8). Polls so the supplier's decision shows up.
export default function BookingSummary() {
  const { bookingNumber } = useParams();
  const booking = useLoad(() => get(`/api/bookings/${encodeURIComponent(bookingNumber)}`), [bookingNumber], POLL_MS);
  const flights = useLoad(() => get('/api/flights'), []);

  const [newFlightId, setNewFlightId] = useState('');
  const [newPickupAt, setNewPickupAt] = useState('');
  const [changeError, setChangeError] = useState(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const b = booking.data;

  // Same airport first; other airports are still listed (the backend answers R9).
  const flightGroups = useMemo(() => {
    if (!flights.data || !b) return [];
    const home = b.flight.to;
    const groups = new Map([[home, []]]);
    for (const f of flights.data) {
      if (!groups.has(f.to)) groups.set(f.to, []);
      groups.get(f.to).push(f);
    }
    return [...groups.entries()];
  }, [flights.data, b]);

  async function sendChange(e) {
    e.preventDefault();
    setChangeError(null);
    setSent(false);
    setSending(true);
    try {
      await post(`/api/bookings/${encodeURIComponent(bookingNumber)}/change-requests`, {
        newFlightId: newFlightId || null,
        newPickupAt: newPickupAt || null,
      });
      setSent(true);
      setNewFlightId('');
      setNewPickupAt('');
      booking.reload();
    } catch (err) {
      setChangeError(err);
    } finally {
      setSending(false);
    }
  }

  if (booking.error && !b) {
    return (
      <>
        <h1>Booking {bookingNumber}</h1>
        <ErrorList error={booking.error} />
        <Link to="/booking">Try another number</Link>
      </>
    );
  }
  if (!b) return <p className="muted">Loading…</p>;

  const pending = b.changeRequests.find((c) => c.status === 'PENDING');

  return (
    <>
      <div className="title-row">
        <h1>Booking {bookingNo(b.bookingNumber)} <Status value={b.status} /></h1>
      </div>

      <section className="card">
        <dl className="facts">
          <dt>Traveler</dt><dd>{b.travelerName}</dd>
          <dt>Flight</dt><dd>{b.flight.flightNumber} ({b.flight.airline}), lands {b.flight.to} {dateTime(b.flight.arrivalLocal)}</dd>
          <dt>Pickup</dt><dd><strong>{dateTime(b.pickupAt)}</strong> <span className="muted">(car busy until {dateTime(b.busyUntil)})</span></dd>
          <dt>Hotel</dt><dd>{b.hotel.name}, {b.hotel.city} / {b.hotel.area}</dd>
          <dt>Supplier</dt><dd>{b.supplier.name} ({b.supplier.companyId})</dd>
          <dt>Car</dt><dd>{b.vehicle.vehicleId} · {b.vehicle.type} · {b.vehicle.seats} seats</dd>
          <dt>Party</dt><dd>{people(b.adults, b.childAges)} · {bags(b.largeBags, b.smallBags)}</dd>
          <dt>Price</dt><dd><strong>{inr(b.priceInr)}</strong></dd>
        </dl>
      </section>

      <form className="card" onSubmit={sendChange} noValidate>
        <h2>Change flight or pickup</h2>
        <p className="muted">The booking changes only after {b.supplier.name} accepts.</p>
        {pending && <div className="banner">A change request is waiting for the supplier (pickup {dateTime(pending.newPickupAt)}).</div>}
        <div className="grid-2">
          <label>
            New flight <span className="muted hint">empty = keep {b.flight.flightNumber}</span>
            <select value={newFlightId} onChange={(e) => setNewFlightId(e.target.value)}>
              <option value="">Keep current flight</option>
              {flightGroups.map(([airport, list]) => (
                <optgroup key={airport} label={airport}>
                  {list.map((f) => (
                    <option key={f.flightId} value={f.flightId}>
                      {f.flightNumber}, lands {dateTime(f.arrivalLocal)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            New pickup <span className="muted hint">empty = landing + 60 min</span>
            <input type="datetime-local" value={newPickupAt} onChange={(e) => setNewPickupAt(e.target.value)} />
          </label>
        </div>
        <ErrorList error={changeError} />
        {sent && <div className="banner success">Change request sent. Waiting for the supplier.</div>}
        <button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send change request'}</button>
      </form>

      {b.changeRequests.length > 0 && (
        <section className="card">
          <h2>Change requests</h2>
          <ul className="list">
            {b.changeRequests.map((c) => (
              <li key={c.changeId}>
                <div className="row-main">
                  <div><strong>#{c.changeId}</strong> <Status value={c.status} /> {c.decidedBy && <span className="muted small">by {c.decidedBy}</span>}</div>
                  <div>
                    {c.oldFlightId} {timeOnly(c.oldPickupAt)} → {c.newFlightId} <strong>{dateTime(c.newPickupAt)}</strong>
                  </div>
                  {c.reason && <div className="muted">Reason: {c.reason}</div>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
