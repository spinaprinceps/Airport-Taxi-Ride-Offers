import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api.js';
import ErrorList from '../components/ErrorList.jsx';

export default function PersonaPicker() {
  const [suppliers, setSuppliers] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    get('/api/suppliers').then(setSuppliers).catch(setError);
  }, []);

  return (
    <>
      <h1>Who are you?</h1>

      <section className="card">
        <h2>Traveler</h2>
        <p className="muted">Post a ride request and book a taxi.</p>
        <Link to="/traveler" className="btn">Continue as traveler</Link>
      </section>

      <section className="card">
        <h2>Taxi supplier</h2>
        <p className="muted">See requests you can serve and assign a car.</p>
        <ErrorList error={error} />
        {!suppliers && !error && <p className="muted">Loading suppliers…</p>}
        {suppliers && (
          <ul className="supplier-list">
            {suppliers.map((s) => (
              <li key={s.companyId}>
                <Link to={`/supplier/${s.companyId}`} className="supplier-link">
                  <span className="supplier-name">{s.name}</span>
                  <span className="muted">
                    {s.companyId} · {s.airports.join(', ')} · {s.serviceFrom}–{s.serviceUntil} · ★ {s.rating}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
