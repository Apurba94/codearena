export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(method, url, body) {
  const opts = { method, headers: { 'X-Requested-With': 'CodeArena' }, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${url}`, opts);
  } catch {
    throw new ApiError(0, 'Network error — is the server running?');
  }
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.details);
  return data;
}

/** Build a query string, skipping empty values. */
export function qs(params) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    s.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : '';
}

export const api = {
  get: (url, params) => request('GET', url + qs(params)),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  patch: (url, body = {}) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
};
