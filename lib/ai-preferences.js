'use strict';

// The AI configuration a signed-in person keeps for PIXORA.
//
// Stored server-side so it follows the person to any device, and validated
// here so the API and any future caller agree on what a valid configuration
// is. Nothing in this file is a credential: AI access is granted by Homeroom,
// and the app never holds an API key.

const PROVIDERS = ['homeroom'];
const TYPES = ['all', 'creative', 'upscale', 'remove-background'];
const MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'];

const DEFAULT_PREFERENCES = Object.freeze({
  provider: 'homeroom',
  type: 'all',
  model: 'claude-sonnet-5-5',
  dailyLimitCents: 100,
});

const MIN_DAILY_LIMIT_CENTS = 50;
const MAX_DAILY_LIMIT_CENTS = 10000;

// An absent value takes the default; a present but unknown value is a
// mistake the caller should hear about rather than silently "fixed".
function pick(value, allowed, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return allowed.includes(value) ? value : null;
}

function normalizePreferences(input) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};

  const provider = pick(raw.provider, PROVIDERS, DEFAULT_PREFERENCES.provider);
  if (provider === null) return { ok: false, field: 'provider' };

  const type = pick(raw.type, TYPES, DEFAULT_PREFERENCES.type);
  if (type === null) return { ok: false, field: 'type' };

  const model = pick(raw.model, MODELS, DEFAULT_PREFERENCES.model);
  if (model === null) return { ok: false, field: 'model' };

  const cents = raw.dailyLimitCents === undefined || raw.dailyLimitCents === null
    ? DEFAULT_PREFERENCES.dailyLimitCents
    : Number(raw.dailyLimitCents);
  if (!Number.isInteger(cents)) return { ok: false, field: 'dailyLimitCents' };
  if (cents < MIN_DAILY_LIMIT_CENTS || cents > MAX_DAILY_LIMIT_CENTS) {
    return { ok: false, field: 'dailyLimitCents' };
  }

  return { ok: true, value: { provider, type, model, dailyLimitCents: cents } };
}

module.exports = {
  PROVIDERS,
  TYPES,
  MODELS,
  DEFAULT_PREFERENCES,
  MIN_DAILY_LIMIT_CENTS,
  MAX_DAILY_LIMIT_CENTS,
  normalizePreferences,
};
