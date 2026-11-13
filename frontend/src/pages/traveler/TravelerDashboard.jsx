import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import MyRequests from './MyRequests.jsx';
import NewRequest from './NewRequest.jsx';
import BookingPanel from './BookingPanel.jsx';
import { scrollToId } from '../../components/Bits.jsx';

const TABS = [['find', 'Find my booking'], ['new', 'New request'], ['requests', 'My requests']];

// The traveler's dashboard, one tab at a time:
// find my booking (+ booking summary and change request), the request form, and every request with
// its suppliers and offers inline. ?tab= picks the tab, ?booking= opens a booking, ?request= opens a request.
export default function TravelerDashboard() {
  const { name } = useParams();
  const [params, setParams] = useSearchParams();
  const booking = params.get('booking');
  const confirmed = params.get('confirmed') === '1';
  const focus = params.get('request');
  const requested = params.get('tab');
  const tab = TABS.some(([id]) => id === requested) ? requested : (focus && !booking ? 'requests' : 'find');
  const [number, setNumber] = useState(booking ?? '');

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  }

  const openBooking = (n, isNew = false) => {
    setNumber(n);
    update({ tab: 'find', booking: n, confirmed: isNew ? '1' : null });
  };

  useEffect(() => {
    if (booking && tab === 'find') scrollToId('find');
  }, [booking, confirmed, tab]);

  function find(ev) {
    ev.preventDefault();
    if (number.trim()) openBooking(number.trim());
  }

  return (
    <>
      <h1>Traveler dashboard</h1>
      <p className="muted">Signed in as {name}. No login: this name only filters your requests.</p>
      <nav className="jump" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={id}
            className={tab === id ? 'active' : undefined}
            onClick={() => update({ tab: id })}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'find' ? (
      <section id="find" className="card" role="tabpanel">
        <h2>Find my booking</h2>
        <p className="muted">Enter the 10-digit booking number to see the summary and to ask for a change.</p>
        <form className="row find" onSubmit={find}>
          <input
            value={number}
            onChange={(ev) => setNumber(ev.target.value)}
            placeholder="10-digit booking number"
            aria-label="Booking number to find"
          />
          <button className="primary" type="submit">Find booking</button>
        </form>
        {booking ? (
          <BookingPanel
            bookingNumber={booking}
            confirmed={confirmed}
            onClose={() => { setNumber(''); update({ booking: null, confirmed: null }); }}
          />
        ) : null}
      </section>
      ) : null}

      {tab === 'new' ? (
        <section id="new" role="tabpanel">
          <h2>New request</h2>
          <NewRequest name={name} onCreated={(requestId) => update({ tab: 'requests', request: requestId })} />
        </section>
      ) : null}

      {tab === 'requests' ? (
        <section id="requests" role="tabpanel">
          <h2>My requests</h2>
          <MyRequests name={name} focus={focus} onOpenBooking={openBooking} />
        </section>
      ) : null}
    </>
  );
}
