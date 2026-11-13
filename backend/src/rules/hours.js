// R4 opening hours. Pure, no database.
// from <= t <= until, both ends included. If from > until the window crosses midnight.

const minutes = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

export function isOpenAt(from, until, hhmm) {
  const f = minutes(from);
  const u = minutes(until);
  const t = minutes(hhmm);
  if (f <= u) return f <= t && t <= u;
  return t >= f || t <= u; // e.g. 05:00-01:00
}
