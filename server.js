const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const aiCore = require('./lib/ai');

const app = express();
const port = process.env.PORT || 3000;

// Set once a SIGTERM/SIGINT arrives; /health answers 503 so anything
// polling readiness sees this container leaving rotation.
let shuttingDown = false;

// The platform signs user-identity tokens with an RSA private key it never
// shares. Containers get only the PUBLIC half, so this app can verify who a
// user is but cannot mint an identity — and neither can any other app.
const JWT_PUBLIC_KEY = (process.env.USERNODE_JWT_PUBLIC_KEY || '')
  .replace(/\\n/g, '\n');

// Tokens are minted for one app: the audience is this app's numeric id, so a
// token issued for a different app is rejected below rather than accepted as
// a valid user.
const APP_AUDIENCE = process.env.USERNODE_APP_ID
  ? 'usernode:app:' + process.env.USERNODE_APP_ID
  : null;

// Paths that stay open without authentication. Add a path here (and add it
// with `app.get`/`app.post` below) if you deliberately want it public.
// Everything else requires a valid platform-issued JWT.
const PUBLIC_API_PATHS = new Set(['/health']);

app.use(express.json());

// The platform's three centrally hosted files — the bridge, the native UI
// kit and the Tailwind runtime — are reachable at these paths on this app's
// OWN origin, so index.html can load them with a RELATIVE path and never
// name the platform's hostname. A hostname baked into an app is what breaks
// every app at once when the platform's domain moves.
//
// In production and on a staging preview the platform's edge answers these
// before the request ever reaches this process (a per-app Ingress rule on
// Kubernetes, the wildcard site's matcher on the docker runtime). This
// handler is what makes the same relative paths work under a plain
// `node server.js`, where there is no edge in front of the app at all.
//
// Registered BEFORE the auth middleware because these three files are
// public: the platform serves them anonymously from any app origin, and a
// login redirect arriving where a <script> was expected is exactly the
// failure a relative path is meant to avoid.
// The platform's origin, at RUNTIME, and ONLY from the variable the platform
// injects. No hostname is written into this file: a baked-in one is what left
// the whole fleet pointing at a domain the platform had moved away from.
// Unset only outside the platform (a plain local `node server.js`) — set
// USERNODE_PLATFORM_ORIGIN there too if you want the hosted assets locally.
const PLATFORM_ORIGIN = (process.env.USERNODE_PLATFORM_ORIGIN || '')
  .replace(/\/+$/, '');

app.get(/^\/usernode-(?:bridge|native|tailwind)\//, async (req, res) => {
  try {
    if (!PLATFORM_ORIGIN) return res.sendStatus(503);
    const upstream = await fetch(PLATFORM_ORIGIN + req.path);
    if (!upstream.ok) return res.sendStatus(upstream.status);
    const type = upstream.headers.get('content-type');
    if (type) res.type(type);
    // max-age=0 with revalidation, never a long TTL: the whole point of
    // central hosting is that a platform-side fix lands on the next load.
    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    console.warn('hosted asset fetch failed: ' + err.message);
    return res.sendStatus(502);
  }
});

// Verify platform-issued JWT if one was passed, then enforce auth on
// anything not explicitly marked public. The iframe adds `?token=…`
// on load; the frontend script forwards the token via `x-usernode-token`
// on subsequent fetches.
app.use((req, res, next) => {
  const token = req.query.token || req.headers['x-usernode-token'];
  if (token && JWT_PUBLIC_KEY && APP_AUDIENCE) {
    try {
      // Pin the algorithm, issuer and audience. Without `algorithms` a
      // caller could hand us an HS256 token signed with the public PEM
      // (which every app knows) and forge any user.
      const claims = jwt.verify(token, JWT_PUBLIC_KEY, {
        algorithms: ['RS256'],
        issuer: 'usernode',
        audience: APP_AUDIENCE,
      });
      // `pur` names what the token is for. Only user-identity tokens
      // authenticate a person here.
      if (claims && claims.pur === 'iframe') req.user = claims;
    } catch {}
  }

  // Static assets (CSS/JS/images) are always served; the API and the HTML
  // shell are gated so direct hits to the staging/prod subdomain don't
  // leak app data to the public internet.
  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    if (PUBLIC_API_PATHS.has(req.path)) return next();
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
});

