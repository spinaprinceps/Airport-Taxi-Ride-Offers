import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header.jsx';
import PersonaPicker from './pages/PersonaPicker.jsx';
import NewRequest from './pages/NewRequest.jsx';

// Who you are lives in the URL: /traveler/... or /supplier/:companyId/...
// Each slice adds its own routes here when its screen exists.
export default function App() {
  return (
    <>
      <Header />
      <main className="page">
        <Routes>
          <Route path="/" element={<PersonaPicker />} />
          <Route path="/traveler" element={<Navigate to="/traveler/new" replace />} />
          <Route path="/traveler/new" element={<NewRequest />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
