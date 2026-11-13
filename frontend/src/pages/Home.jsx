import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useLoad } from '../useLoad.js';
import ErrorBox from '../components/ErrorBox.jsx';
import { Loading } from '../components/Bits.jsx';

// Pick a dashboard: traveler (by name) or one of the suppliers (from GET /api/suppliers).
export default function Home() {
  const navigate = useNavigate();
  const suppliers = useLoad(() => api.suppliers(), []);
  const [name, setName] = useState('');

  const go = (path) => (ev) => {
    ev.preventDefault();
    navigate(path());
  };

  return (
    <>
      <h1>Who are you?</h1>
      <div className="grid-2">
        <section className="card">
          <h2>Traveler</h2>
          <p className="muted">
            Post a taxi request, ask suppliers, compare the taxis offered, book one, find your booking and change it.
          </p>
          <form className="row" onSubmit={go(() => `/traveler/${encodeURIComponent(name.trim())}`)}>
            <input value={name} onChange={(ev) => setName(ev.target.value)} placeholder="Your name, e.g. A. Menon" required />
            <button className="primary" type="submit">Open traveler dashboard</button>
          </form>
        </section>

        <section className="card">
          <h2>Taxi supplier</h2>
          <p className="muted">See the requests you can serve, offer a car, decide change requests.</p>
          <ErrorBox error={suppliers.error} />
          {suppliers.loading && !suppliers.data ? <Loading /> : null}
          <ul className="pick-list">
            {(suppliers.data ?? []).map((s) => (
              <li key={s.companyId}>
                <Link to={`/supplier/${encodeURIComponent(s.companyId)}`}>
                  <strong>{s.name}</strong>
                  <span className="muted">
                    {s.companyId} · {s.airports.join(', ')} · {s.serviceFrom}–{s.serviceUntil} · ★ {s.rating}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
