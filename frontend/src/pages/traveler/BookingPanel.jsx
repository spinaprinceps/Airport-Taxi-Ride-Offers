import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useLoad } from '../../useLoad.js';
import { POLL_MS, bags, dateTime, inr, party } from '../../format.js';
import ErrorBox from '../../components/ErrorBox.jsx';
import { Loading, Status, Window } from '../../components/Bits.jsx';

// GET /api/bookings/:bookingNumber, and POST …/change-requests to ask for a new flight and/or pickup.
// Shown inside the traveler dashboard, under "Find my booking".
export default function BookingPanel({ bookingNumber, confirmed, onClose }) {
  const booking = useLoad(() => api.getBooking(bookingNumber), [bookingNumber], POLL_MS);
  const flights = useLoad(() => api.flights(), []);

  const [newFlightId, setNewFlightId] = useState('');
  const [newPickupAt, setNewPickupAt] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const flightName = useMemo(() => {
    const byId = new Map((flights.data ?? []).map((f) => [f.flightId, f.flightNumber]));
    return (id) => byId.get(id) ?? id;
  }, [flights.data]);

  const close = <button type="button" onClick={onClose}>Close</button>;

  if (!booking.data) {
    return (
      <div className="panel">
        <div className="title-row"><h3>Booking {bookingNumber}</h3>{close}</div>
        {booking.error ? <ErrorBox error={booking.error} /> : <Loading />}
      </div>
    );
  }

  const b = booking.data;
  const sameAirport = (flights.data ?? []).filter((f) => f.to === b.flight.to && f.flightId !== b.flight.flightId);
  const otherAirports = (flights.data ?? []).filter((f) => f.to !== b.flight.to);
  const pending = b.changeRequests.some((c) => c.status === 'PENDING');
  const latest = b.changeRequests.find((c) => c.status !== 'PENDING');
  const option = (f) => (
    <option key={f.flightId} value={f.flightId}>
      {f.flightNumber} · {f.airline} · {f.from} → {f.to} · lands {dateTime(f.arrivalLocal)}
    </option>
  );

  async function submit(ev) {
    ev.preventDefault();
    setSending(true);
    setError(null);
    try {
      await api.submitChange(b.bookingNumber, { newFlightId: newFlightId || null, newPickupAt: newPickupAt || null });
      setNewFlightId('');
      setNewPickupAt('');
    } catch (err) {
      setError(err);
    }
    await booking.reload();
    setSending(false);
  }

  return (
    <div className="panel">
      <div className="title-row">
        <h3>Booking {b.bookingNumber} <Status value={b.status} /></h3>
        {close}
      </div>
      <ErrorBox error={booking.error} />
      {confirmed ? (
        <div className="banner ok confirm">
          Booking confirmed. Your booking number is <strong className="number">{b.bookingNumber}</strong>. Keep it:
          enter it in “Find my booking” to see this summary again.
        </div>
      ) : null}

      <dl className="facts">
        <div><dt>Traveler</dt><dd>{b.travelerName}</dd></div>
        <div>
          <dt>Flight</dt>
          <dd>{b.flight.flightNumber} · {b.flight.airline} → {b.flight.to}, lands {dateTime(b.flight.arrivalLocal)}</dd>
        </div>
        <div><dt>Hotel</dt><dd>{b.hotel.name} · {b.hotel.city} / {b.hotel.area}</dd></div>
        <div><dt>Pickup</dt><dd>{dateTime(b.pickupAt)}</dd></div>
        <div><dt>Car busy</dt><dd><Window from={b.pickupAt} until={b.busyUntil} /></dd></div>
        <div><dt>Supplier</dt><dd>{b.supplier.name} ({b.supplier.companyId})</dd></div>
        <div><dt>Car</dt><dd>{b.vehicle.vehicleId} · {b.vehicle.type} · {b.vehicle.seats} seats</dd></div>
        <div><dt>Price</dt><dd><strong>{inr(b.priceInr)}</strong></dd></div>
        <div><dt>Party</dt><dd>{party(b)}</dd></div>
        <div><dt>Bags</dt><dd>{bags(b)}</dd></div>
      </dl>

      {b.shared ? (
        <div className="banner info spaced">
          <span className="status status-shared">SHARED</span> Shared ride with 1 other party
          {b.shared.otherPartiesBooked > 0 ? '. The other family has booked too.' : '. The other family has not booked yet.'}
          {' '}A shared ride cannot change its flight or pickup, because it would move the other family too.
        </div>
      ) : null}

      {b.shared ? null : <>
      <h3 className="spaced">Change request</h3>
      <p className="muted">
        Choose a new flight, a new pickup time, or both. A new flight alone sets the pickup to its landing + 60 min.
        The booking changes only when the supplier accepts.
      </p>
      {pending ? <div className="banner info">A change request is waiting for the supplier's decision.</div> : null}
      {!pending && latest ? (
        <div className={`banner ${latest.status === 'ACCEPTED' ? 'ok' : 'warn'}`}>
          Your last change request was <strong>{latest.status.toLowerCase()}</strong>
          {latest.decidedBy ? ` by ${latest.decidedBy}` : ''}{latest.reason ? `: ${latest.reason}` : '.'}
        </div>
      ) : null}
      <form className="form" onSubmit={submit} noValidate>
        <div className="grid-2">
          <label>
            New flight
            <select value={newFlightId} onChange={(ev) => setNewFlightId(ev.target.value)}>
              <option value="">Keep {b.flight.flightNumber}</option>
              <optgroup label={`Lands at ${b.flight.to}`}>{sameAirport.map(option)}</optgroup>
              <optgroup label="Other airports">{otherAirports.map(option)}</optgroup>
            </select>
          </label>
          <label>
            New pickup time
            <input type="datetime-local" value={newPickupAt} onChange={(ev) => setNewPickupAt(ev.target.value)} />
            <small className="muted">
              Now {dateTime(b.pickupAt)}.{' '}
              <button type="button" className="link" onClick={() => setNewPickupAt(b.pickupAt)}>Start from this time</button>
            </small>
          </label>
        </div>
        <ErrorBox error={error ?? flights.error} />
        <div className="actions">
          <button className="primary" type="submit" disabled={sending}>
            {sending ? 'Sending…' : 'Send change request'}
          </button>
        </div>
      </form>
      </>}

      {b.changeRequests.length > 0 ? (
        <div className="table-wrap spaced">
          <table>
            <thead>
              <tr><th>#</th><th>Flight</th><th>Pickup</th><th>Result</th><th>Decided</th></tr>
            </thead>
            <tbody>
              {b.changeRequests.map((c) => (
                <tr key={c.changeId}>
                  <td>{c.changeId}</td>
                  <td>
                    {c.oldFlightId === c.newFlightId
                      ? flightName(c.oldFlightId)
                      : <>{flightName(c.oldFlightId)} → <strong>{flightName(c.newFlightId)}</strong></>}
                  </td>
                  <td>{dateTime(c.oldPickupAt)} → <strong>{dateTime(c.newPickupAt)}</strong></td>
                  <td><Status value={c.status} /></td>
                  <td>
                    {c.decidedBy ? `by ${c.decidedBy}` : '—'}
                    {c.reason ? <div className="muted">{c.reason}</div> : null}
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
