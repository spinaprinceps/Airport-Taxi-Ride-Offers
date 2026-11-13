import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { listFlights, listHotels, priceRange } from '../../api/catalog.js';
import { createRequest } from '../../api/requests.js';
import { dateOnly, dateTime, inr, timeOnly } from '../../format.js';
import ErrorList from '../../components/ErrorList.jsx';
import FieldError from '../../components/FieldError.jsx';

const CAR_TYPES = ['HATCHBACK', 'SEDAN', 'SUV', 'BUS'];

function newKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// "" -> null (backend answers 400), anything else is sent as typed. The frontend never blocks a value.
const toInt = (s) => (s.trim() === '' ? null : Number(s));
const toAges = (s) => (s.trim() === '' ? [] : s.split(',').map((x) => toInt(x)));

// S1 + S2: choose airport, date, flight and hotel, see the suggested range, then post the request.
// The hotel picker lists every hotel on purpose: a wrong pairing must show the backend's R1 message.
export default function NewRequest() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [flights, setFlights] = useState(null);
  const [hotels, setHotels] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [airport, setAirport] = useState('');
  const [date, setDate] = useState('');
  const [form, setForm] = useState({
    travelerName: params.get('name') ?? '',
    flightId: '', hotelId: '',
    adults: '1', childAges: '', largeBags: '0', smallBags: '0',
    pickupAt: '', carType: '', priceInr: '',
  });
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const [range, setRange] = useState(null);
  const [rangeError, setRangeError] = useState(null);
  const [rangeLoading, setRangeLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  // One key per form: a double click or a retry after a lost response returns the same request (200).
  const idempotencyKey = useRef(newKey());

  useEffect(() => {
    Promise.all([listFlights(), listHotels()])
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
  const { flightId, hotelId } = form;
  useEffect(() => {
    setRange(null);
    setRangeError(null);
    if (!flightId || !hotelId) return undefined;
    let current = true;
    setRangeLoading(true);
    priceRange(flightId, hotelId)
      .then((r) => current && setRange(r))
      .catch((e) => current && setRangeError(e))
      .finally(() => current && setRangeLoading(false));
    return () => { current = false; };
  }, [flightId, hotelId]);

  function changeAirport(value) {
    setAirport(value);
    setDate('');
    setForm((f) => ({ ...f, flightId: '' }));
  }
  function changeDate(value) {
    setDate(value);
    setForm((f) => ({ ...f, flightId: '' }));
  }

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const body = {
      travelerName: form.travelerName,
      flightId: form.flightId,
      hotelId: form.hotelId,
      adults: toInt(form.adults),
      childAges: toAges(form.childAges),
      largeBags: toInt(form.largeBags),
      smallBags: toInt(form.smallBags),
      pickupAt: form.pickupAt || null,
      carType: form.carType || null,
      priceInr: toInt(form.priceInr),
    };
    try {
      const view = await createRequest(body, idempotencyKey.current);
      const name = encodeURIComponent(view.request.travelerName);
      navigate(`/traveler/requests/${encodeURIComponent(view.request.requestId)}?name=${name}`, {
        state: { justPosted: true },
      });
    } catch (err) {
      setSubmitError(err);
      setSubmitting(false);
    }
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

  const myRequestsLink = form.travelerName.trim()
    ? `/traveler/requests?name=${encodeURIComponent(form.travelerName.trim())}`
    : '/traveler/requests';

  return (
    <>
      <div className="page-head">
        <h1>New request</h1>
        <Link to={myRequestsLink}>My requests</Link>
      </div>

      <form onSubmit={submit} noValidate>
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
            <select value={form.flightId} onChange={set('flightId')} disabled={!date}>
              <option value="">{date ? 'Choose a flight' : 'Choose a date first'}</option>
              {dayFlights.map((f) => (
                <option key={f.flightId} value={f.flightId}>
                  {f.flightNumber}, lands {timeOnly(f.arrivalLocal)} (from {f.from})
                </option>
              ))}
            </select>
            <FieldError error={submitError} field="flightId" />
          </label>

          <label>
            Hotel
            <select value={form.hotelId} onChange={set('hotelId')}>
              <option value="">Choose a hotel</option>
              {hotelsByCity.map(([city, list]) => (
                <optgroup key={city} label={city}>
                  {list.map((h) => <option key={h.hotelId} value={h.hotelId}>{h.name} · {h.area}</option>)}
                </optgroup>
              ))}
            </select>
            <FieldError error={submitError} field="hotelId" />
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

        <section className="card">
          <h2>2. Who is travelling</h2>

          <label>
            Traveler name
            <input value={form.travelerName} onChange={set('travelerName')} autoComplete="name" />
            <FieldError error={submitError} field="travelerName" />
          </label>

          <div className="grid-3">
            <label>
              Adults
              <input type="number" inputMode="numeric" value={form.adults} onChange={set('adults')} />
              <FieldError error={submitError} field="adults" />
            </label>
            <label>
              Large bags
              <input type="number" inputMode="numeric" value={form.largeBags} onChange={set('largeBags')} />
              <FieldError error={submitError} field="largeBags" />
            </label>
            <label>
              Small bags
              <input type="number" inputMode="numeric" value={form.smallBags} onChange={set('smallBags')} />
              <FieldError error={submitError} field="smallBags" />
            </label>
          </div>

          <label>
            Child ages <span className="hint">comma separated, leave empty for none</span>
            <input value={form.childAges} onChange={set('childAges')} placeholder="e.g. 6, 9" inputMode="numeric" />
            <FieldError error={submitError} field="childAges" />
          </label>
        </section>

        <section className="card">
          <h2>3. Pickup and price</h2>

          <div className="grid-2">
            <label>
              Pickup time <span className="hint">empty = earliest{range ? ` (${dateTime(range.earliestPickupAt)})` : ''}</span>
              <input type="datetime-local" value={form.pickupAt} onChange={set('pickupAt')} />
              <FieldError error={submitError} field="pickupAt" />
            </label>
            <label>
              Car type
              <select value={form.carType} onChange={set('carType')}>
                <option value="">Any</option>
                {CAR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <FieldError error={submitError} field="carType" />
            </label>
          </div>

          <label>
            Your price (₹) {range && <span className="hint">suggested {inr(range.priceMinInr)} – {inr(range.priceMaxInr)}</span>}
            <input
              type="number" inputMode="numeric" value={form.priceInr} onChange={set('priceInr')}
              placeholder={range ? String(range.priceMinInr) : ''}
            />
            <FieldError error={submitError} field="priceInr" />
          </label>

          <ErrorList error={submitError} />

          <button type="submit" disabled={submitting}>
            {submitting ? 'Posting…' : 'Post request'}
          </button>
        </section>
      </form>
    </>
  );
}
