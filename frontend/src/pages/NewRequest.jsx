import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api.js';
import { dateOnly, dateTime, inr, timeOnly } from '../format.js';
import ErrorList from '../components/ErrorList.jsx';

// Slice 1: choose airport, date, flight and hotel, then see the suggested price range.
// The picker lists every hotel on purpose: a wrong pairing must show the backend's R1 message.
export default function NewRequest() {
  const [flights, setFlights] = useState(null);
  const [hotels, setHotels] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [airport, setAirport] = useState('');
  const [date, setDate] = useState('');
  const [flightId, setFlightId] = useState('');
  const [hotelId, setHotelId] = useState('');

  const [range, setRange] = useState(null);
  const [rangeError, setRangeError] = useState(null);
  const [rangeLoading, setRangeLoading] = useState(false);

  useEffect(() => {
    Promise.all([get('/api/flights'), get('/api/hotels')])
      .then(([f, h]) => { setFlights(f); setHotels(h); })
      .catch(setLoadError);
  }, []);

  const airports = useMemo(
    () => (flights ? [...new Set(flights.map((f) => f.to))].sort() : []),
    [flights],
  );
  const dates = useMemo(
    () => (flights && airport
      ? [...new Set(flights.filter((f) => f.to === airport).map((f) => f.arrivalLocal.slice(0, 10)))].sort()
      : []),
    [flights, airport],
  );
  const dayFlights = useMemo(
    () => (flights && airport && date
      ? flights.filter((f) => f.to === airport && f.arrivalLocal.startsWith(date))
      : []),
    [flights, airport, date],
  );
  const hotelsByCity = useMemo(() => {
    const groups = new Map();
    for (const h of hotels ?? []) {
      if (!groups.has(h.city)) groups.set(h.city, []);
      groups.get(h.city).push(h);
    }
    return [...groups.entries()];
  }, [hotels]);

  // Ask the backend for the range whenever both a flight and a hotel are chosen.
  useEffect(() => {
    setRange(null);
    setRangeError(null);
    if (!flightId || !hotelId) return undefined;
    let current = true;
    setRangeLoading(true);
    get(`/api/price-range?flightId=${encodeURIComponent(flightId)}&hotelId=${encodeURIComponent(hotelId)}`)
      .then((r) => current && setRange(r))
      .catch((e) => current && setRangeError(e))
      .finally(() => current && setRangeLoading(false));
    return () => { current = false; };
  }, [flightId, hotelId]);

  function changeAirport(value) {
    setAirport(value);
    setDate('');
    setFlightId('');
  }
  function changeDate(value) {
    setDate(value);
    setFlightId('');
  }

  if (loadError) {
    return (
      <>
        <h1>New request</h1>
        <ErrorList error={loadError} />
      </>
    );
  }
  if (!flights || !hotels) return <p className="muted">Loading flights and hotels…</p>;

  return (
    <>
      <h1>New request</h1>

      <section className="card">
        <h2>1. Flight and hotel</h2>

        <label>
          Arrival airport
          <select value={airport} onChange={(e) => changeAirport(e.target.value)}>
            <option value="">Choose an airport</option>
            {airports.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>

        <label>
          Landing date
          <select value={date} onChange={(e) => changeDate(e.target.value)} disabled={!airport}>
            <option value="">{airport ? 'Choose a date' : 'Choose an airport first'}</option>
            {dates.map((d) => <option key={d} value={d}>{dateOnly(d)} {d.slice(0, 4)}</option>)}
          </select>
        </label>

        <label>
          Flight
          <select value={flightId} onChange={(e) => setFlightId(e.target.value)} disabled={!date}>
            <option value="">{date ? 'Choose a flight' : 'Choose a date first'}</option>
            {dayFlights.map((f) => (
              <option key={f.flightId} value={f.flightId}>
                {f.flightNumber}, lands {timeOnly(f.arrivalLocal)} (from {f.from})
              </option>
            ))}
          </select>
        </label>

        <label>
          Hotel
          <select value={hotelId} onChange={(e) => setHotelId(e.target.value)}>
            <option value="">Choose a hotel</option>
            {hotelsByCity.map(([city, list]) => (
              <optgroup key={city} label={city}>
                {list.map((h) => <option key={h.hotelId} value={h.hotelId}>{h.name} · {h.area}</option>)}
              </optgroup>
            ))}
          </select>
        </label>

        {rangeLoading && <p className="muted">Checking the price range…</p>}
        {range && (
          <div className="banner" role="status">
            Suggested price <strong>{inr(range.priceMinInr)} – {inr(range.priceMaxInr)}</strong>
            {' · '}earliest pickup <strong>{dateTime(range.earliestPickupAt)}</strong>
            {' · '}drive {range.driveMinutes} min
            <div className="muted">{range.airport} → {range.city} / {range.area} · {range.distanceKm} km</div>
          </div>
        )}
        <ErrorList error={rangeError} />
      </section>
    </>
  );
}
