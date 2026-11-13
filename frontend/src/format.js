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
