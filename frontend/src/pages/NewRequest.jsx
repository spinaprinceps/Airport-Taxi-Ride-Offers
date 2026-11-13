import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../api.js';
import { dateOnly, dateTime, inr, timeOnly } from '../format.js';
import ErrorList from '../components/ErrorList.jsx';
import { newKey, recall, remember } from '../useLoad.js';

const CAR_TYPES = ['HATCHBACK', 'SEDAN', 'SUV', 'BUS'];

// Numbers are sent as typed; the backend decides (R1-R3). Empty -> null so the shape error is shown.
const num = (s) => (String(s).trim() === '' ? null : Number(s));
function parseAges(s) {
  const parts = String(s).split(',').map((x) => x.trim()).filter(Boolean);
  return parts.map((x) => Number(x));
}

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

  const navigate = useNavigate();
  const [travelerName, setTravelerName] = useState(recall('travelerName'));
  const [adults, setAdults] = useState('1');
  const [childAges, setChildAges] = useState('');
  const [largeBags, setLargeBags] = useState('1');
  const [smallBags, setSmallBags] = useState('1');
  const [pickupAt, setPickupAt] = useState('');
  const [carType, setCarType] = useState('');
  const [price, setPrice] = useState('');
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [idemKey, setIdemKey] = useState(newKey);

  // Any edit makes it a new request (new idempotency key).
  useEffect(() => { setIdemKey(newKey()); },
    [travelerName, flightId, hotelId, adults, childAges, largeBags, smallBags, pickupAt, carType, price]);

  async function submit(e) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    remember('travelerName', travelerName.trim());
    try {
      const body = {
        travelerName,
        flightId,
        hotelId,
        adults: num(adults),
        childAges: parseAges(childAges),
        largeBags: num(largeBags),
        smallBags: num(smallBags),
        pickupAt: pickupAt || null,
        carType: carType || null,
        priceInr: num(price),
      };
      const res = await post('/api/requests', body, { 'Idempotency-Key': idemKey });
      navigate(`/traveler/requests/${encodeURIComponent(res.request.requestId)}`);
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  }

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
      .then((r) => {
        if (!current) return;
        setRange(r);
        // Suggest the middle of the range; the traveler can type anything.
        setPrice((p) => (p === '' ? String(Math.round((r.priceMinInr + r.priceMaxInr) / 2 / 100) * 100) : p));
      })
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

      <form className="card" onSubmit={submit} noValidate>
        <h2>2. Who is travelling</h2>

        <label>
          Your name
          <input value={travelerName} onChange={(e) => setTravelerName(e.target.value)} placeholder="e.g. Menon" />
        </label>

        <div className="grid-2">
          <label>
            Adults
            <input type="number" inputMode="numeric" value={adults} onChange={(e) => setAdults(e.target.value)} />
          </label>
          <label>
            Child ages <span className="muted hint">comma separated, e.g. 5, 9</span>
            <input value={childAges} onChange={(e) => setChildAges(e.target.value)} placeholder="none" />
          </label>
          <label>
            Large bags
            <input type="number" inputMode="numeric" value={largeBags} onChange={(e) => setLargeBags(e.target.value)} />
          </label>
          <label>
            Small bags
            <input type="number" inputMode="numeric" value={smallBags} onChange={(e) => setSmallBags(e.target.value)} />
          </label>
        </div>

        <h2>3. Pickup and price</h2>
        <div className="grid-2">
          <label>
            Pickup time <span className="muted hint">empty = earliest{range ? ` (${dateTime(range.earliestPickupAt)})` : ''}</span>
            <input type="datetime-local" value={pickupAt} onChange={(e) => setPickupAt(e.target.value)} />
          </label>
          <label>
            Car type
            <select value={carType} onChange={(e) => setCarType(e.target.value)}>
              <option value="">Any</option>
              {CAR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            Your price (₹)
            <input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
        </div>

        <ErrorList error={submitError} />
        <button type="submit" disabled={submitting}>{submitting ? 'Posting…' : 'Post request'}</button>
      </form>
    </>
  );
}
