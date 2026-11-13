// R6 busy intervals. Pure, no database. Intervals are half-open [start, end):
// one that starts exactly at another's end does not overlap (same as tsrange '[)').
import { parse } from '../time.js';

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return parse(aStart) < parse(bEnd) && parse(bStart) < parse(aEnd);
}
