import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header.jsx';
import PersonaPicker from './pages/PersonaPicker.jsx';
import NewRequest from './pages/NewRequest.jsx';
import MyRequests from './pages/MyRequests.jsx';
import RequestDetail from './pages/RequestDetail.jsx';
import BookingLookup from './pages/BookingLookup.jsx';
import BookingSummary from './pages/BookingSummary.jsx';
import SupplierDashboard from './pages/SupplierDashboard.jsx';
import SupplierRequest from './pages/SupplierRequest.jsx';

// Who you are lives in the URL: /traveler/... or /supplier/:companyId/...
export default function App() {
  return (
    <>
      <Header />
      <main className="page">
        <Routes>
          <Route path="/" element={<PersonaPicker />} />
          <Route path="/traveler" element={<Navigate to="/traveler/new" replace />} />
          <Route path="/traveler/new" element={<NewRequest />} />
          <Route path="/traveler/requests" element={<MyRequests />} />
          <Route path="/traveler/requests/:requestId" element={<RequestDetail />} />
          <Route path="/booking" element={<BookingLookup />} />
          <Route path="/booking/:bookingNumber" element={<BookingSummary />} />
          <Route path="/supplier/:companyId" element={<SupplierDashboard />} />
          <Route path="/supplier/:companyId/requests/:requestId" element={<SupplierRequest />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
