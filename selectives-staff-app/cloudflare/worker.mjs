const appPath = '/staff/app/';
const security = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
  'X-Content-Type-Options': 'nosniff',
};

function error(status, message) {
  return Response.json({ ok: false, error: message }, { status, headers: security });
}

async function forward(request, env, url) {
  if (request.method !== 'POST') return error(405, 'Use POST for staff requests.');
  if (request.headers.get('Origin') !== url.origin) return error(403, 'Open the staff app to continue.');
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') {
    return error(415, 'Expected a JSON request.');
  }

  const reader = request.body?.getReader();
  if (!reader) return error(400, 'Invalid request.');
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 100000) {
        await reader.cancel();
        return error(413, 'Request too large.');
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const payload = JSON.parse(body);
    if (!/^api_[A-Za-z0-9_]+$/.test(payload?.method) || !Array.isArray(payload.args) ||
        payload.args.length > 8 || Object.keys(payload).length !== 2) {
      return error(400, 'Invalid request.');
    }
  } catch {
    return error(400, 'Invalid request.');
  }

  const endpoint = env.APPS_SCRIPT_EXEC_URL;
  if (typeof endpoint !== 'string' || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint)) {
    return error(503, 'The staff service is being configured.');
  }
  try {
    let upstream = await fetch(endpoint, {
      method: 'POST', body, redirect: 'manual',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      signal: request.signal,
    });
    if ([302, 303].includes(upstream.status)) {
      const redirect = new URL(upstream.headers.get('Location'));
      if (redirect.origin !== 'https://script.googleusercontent.com' ||
          redirect.pathname !== '/macros/echo' || redirect.username || redirect.password) {
        return error(502, 'Unexpected reply from the staff service.');
      }
      upstream = await fetch(redirect, { redirect: 'error', signal: request.signal });
    }
    if (!upstream.ok || !upstream.headers.get('Content-Type')?.includes('application/json')) {
      return error(502, 'The staff service returned an unexpected reply.');
    }
    return new Response(upstream.body, { headers: { ...security, 'Content-Type': 'application/json' } });
  } catch {
    return error(502, 'Could not reach the staff service.');
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/staff/app') return Response.redirect(new URL(appPath, url), 308);
    if (!url.pathname.startsWith(appPath)) return new Response('Not found', { status: 404 });
    if (url.pathname === appPath + 'api') return forward(request, env, url);
    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    for (const [name, value] of Object.entries(security)) headers.set(name, value);
    return new Response(asset.body, { status: asset.status, headers });
  },
};
