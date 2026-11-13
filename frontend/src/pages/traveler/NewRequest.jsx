import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useLoad } from '../../useLoad.js';
import { CAR_TYPES, dateTime, inr, toAges, toNumber } from '../../format.js';
import ErrorBox from '../../components/ErrorBox.jsx';

const EMPTY = {
  flightId: '', hotelId: '', adults: '1', childAges: '', largeBags: '0', smallBags: '0',
  pickupAt: '', carType: '', priceInr: '', shareOk: false,
};

// POST /api/requests. The form sends what was typed; the backend applies R1–R3 and its answer is shown as is.
// On success the form is cleared and onCreated(requestId) opens the new request in "My requests".
export default function NewRequest({ name, onCreated }) {
  const flights = useLoad(() => api.flights(), []);
  const hotels = useLoad(() => api.hotels(), []);
  

  const [form, setForm] = useState(EMPTY);
  const [created, setCreated] = useState(null);
  const set = (field) => (ev) => setForm((f) => ({ ...f, [field]: ev.target.value }));

  const [airport, setAirport] = useState('');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState({ data: null, error: null });
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());

  const airports = useMemo(() => [...new Set((flights.data ?? []).map((f) => f.to))].sort(), [flights.data]);
  const shownFlights = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (flights.data ?? []).filter((f) =>
      (!airport || f.to === airport) &&
      (!q || `${f.flightNumber} ${f.airline} ${f.from} ${f.to} ${f.flightId}`.toLowerCase().includes(q)));
  }, [flights.data, airport, search]);
  const hotelsByCity = useMemo(() => {
    const groups = new Map();
    for (const h of hotels.data ?? []) groups.set(h.city, [...(groups.get(h.city) ?? []), h]);
    return [...groups];
  }, [hotels.data]);

  // GET /api/price-range as soon as a flight and a hotel are chosen.
  useEffect(() => {
    if (!form.flightId || !form.hotelId) {
      setRange({ data: null, error: null });
      return undefined;
    }
    let current = true;
    api.priceRange(form.flightId, form.hotelId)
      .then((data) => current && setRange({ data, error: null }))
      .catch((err) => current && setRange({ data: null, error: err }));
    return () => { current = false; };
  }, [form.flightId, form.hotelId]);

  async function submit(ev) {
    ev.preventDefault();
    setSending(true);
    setError(null);
    setCreated(null);
    try {
      const result = await api.createRequest({
        travelerName: name,
        flightId: form.flightId,
        hotelId: form.hotelId,
        adults: toNumber(form.adults),
        childAges: toAges(form.childAges),
        largeBags: toNumber(form.largeBags),
        smallBags: toNumber(form.smallBags),
        pickupAt: form.pickupAt || null,
        carType: form.carType || null,
        priceInr: toNumber(form.priceInr),
        shareOk: form.shareOk,
      }, idempotencyKey.current);
      idempotencyKey.current = crypto.randomUUID(); // the next post is a new request
      setForm(EMPTY);
      setCreated(result.request.requestId);
      onCreated(result.request.requestId);
    } catch (err) {
      setError(err);
    }
    setSending(false);
  }

  const bad = (field) => (error?.violations.some((x) => x.field === field) ? true : undefined);
  const r = range.data;

  return (
    <>
      <ErrorBox error={flights.error ?? hotels.error} />

      <form className="card form" onSubmit={submit} noValidate>
        <fieldset>
          <legend>Arrival flight</legend>
          <div className="row">
            <select value={airport} onChange={(ev) => setAirport(ev.target.value)} aria-label="Arrival airport">
              <option value="">All airports</option>
              {airports.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <input value={search} onChange={(ev) => setSearch(ev.target.value)} placeholder="Search flight number or airline" />
          </div>
          <select value={form.flightId} onChange={set('flightId')} aria-invalid={bad('flightId')} aria-label="Flight">
            <option value="">Choose a flight ({shownFlights.length})</option>
            {shownFlights.map((f) => (
              <option key={f.flightId} value={f.flightId}>
                {f.flightNumber} · {f.airline} · {f.from} → {f.to} · lands {dateTime(f.arrivalLocal)}
              </option>
            ))}
          </select>
        </fieldset>

        <label>
          Hotel
          <select value={form.hotelId} onChange={set('hotelId')} aria-invalid={bad('hotelId')}>
            <option value="">Choose a hotel</option>
            {hotelsByCity.map(([city, list]) => (
              <optgroup key={city} label={city}>
                {list.map((h) => <option key={h.hotelId} value={h.hotelId}>{h.name} — {h.area}</option>)}
              </optgroup>
            ))}
          </select>
        </label>

        {range.error ? <ErrorBox error={range.error} /> : null}
        {r ? (
          <div className="hint-box">
            <strong>{r.airport} → {r.city} / {r.area}</strong>: {r.distanceKm} km, {r.driveMinutes} min drive.
            Suggested price <strong>{inr(r.priceMinInr)} – {inr(r.priceMaxInr)}</strong>.
            Lands {dateTime(r.landingAt)}; earliest pickup <strong>{dateTime(r.earliestPickupAt)}</strong>.
          </div>
        ) : null}

        <div className="grid-4">
          <label>
            Adults
            <input inputMode="numeric" value={form.adults} onChange={set('adults')} aria-invalid={bad('adults')} />
          </label>
          <label>
            Child ages
            <input value={form.childAges} onChange={set('childAges')} placeholder="e.g. 5, 9" aria-invalid={bad('childAges')} />
          </label>
          <label>
            Large bags
            <input inputMode="numeric" value={form.largeBags} onChange={set('largeBags')} aria-invalid={bad('largeBags')} />
          </label>
          <label>
            Small bags
            <input inputMode="numeric" value={form.smallBags} onChange={set('smallBags')} aria-invalid={bad('smallBags')} />
          </label>
        </div>

        <div className="grid-3">
          <label>
            Pickup time
            <input type="datetime-local" value={form.pickupAt} onChange={set('pickupAt')} aria-invalid={bad('pickupAt')} />
            <small className="muted">
              Optional. Empty = earliest pickup{r ? ` (${dateTime(r.earliestPickupAt)})` : ''}.{' '}
              {r ? (
                <button type="button" className="link" onClick={() => setForm((f) => ({ ...f, pickupAt: r.earliestPickupAt }))}>
                  Fill it in
                </button>
              ) : null}
            </small>
          </label>
          <label>
            Car type
            <select value={form.carType} onChange={set('carType')} aria-invalid={bad('carType')}>
              <option value="">Any</option>
              {CAR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            Price you offer (₹)
            <input inputMode="numeric" value={form.priceInr} onChange={set('priceInr')} aria-invalid={bad('priceInr')} />
            <small className={r ? 'range' : 'muted'}>
              {r ? `Suggested range ${inr(r.priceMinInr)} – ${inr(r.priceMaxInr)}` : 'Choose a flight and a hotel to see the suggested range'}
            </small>
          </label>
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={form.shareOk}
            onChange={(ev) => setForm((f) => ({ ...f, shareOk: ev.target.checked }))}
          />
          <span>
            Happy to share a car with another family on my flight going to the same area
            <small className="muted">Suppliers may then offer a shared ride, usually at a lower price.</small>
          </span>
        </label>

        <ErrorBox error={error} />
        {created ? (
          <div className="banner ok">Request <strong>{created}</strong> posted. It is open below under “My requests”.</div>
        ) : null}
        <div className="actions">
          <button className="primary" type="submit" disabled={sending}>{sending ? 'Posting…' : 'Post request'}</button>
        </div>
      </form>
    </>
  );
}
