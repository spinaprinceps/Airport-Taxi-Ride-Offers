const LABELS = {
  travelerName: 'Traveler name', flightId: 'Flight', hotelId: 'Hotel', adults: 'Adults', childAges: 'Child ages',
  largeBags: 'Large bags', smallBags: 'Small bags', pickupAt: 'Pickup time', carType: 'Car type', priceInr: 'Price',
  vehicleId: 'Car', newFlightId: 'New flight', newPickupAt: 'New pickup time',
};

// A shape error (400, no rule code) names the form field in plain words. Rule messages (R1–R9) are shown as sent.
function text(x) {
  if (x.rule) return x.message;
  const label = LABELS[String(x.field ?? '').split('.')[0]];
  if (!label) return x.message;
  if (/expected (number|int)/.test(x.message)) {
    return `${label}: ${/received (null|undefined)/.test(x.message) ? 'is empty — ' : ''}enter a whole number.`;
  }
  if (/expected string/.test(x.message) || /Too small/.test(x.message)) return `${label}: is required.`;
  return `${label}: ${x.message}`;
}

// Shows a backend refusal: the message, then every violation with its rule code (R1–R9).
export default function ErrorBox({ error }) {
  if (!error) return null;
  const violations = error.violations ?? [];
  const onlyRepeatsMessage = violations.length === 1 && violations[0].message === error.message;

  return (
    <div className="error" role="alert">
      <div className="error-head">
        {error.status ? <span className="error-code">{error.status} {error.code}</span> : null}
        {onlyRepeatsMessage && violations[0].rule ? <span className="rule">{violations[0].rule}</span> : null}
        <span>{error.message}</span>
      </div>
      {violations.length > 0 && !onlyRepeatsMessage ? (
        <ul>
          {violations.map((x, i) => (
            <li key={i}>
              {x.rule ? <span className="rule">{x.rule}</span> : null}
              <span>{text(x)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
