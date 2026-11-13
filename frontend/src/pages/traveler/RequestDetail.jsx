import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { getRequest } from '../../api/requests.js';
import { POLL_MS, useApi } from '../../useApi.js';
import ErrorList from '../../components/ErrorList.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import RequestSummary from '../../components/RequestSummary.jsx';
import Serveability from '../../components/Serveability.jsx';

// GET /api/requests/:requestId — one request with live serveability and its offer count.
// Polls, so offers placed by suppliers show up without a reload.
export default function RequestDetail() {
  const { requestId } = useParams();
  const [params] = useSearchParams();
  const { state } = useLocation();
  const { data, error, loading } = useApi(() => getRequest(requestId), [requestId], { pollMs: POLL_MS });

  const name = params.get('name');
  const back = name ? `/traveler/requests?name=${encodeURIComponent(name)}` : '/traveler/requests';

  return (
    <>
      <p><Link to={back}>← My requests</Link></p>
      {state?.justPosted && data && (
        <div className="banner banner-ok" role="status">✓ Request {data.request.requestId} posted.</div>
      )}
      <ErrorList error={error} />
      {loading && <p className="muted">Loading request…</p>}
      {data && (
        <>
          <div className="page-head">
            <h1>{data.request.requestId}</h1>
            <StatusBadge status={data.request.status} />
          </div>

          <section className="card">
            <h2>{data.request.travelerName}</h2>
            <RequestSummary request={data.request} />
            <Serveability serveability={data.serveability} />
          </section>

          <section className="card">
            <h2>Offers</h2>
            {data.bookingNumber ? (
              <p>Booked · booking number <strong>{data.bookingNumber}</strong></p>
            ) : (
              <p>
                <strong>{data.offerCount}</strong> offer{data.offerCount === 1 ? '' : 's'} so far.
                <span className="muted"> This page refreshes every {POLL_MS / 1000} seconds.</span>
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
