import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function BookingLookup() {
  const [number, setNumber] = useState('');
  const navigate = useNavigate();

  function go(e) {
    e.preventDefault();
    // Spaces and dashes are fine; the backend strips them.
    navigate(`/booking/${encodeURIComponent(number.trim() || '0')}`);
  }

  return (
    <>
      <h1>Find a booking</h1>
      <form className="card inline-form" onSubmit={go}>
        <label>
          Booking number
          <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="10 digits" inputMode="numeric" />
        </label>
        <button type="submit">Open</button>
      </form>
    </>
  );
}
