// Guards the Creative assistant's contract: how a model answer is parsed,
// what every AI request tells the model about the app's content rules, and
// that the browser and the server meet where they should.
//
// The parser tests exercise real functions from lib/ai.js. The two source
// tests pin the wiring the browser and server cannot share as code: the
// platform proxy headers, the consent call and the unavailable notice. All
// of them fail without this change: before it, lib/ai.js and public/js/ai.js
// do not exist and the routes are absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ai from '../lib/ai.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('metadata is read out of a fenced reply and normalised', () => {
  const raw = '```json\n' + JSON.stringify({
    title: 'Ceramic mug on linen',
    description: 'A hand thrown ceramic mug rests on natural linen in soft morning light.',
    keywords: ['Mug', ' mug ', 'Linen', 'Morning light', 'Ceramic', 'Minimal'],
  }) + '\n```';
  const metadata = ai.parseMetadata(raw);
  assert.equal(metadata.title, 'Ceramic mug on linen');
  assert.equal(metadata.description,
    'A hand thrown ceramic mug rests on natural linen in soft morning light.');
  assert.deepEqual(metadata.keywords,
    ['mug', 'linen', 'morning light', 'ceramic', 'minimal']);
});

test('a reply that is not usable metadata is rejected, not half-used', () => {
  assert.equal(ai.parseMetadata("I can't help with that."), null);
  assert.equal(ai.parseMetadata('{"title":"Only a title"}'), null);
  assert.equal(ai.parseMetadata(
    '{"title":"T","description":"D","keywords":["a","b","c","d"]}'), null);
});

test('a polished prompt loses its fence, wrapping quotes and em dashes', () => {
  assert.equal(ai.cleanPromptText('```text\n"A mug — on linen."\n```'),
    'A mug, on linen.');
});

test('a decline is recognised so it can be shown as a message', () => {
  assert.equal(ai.isDecline("I can't help with that. Ask for a different image idea."), true);
  assert.equal(ai.isDecline('A ceramic mug on linen in soft light.'), false);
});

test('every task tells the model to decline mature topics', () => {
  for (const task of ['prompt', 'metadata']) {
    const system = ai.TASKS[task].system;
    assert.match(system, /general audience/i);
    assert.match(system, /sexual or suggestive/i);
    assert.match(system, /nudity/i);
    assert.match(system, /violence or weapons/i);
    assert.match(system, /gambling/i);
    assert.match(system, /I can't help with that/);
  }
});

test('a request carries the task text, a model and its system prompt', () => {
  const prompt = ai.buildRequestBody('prompt', 'a ceramic mug');
  assert.equal(prompt.model, ai.MODEL);
  assert.deepEqual(prompt.messages, [{ role: 'user', content: 'Idea:\na ceramic mug' }]);
  assert.equal(prompt.system, ai.TASKS.prompt.system);

  const metadata = ai.buildRequestBody('metadata', 'a ceramic mug');
  assert.deepEqual(metadata.messages,
    [{ role: 'user', content: 'Image prompt:\na ceramic mug' }]);

  assert.equal(ai.buildRequestBody('unknown', 'x'), null);
});

test('the server calls the platform proxy, never a provider directly', () => {
  const server = read('server.js');
  assert.match(server, /USERNODE_LLM_PROXY_URL/);
  assert.match(server, /USERNODE_LLM_PROXY_TOKEN/);
  assert.match(server, /x-usernode-app-token/);
  assert.match(server, /x-usernode-user-token/);
  assert.match(server, /'\/api\/ai\/status'/);
  assert.match(server, /'\/api\/ai\/creative'/);
  assert.doesNotMatch(server, /api\.anthropic\.com/);
});

test('the page asks for AI access, shows usage and explains an unavailable env', () => {
  const client = read('public/js/ai.js');
  const creative = read('public/js/tools/creative.js');
  assert.match(client, /requestLlmAccess/);
  assert.match(client, /getLlmUsage/);
  assert.match(creative, /getAiUsage/);
  assert.match(creative, /Improve prompt/);
  assert.match(creative, /Write metadata/);
  assert.match(creative, /navigator\.clipboard\.writeText/);
  assert.match(creative, /AI is not available in this environment/);
  assert.match(creative, /id = 'creative-ai'/);
});
