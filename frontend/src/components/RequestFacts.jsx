import { bags, dateTime, inr, people } from '../format.js';

// The key facts of a request object, as a definition grid.
export default function RequestFacts({ request: r }) {
  return (
    <dl className="facts">
      <dt>Traveler</dt><dd>{r.travelerName}</dd>
      <dt>Flight</dt><dd>{r.flight.flightNumber} ({r.flight.airline}), lands {r.flight.to} {dateTime(r.flight.arrivalLocal)}</dd>
      <dt>Hotel</dt><dd>{r.hotel.name}, {r.hotel.city} / {r.hotel.area}</dd>
      <dt>Pickup</dt><dd>{dateTime(r.pickupAt)} <span className="muted">(car busy until {dateTime(r.busyUntil)}, drive {r.driveMinutes} min)</span></dd>
      <dt>Party</dt><dd>{people(r.adults, r.childAges)} · {bags(r.largeBags, r.smallBags)}</dd>
      <dt>Car type</dt><dd>{r.carType ?? 'Any'}</dd>
      <dt>Price</dt><dd><strong>{inr(r.priceInr)}</strong> <span className="muted">(range {inr(r.priceMinInr)} – {inr(r.priceMaxInr)})</span></dd>
    </dl>
  );
}
