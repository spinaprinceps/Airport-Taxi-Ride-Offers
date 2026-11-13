// Display helpers. Date-times are local strings ("2027-04-10T11:30"); they are sliced,
// never passed through Date, so the browser's time zone cannot shift them.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const POLL_MS = 5000;
export const CAR_TYPES = ['HATCHBACK', 'SEDAN', 'SUV', 'BUS'];

export const inr = (n) => (n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN')}`);

export const hhmm = (s) => (s ? s.slice(11, 16) : '—');

// "2027-04-10T11:30" -> "10 Apr 2027, 11:30"
export function dateTime(s) {
  if (!s) return '—';
  return `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}, ${s.slice(11, 16)}`;
}

// What the user typed -> what is sent. Nothing is corrected here: an empty field goes as null and
// text that is not a number goes as typed, so the backend decides and answers with its own message.
export function toNumber(text) {
  const t = String(text ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
}

// "5, 9" -> [5, 9]
export function toAges(text) {
  return String(text ?? '').split(/[\s,]+/).filter(Boolean).map(toNumber);
}

export function party(r) {
  const kids = r.childAges?.length
    ? `, ${r.childAges.length} ${r.childAges.length === 1 ? 'child' : 'children'} (age ${r.childAges.join(', ')})`
    : '';
  return `${r.adults} ${r.adults === 1 ? 'adult' : 'adults'}${kids}`;
}

export const bags = (r) => `${r.largeBags} large, ${r.smallBags} small`;

export const carSpec = (c) => `${c.type} · ${c.seats} seats · ${c.largeBags} large / ${c.smallBags} small bags`;
