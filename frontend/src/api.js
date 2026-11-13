// One place that talks to the backend. All paths start with /api.
// On a non-2xx it throws the backend's error body: { code, message, violations }.

async function request(method, path, body, headers = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw { code: 'NETWORK', message: 'Cannot reach the server. Is the API running?', violations: [] };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    throw data ?? { code: 'HTTP_' + res.status, message: `Request failed (${res.status}).`, violations: [] };
  }
  return data;
}

export const get = (path) => request('GET', path);
export const post = (path, body, headers) => request('POST', path, body ?? {}, headers);
