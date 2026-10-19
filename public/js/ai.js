// Browser client for the Creative assistant.
//
// The app's server is what calls the platform's LLM proxy (server.js), so
// this module only talks to this app's own API. It forwards the platform's
// iframe token, which the shell put in ?token= on the initial load (client
// side navigation with history.pushState drops it from the URL, so it is
// read once here and kept), and it owns the one consent flow the platform
// documents: the proxy answers 403 grant_required, the shell asks the person
// for access with its own dialog, and the request is retried once.

const TOKEN = new URLSearchParams(location.search).get('token') || '';

export class AiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AiError';
    this.code = code || 'ai_error';
  }
}

function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (TOKEN) headers.set('x-usernode-token', TOKEN);
  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return fetch(path, { ...options, headers });
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (err) {
    return {};
  }
}

// Whether this deployment can reach the platform's AI at all. Staging
// previews and standalone hosts answer available: false.
export async function getAiStatus() {
  const response = await apiFetch('/api/ai/status');
  if (!response.ok) throw new AiError('AI status is unavailable.', 'status_failed');
  const data = await readJson(response);
  return { available: Boolean(data.available) };
}

// Ask the platform shell to show its AI consent dialog. Resolves null when
// the bridge is absent or the shell cannot ask, so the caller can say so.
async function askForAccess() {
  if (!window.usernode || typeof window.usernode.requestLlmAccess !== 'function') return null;
  try {
    return await window.usernode.requestLlmAccess();
  } catch (err) {
    return null;
  }
}

async function postTask(task, text) {
  try {
    const response = await apiFetch('/api/ai/creative', {
      method: 'POST',
      body: JSON.stringify({ task, text }),
    });
    return { response, data: await readJson(response) };
  } catch (err) {
    throw new AiError('The assistant could not reach the app. Check your connection and try again.', 'network');
  }
}

// Run one assistant task ("prompt" or "metadata"). Resolves the server's
// answer: { text } for a prompt, { metadata } for metadata, or
// { declined, message } when the request is outside what the app may produce.
export async function runAssistant(task, text) {
  let result = await postTask(task, text);

  if (result.response.status === 403 && result.data.code === 'grant_required') {
    const grant = await askForAccess();
    if (!grant || !grant.granted) {
      const message = grant && grant.declined
        ? 'AI access was not granted. The assistant asks again next time you use it.'
        : 'AI access is required. Open PIXORA inside Homeroom to grant it.';
      throw new AiError(message, 'grant_required');
    }
    result = await postTask(task, text);
  }

  if (!result.response.ok) {
    throw new AiError(
      result.data.error || 'The assistant could not answer. Try again.',
      result.data.code || 'ai_error');
  }
  return result.data;
}

// The user's AI usage today, from the platform's own usage call. Returns
// { available: false } when the bridge cannot answer here.
export async function getAiUsage() {
  if (!window.usernode || typeof window.usernode.getLlmUsage !== 'function') {
    return { available: false };
  }
  try {
    const usage = await window.usernode.getLlmUsage();
    if (usage && usage.granted) {
      return {
        available: true,
        granted: true,
        spentCentsToday: usage.spentCentsToday,
        dailyCapCents: usage.dailyCapCents,
      };
    }
    return { available: true, granted: false };
  } catch (err) {
    return { available: false };
  }
}
