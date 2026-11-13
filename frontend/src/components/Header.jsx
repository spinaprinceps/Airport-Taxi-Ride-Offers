import { Link, useMatch } from 'react-router-dom';

export default function Header() {
  const traveler = useMatch('/traveler/:name/*');
  const supplier = useMatch('/supplier/:companyId/*');

  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="brand">Airport Taxi Ride Offers</Link>
        {traveler ? (
          <Link className="persona" to={`/traveler/${encodeURIComponent(traveler.params.name)}`}>
            Traveler · {traveler.params.name}
          </Link>
        ) : null}
        {supplier ? (
          <Link className="persona" to={`/supplier/${encodeURIComponent(supplier.params.companyId)}`}>
            Supplier · {supplier.params.companyId}
          </Link>
        ) : null}
        {traveler || supplier ? <Link to="/" className="switch">Switch persona</Link> : null}
      </div>
    </header>
  );
}
