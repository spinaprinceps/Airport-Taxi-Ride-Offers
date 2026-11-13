// A small coloured pill for OPEN / BOOKED / OFFERED / REJECTED / NOT_CHOSEN / PENDING / ACCEPTED.
export default function Status({ value }) {
  if (!value) return null;
  return <span className={`pill pill-${value.toLowerCase()}`}>{value.replace('_', ' ')}</span>;
}
