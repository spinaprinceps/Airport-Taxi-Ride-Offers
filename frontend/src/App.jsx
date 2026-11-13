import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import Header from './components/Header.jsx';
import Home from './pages/Home.jsx';
import TravelerDashboard from './pages/traveler/TravelerDashboard.jsx';
import SupplierDashboard from './pages/supplier/SupplierDashboard.jsx';

const e = encodeURIComponent;

// Old deep links now open the matching part of the one-page dashboards.
function OldTravelerLink() {
  const { name, requestId, bookingNumber } = useParams();
  const q = requestId ? `request=${e(requestId)}` : `booking=${e(bookingNumber)}`;
  return <Navigate replace to={`/traveler/${e(name)}?${q}`} />;
}
function OldSupplierLink() {
  const { companyId } = useParams();
  return <Navigate replace to={`/supplier/${e(companyId)}`} />;
}

// Two dashboards, no login: the persona (traveler name or supplier id) lives in the URL.
export default function App() {
  return (
    <>
      <Header />
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/traveler/:name" element={<TravelerDashboard />} />
          <Route path="/traveler/:name/requests/:requestId" element={<OldTravelerLink />} />
          <Route path="/traveler/:name/bookings/:bookingNumber" element={<OldTravelerLink />} />
          <Route path="/supplier/:companyId" element={<SupplierDashboard />} />
          <Route path="/supplier/:companyId/requests/:requestId" element={<OldSupplierLink />} />
          <Route path="*" element={<p>Page not found. <Link to="/">Go to the start</Link>.</p>} />
        </Routes>
      </main>
    </>
  );
}