app.get('/health', (_req, res) => {
  if (shuttingDown) return res.status(503).json({ status: 'draining' });
  res.json({ status: 'ok' });
});

// ── Creative assistant: the platform's LLM proxy ─────────────────────────
// The proxy URL and this app's token are injected in production only.
// Staging previews get neither (unreviewed PR code must not spend users'
// budgets) and a standalone deploy has no platform, so the assistant reports
// itself unavailable there and the panel explains instead of failing.
const LLM_PROXY_URL = (process.env.USERNODE_LLM_PROXY_URL || '').replace(/\/+$/, '');
const LLM_PROXY_TOKEN = process.env.USERNODE_LLM_PROXY_TOKEN || '';
const AI_ENABLED = Boolean(LLM_PROXY_URL && LLM_PROXY_TOKEN);

app.get('/api/ai/status', (_req, res) => {
  res.json({ available: AI_ENABLED });
});

// One request, one task. The browser sends which capability it wants and the
// text of the current prompt; the app's server calls the proxy, forwarding
// the signed-in user's iframe token (the platform bills and rate-limits the
// call against that person's own grant).
app.post('/api/ai/creative', async (req, res) => {
  if (!AI_ENABLED) {
    return res.status(503).json({
      code: 'ai_unavailable',
      error: 'AI features are unavailable in this environment.',
    });
  }

  const userToken = req.headers['x-usernode-token'] || req.query.token;
  if (!userToken) {
    return res.status(401).json({
      code: 'not_signed_in',
      error: 'Sign in to use the assistant.',
    });
  }

  const task = req.body && req.body.task;
  const text = req.body && typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!aiCore.TASKS[task]) {
    return res.status(400).json({ code: 'bad_request', error: 'That assistant task is not supported.' });
  }
  if (!text) {
    return res.status(400).json({ code: 'empty_text', error: 'Write an idea in the prompt box first.' });
  }
  if (text.length > 2000) {
    return res.status(400).json({ code: 'too_long', error: 'Keep the idea under 2000 characters.' });
  }

  let upstream;
  try {
    upstream = await fetch(LLM_PROXY_URL + '/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-usernode-app-token': LLM_PROXY_TOKEN,
        'x-usernode-user-token': userToken,
      },
      body: JSON.stringify(aiCore.buildRequestBody(task, text)),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    console.warn('[ai] proxy unreachable: ' + err.message);
    return res.status(502).json({
      code: 'ai_error',
      error: 'The assistant could not reach the AI service. Try again.',
    });
  }

  if (!upstream.ok) {
    let data = {};
    try {
      data = await upstream.json();
    } catch (err) {
      // The proxy answered with something other than JSON; the status below
      // is all there is to go on.
    }
    if (upstream.status === 403 && data.code === 'grant_required') {
      return res.status(403).json({
        code: 'grant_required',
        error: 'AI access has not been granted yet.',
      });
    }
    if (upstream.status === 429) {
      const code = data.code === 'budget_exceeded' ? 'budget_exceeded' : 'app_cap_exceeded';
      const error = code === 'budget_exceeded'
        ? 'Your daily AI budget is used up. It resets at midnight UTC.'
        : 'You reached the daily AI cap for this app. It resets at midnight UTC.';
      return res.status(429).json({ code, error });
    }
    console.warn('[ai] proxy answered ' + upstream.status);
    return res.status(502).json({
      code: 'ai_error',
      error: 'The AI service could not answer. Try again.',
    });
  }

  let data;
  try {
    data = await upstream.json();
  } catch (err) {
    return res.status(502).json({
      code: 'ai_error',
      error: 'The AI service sent an unreadable answer. Try again.',
    });
  }

  const answer = aiCore.extractText(data && data.content);
  if ((data && data.stop_reason === 'refusal') || aiCore.isDecline(answer)) {
    return res.json({ declined: true, message: aiCore.DECLINE });
  }

  if (task === 'prompt') {
    const polished = aiCore.cleanPromptText(answer);
    if (!polished) {
      return res.status(502).json({
        code: 'ai_bad_response',
        error: 'The assistant did not return a prompt. Try again.',
      });
    }
    return res.json({ text: polished });
  }

  const metadata = aiCore.parseMetadata(answer);
  if (!metadata) {
    return res.status(502).json({
      code: 'ai_bad_response',
      error: 'The assistant sent metadata that could not be read. Try again.',
    });
  }
  return res.json({ metadata });
});

