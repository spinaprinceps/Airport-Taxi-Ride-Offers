// All date-times are local strings with no zone: "2027-04-10T11:30".
// We treat them as UTC only for arithmetic, so the server's own zone never shifts them.

const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export function isLocalDateTime(s) {
  return typeof s === 'string' && LOCAL_RE.test(s) && !Number.isNaN(Date.parse(s + 'Z'));
}

export function parse(s) {
  return Date.parse(s + 'Z');
}

export function format(ms) {
  return new Date(ms).toISOString().slice(0, 16);
}

export function addMinutes(s, n) {
  return format(parse(s) + n * 60_000);
}

// "2027-04-10T11:30" -> "11:30"
export function hhmm(s) {
  return s.slice(11, 16);
}

// "2027-04-10T11:30" -> "10 Apr 11:30" (used in rule messages)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function pretty(s) {
  const day = Number(s.slice(8, 10));
  const month = MONTHS[Number(s.slice(5, 7)) - 1];
  return `${day} ${month} ${hhmm(s)}`;
}
