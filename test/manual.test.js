// Guards the manual, no-AI helpers: how the six guided fields assemble into
// a prompt and how metadata is drafted out of the prompt box text. These run
// the real functions from public/js/manual.js, which touches no DOM and
// imports nothing, so node can load it directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, draftMetadata, STOPWORDS } from '../public/js/manual.js';

const FIELDS = {
  subject: 'a hand-thrown ceramic mug',
  setting: 'on natural linen',
  lighting: 'soft morning light',
  mood: 'calm and warm',
  composition: 'close-up, shallow depth of field',
  style: 'minimal commercial studio photo',
};

test('the six fields assemble into two sentences, subject first', () => {
  assert.equal(buildPrompt(FIELDS),
    'A hand-thrown ceramic mug, on natural linen, soft morning light. ' +
    'Calm and warm, close-up, shallow depth of field, minimal commercial studio photo.');
});

test('empty optional fields drop out and one field still builds a prompt', () => {
  assert.equal(buildPrompt({ subject: 'a red umbrella' }), 'A red umbrella.');
  assert.equal(buildPrompt({ subject: 'a red umbrella', mood: 'cheerful' }), 'A red umbrella. Cheerful.');
});

test('a missing subject is refused, not half-built', () => {
  assert.equal(buildPrompt({}), null);
  assert.equal(buildPrompt({ setting: 'on linen' }), null);
  assert.equal(buildPrompt(null), null);
});

test('em dashes become commas and trailing stops are cleaned up', () => {
  assert.equal(buildPrompt({ subject: 'a mug — on linen.', mood: 'quiet!' }),
    'A mug, on linen. Quiet.');
});

test('a long prompt is clamped to the same limit as the AI prompt', () => {
  const long = buildPrompt({ subject: 'x '.repeat(700) });
  assert.equal(long.length, 1200);
});

test('the title comes from the first sentence of the idea', () => {
  const metadata = draftMetadata('A hand-thrown ceramic mug rests on natural linen. Soft morning light.');
  assert.equal(metadata.title, 'A hand-thrown ceramic mug rests on natural linen');
  assert.equal(metadata.description,
    'A hand-thrown ceramic mug rests on natural linen. Soft morning light.');
});

test('a title keeps its trailing period off and its word count down', () => {
  const metadata = draftMetadata('A mug on linen.');
  assert.equal(metadata.title, 'A mug on linen');
  const longIdea = 'word '.repeat(300);
  const clamped = draftMetadata(longIdea);
  assert.ok(clamped.title.length <= 120);
  assert.ok(clamped.title.split(/\s+/).length <= 12);
  assert.ok(clamped.description.length <= 600);
});

test('keywords keep single words first, then adjacent pairs, lowercase and deduped', () => {
  const metadata = draftMetadata('Morning light on a calm sea');
  assert.deepEqual(metadata.keywords,
    ['morning', 'light', 'calm', 'sea', 'morning light', 'light calm', 'calm sea']);
});

test('stopwords are dropped from keywords', () => {
  assert.equal(STOPWORDS.has('the'), true);
  assert.equal(STOPWORDS.has('on'), true);
  assert.equal(STOPWORDS.has('mug'), false);
  const metadata = draftMetadata('A ceramic mug on linen');
  assert.deepEqual(metadata.keywords.slice(0, 3), ['ceramic', 'mug', 'linen']);
});

test('the keyword list caps at 40 like the AI path', () => {
  // Letter-only words of growing length, so the token regex keeps them whole.
  const words = Array.from({ length: 60 }, (_, i) => 'a'.repeat(i + 1));
  const metadata = draftMetadata(words.join(' '));
  assert.equal(metadata.keywords.length, 40);
});

test('an empty idea drafts nothing', () => {
  assert.equal(draftMetadata('   '), null);
  assert.equal(draftMetadata(null), null);
});