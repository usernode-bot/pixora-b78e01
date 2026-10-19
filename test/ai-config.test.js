// Guards the AI configuration panel's contract in the source itself: the
// sidebar entry, the three tabs and their controls, the platform permission
// calls, the absence of an API key field, and the server-side validation of
// the configuration a person saves.
//
// These fail without the change: before it, public/js/ai-config.js and
// lib/ai-preferences.js do not exist and the server has no preferences route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(path.join(root, ...parts), 'utf8');

const html = read('public', 'index.html');
const aiJs = read('public', 'js', 'ai-config.js');
const mainJs = read('public', 'js', 'main.js');
const serverJs = read('server.js');

const require = createRequire(import.meta.url);
const {
  DEFAULT_PREFERENCES,
  MIN_DAILY_LIMIT_CENTS,
  MAX_DAILY_LIMIT_CENTS,
  normalizePreferences,
} = require('../lib/ai-preferences.js');

test('the sidebar carries an AI menu that opens a dialog', () => {
  assert.match(html, /id="ai-open-btn"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /AI configuration/);
  assert.match(mainJs, /initAiConfig\(/);
  assert.match(mainJs, /ai-open-btn/);
});

test('the dialog has the Configuration, Account and Settings tabs', () => {
  for (const label of ['Configuration', 'Account', 'Settings']) {
    assert.match(aiJs, new RegExp("'" + label + "'"));
  }
  assert.match(aiJs, /role="tablist"|setAttribute\('role', 'tablist'\)/);
});

test('the Configuration tab has Provider, Type and Model selects and a Save button', () => {
  assert.match(aiJs, /'Provider'/);
  assert.match(aiJs, /'Type'/);
  assert.match(aiJs, /'Model'/);
  assert.match(aiJs, /'Save'/);
  assert.match(aiJs, /Daily limit/);
});

test('the panel asks the platform for AI access and reads its meter', () => {
  assert.match(aiJs, /requestLlmAccess\(\)/);
  assert.match(aiJs, /getLlmUsage\(\)/);
});

test('the panel says when AI is not available in this environment', () => {
  assert.match(aiJs, /AI is not available in this environment/);
  assert.match(serverJs, /USERNODE_LLM_PROXY_TOKEN/);
});

test('there is no API key field, and the copy says keys belong to Homeroom', () => {
  assert.doesNotMatch(aiJs, /type\s*=\s*'password'/);
  assert.doesNotMatch(aiJs, /type\s*=\s*"password"/);
  assert.doesNotMatch(aiJs, /(?:id|name)\s*=\s*'[^']*(?:api[_-]?key|secret)/i);
  assert.match(aiJs, /never asks for or stores/);
});

test('no third-party AI provider is called directly', () => {
  for (const source of [aiJs, serverJs]) {
    assert.doesNotMatch(source, /openai\.com|anthropic\.com|api\.adobe|firefly/i);
    assert.doesNotMatch(source, /https?:\/\/[^'"\s]*\/v1\/images/);
  }
});

test('preferences are stored per signed-in user, not per browser', () => {
  assert.match(serverJs, /CREATE TABLE IF NOT EXISTS ai_preferences/);
  assert.match(serverJs, /app\.get\('\/api\/ai\/preferences'/);
  assert.match(serverJs, /app\.put\('\/api\/ai\/preferences'/);
  assert.match(serverJs, /req\.user\.id/);
});

test('a missing daily limit takes the default', () => {
  const result = normalizePreferences({});
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { ...DEFAULT_PREFERENCES });
});

test('a whole valid configuration is accepted', () => {
  const result = normalizePreferences({
    provider: 'homeroom',
    type: 'creative',
    model: 'claude-opus-5-5',
    dailyLimitCents: 500,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    provider: 'homeroom',
    type: 'creative',
    model: 'claude-opus-5-5',
    dailyLimitCents: 500,
  });
});

test('an out-of-range or fractional daily limit is rejected', () => {
  for (const cents of [MIN_DAILY_LIMIT_CENTS - 1, MAX_DAILY_LIMIT_CENTS + 1, 100.5, 'lots']) {
    const result = normalizePreferences({ dailyLimitCents: cents });
    assert.equal(result.ok, false, String(cents));
    assert.equal(result.field, 'dailyLimitCents');
  }
});

test('an unknown provider, type or model is rejected rather than fixed', () => {
  assert.equal(normalizePreferences({ type: 'video' }).field, 'type');
  assert.equal(normalizePreferences({ model: 'gpt-4o' }).field, 'model');
  assert.equal(normalizePreferences({ provider: 'openai' }).field, 'provider');
});
