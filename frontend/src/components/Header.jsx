import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { get } from '../api.js';

// Shows who you are (from the URL) and a Switch link on every page.
export default function Header() {
  const { pathname } = useLocation();
  const [suppliers, setSuppliers] = useState([]);

  const supplierMatch = pathname.match(/^\/supplier\/([^/]+)/);
  const companyId = supplierMatch ? decodeURIComponent(supplierMatch[1]) : null;
  const isTraveler = pathname === '/traveler' || pathname.startsWith('/traveler/');
  const isBooking = pathname.startsWith('/booking');

  useEffect(() => {
    if (companyId && suppliers.length === 0) {
      get('/api/suppliers').then(setSuppliers).catch(() => {});
    }
  }, [companyId, suppliers.length]);

  let who = 'Not signed in';
  if (isTraveler) who = 'Traveler';
  else if (companyId) {
    const s = suppliers.find((x) => x.companyId === companyId);
    who = s ? `${s.name} (${companyId})` : companyId;
  } else if (isBooking) who = 'Booking lookup';

  const enc = companyId ? encodeURIComponent(companyId) : '';
  const links = isTraveler || isBooking
    ? [['/traveler/new', 'New request'], ['/traveler/requests', 'My requests'], ['/booking', 'Find booking']]
    : companyId
      ? [[`/supplier/${enc}?tab=requests`, 'Requests'], [`/supplier/${enc}?tab=offers`, 'My offers'],
        [`/supplier/${enc}?tab=changes`, 'Changes']]
      : [];

  return (
    <header className="header">
      <Link to="/" className="brand">Airport Taxi Ride Offers</Link>
      {links.length > 0 && (
        <nav className="nav">
          {links.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}
        </nav>
      )}
      <nav className="header-right">
        <span className="who">{who}</span>
        <Link to="/" className="switch">Switch</Link>
      </nav>
    </header>
  );
}