// The template ships no favicon file; index.html carries an inline SVG
// icon instead. Answer 204 here so anything that still probes
// /favicon.ico (older browsers, direct visits) doesn't fall through to
// the auth-gated catch-all and surface a 401 in the console on every
// fresh load.
app.get('/favicon.ico', (_req, res) => res.status(204).end());

app.use(express.static(path.join(__dirname, 'public')));

// HTML shell: serve the app if authenticated. Unauthenticated top-level
// visits (share links pasted into a browser — Sec-Fetch-Dest: document)
// are sent to the platform's chromeless view of this app, where the shell
// embeds it with a real token so the link just works. Every other
// tokenless case (iframe loads with an expired token, old browsers
// without Sec-Fetch-*) gets the "open in Homeroom" landing page instead
// of a redirect, so the platform shell is never loaded INSIDE its own
// app iframe and stray visits still don't reveal the app.
app.get('*', (req, res) => {
  if (!req.user) {
    // Deep-link pass-through (platform #743): carry the visited
    // path+query into the chromeless view so share links land on the
    // shared screen, not Home. The clean platform route stores `path`
    // as one encoded query value so an inner ?, &, or = survives. The
    // shell decodes and validates it as relative-only before use. The
    // character test keeps the
    // value attribute-safe for the landing anchor below — anything
    // unusual falls back to the bare link.
    const deepPath = /^\/[A-Za-z0-9\-._~!$&()*+,;=:@\/%?]*$/.test(req.originalUrl)
      ? '?path=' + encodeURIComponent(req.originalUrl) : '';
    if (PLATFORM_ORIGIN && req.get('sec-fetch-dest') === 'document') {
      return res.redirect(302, PLATFORM_ORIGIN + '/app/pixora-b78e01/full' + deepPath);
    }
    return res.status(401).send(`<!doctype html><meta charset=utf-8><title>Open in Homeroom</title>
<body style="font-family:system-ui;background:#09090b;color:#e4e4e7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="max-width:24rem;padding:2rem;text-align:center">
    <h1 style="font-size:1.25rem;margin:0 0 0.5rem">Open this app inside Homeroom</h1>
    <p style="color:#a1a1aa;font-size:0.9rem;margin:0 0 1.25rem">This page is served via the platform; direct visits aren't authenticated.</p>
    <a href="${PLATFORM_ORIGIN}/app/pixora-b78e01/full${deepPath}" style="display:inline-block;padding:0.5rem 1rem;background:#7c3aed;color:white;border-radius:0.5rem;text-decoration:none;font-size:0.9rem">Open in Homeroom</a>
  </div>
</body>`);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// The app container is stopped and replaced on every deploy. Stop accepting
// connections, drop idle keep-alives, and exit well inside the platform's
// stop grace instead of being force-killed mid-request.
const DRAIN_MS = 3000;

async function shutdown(signal) {
  if (shuttingDown) return; // idempotent: a repeat signal must be a no-op
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received, draining`);
  server.close(() => {});
  server.closeIdleConnections?.();
  const t = setTimeout(() => server.closeAllConnections?.(), DRAIN_MS);
  t.unref?.();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const server = app.listen(port, () => console.log(`Listening on :${port}`));
// Let Envoy retire idle upstream connections at 60s, with a 15s margin.
server.keepAliveTimeout = 75_000;
