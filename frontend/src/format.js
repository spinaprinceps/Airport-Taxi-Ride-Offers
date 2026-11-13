// Date-times are local strings like "2027-04-10T11:30". Never call new Date() on them
// (the laptop zone would shift them). Format by slicing the string.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2027-04-10T11:30" -> "10 Apr, 11:30"
export function dateTime(s) {
  if (!s) return '';
  return `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]}, ${s.slice(11, 16)}`;
}

// "2027-04-10T11:30" -> "10 Apr"
export function dateOnly(s) {
  return `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]}`;
}

// "2027-04-10T11:30" -> "11:30"
export const timeOnly = (s) => s.slice(11, 16);

// 12000 -> "₹12,000"
export const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');

// "2 adults, 1 child (age 5)"
export function people(adults, childAges = []) {
  const a = `${adults} adult${adults === 1 ? '' : 's'}`;
  if (!childAges.length) return a;
  const c = `${childAges.length} child${childAges.length === 1 ? '' : 'ren'}`;
  return `${a}, ${c} (age ${childAges.join(', ')})`;
}

// "3 large, 2 small bags"
export const bags = (large, small) => `${large} large, ${small} small bag${small === 1 ? '' : 's'}`;

// "SC-3 · SUV · 6 seats · 4L/3S"
export const car = (v) => `${v.vehicleId} · ${v.type} · ${v.seats} seats · ${v.largeBags}L/${v.smallBags}S bags`;

// "1234567890" -> "123 456 7890"
export const bookingNo = (n) => (n ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : '');
