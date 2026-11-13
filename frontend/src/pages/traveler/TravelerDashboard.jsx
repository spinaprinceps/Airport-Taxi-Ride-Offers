import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import MyRequests from './MyRequests.jsx';
import NewRequest from './NewRequest.jsx';
import BookingPanel from './BookingPanel.jsx';
import { JumpNav, scrollToId } from '../../components/Bits.jsx';

// The traveler's whole dashboard on one page:
// find my booking (+ booking summary and change request), the request form, and every request with
// its suppliers and offers inline. ?booking= opens a booking, ?request= opens a request.
export default function TravelerDashboard() {
  const { name } = useParams();
  const [params, setParams] = useSearchParams();
  const booking = params.get('booking');
  const confirmed = params.get('confirmed') === '1';
  const focus = params.get('request');
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
    update({ booking: n, confirmed: isNew ? '1' : null });
  };

  useEffect(() => {
    if (booking) scrollToId('find');
  }, [booking, confirmed]);

  function find(ev) {
    ev.preventDefault();
    if (number.trim()) openBooking(number.trim());
  }

  return (
    <>
      <h1>Traveler dashboard</h1>
      <p className="muted">Signed in as {name}. No login: this name only filters your requests.</p>
      <JumpNav items={[['find', 'Find my booking'], ['new', 'New request'], ['requests', 'My requests']]} />

      <section id="find" className="card">
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

      <section id="new">
        <h2>New request</h2>
        <NewRequest name={name} onCreated={(requestId) => update({ request: requestId })} />
      </section>

      <section id="requests">
        <h2>My requests</h2>
        <MyRequests name={name} focus={focus} onOpenBooking={openBooking} />
      </section>
    </>
  );
}
