// Manual, no-AI helpers for the Creative assistant.
//
// Where the platform's LLM proxy is absent (a staging preview, a standalone
// host) or a call fails, the assistant switches to these: they assemble a
// prompt from six guided fields and draft microstock metadata from the text
// in the prompt box, entirely in the browser. The module touches no DOM and
// imports nothing, so node --test can load it directly (see
// test/manual.test.js). The output shapes match what the AI path returns, so
// the panel renders both through the same result builders.

// An em dash becomes a comma wherever text a person reads is assembled, the
// app's copy rule. The same replacement lib/ai.js applies to model output.
function tidy(text) {
  return String(text == null ? '' : text)
    .replace(/—/g, ',')
    .replace(/[ \t]+,/g, ',')
    .replace(/,[ \t]*,/g, ',')
    .trim();
}

// Uppercase the first letter of a fragment.
function sentenceCase(text) {
  const t = String(text == null ? '' : text).trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

// Drop a trailing stop so the assembly below can end with exactly one.
function withoutTrailingStop(text) {
  return String(text == null ? '' : text).trim().replace(/[.!?]+$/, '');
}

// Words that carry no stock-search value on their own.
export const STOPWORDS = new Set([
  'a', 'an', 'the', 'on', 'in', 'of', 'with', 'and', 'or', 'for', 'at', 'by',
  'to', 'from', 'is', 'are',
]);

// The assembled prompt never runs past the length the AI path clamps to
// (lib/ai.js cleanPromptText).
const PROMPT_LIMIT = 1200;

// Join the six guided fields into one prompt paragraph: subject, setting and
// lighting make the first sentence, mood, composition and style the second.
// Only the subject is required; empty fields drop out, so a single filled
// field still builds a valid prompt. Returns null without a subject.
export function buildPrompt(fields) {
  const data = fields && typeof fields === 'object' ? fields : {};
  const subject = tidy(data.subject);
  if (!subject) return null;
  const first = [subject, tidy(data.setting), tidy(data.lighting)].filter(Boolean);
  const second = [tidy(data.mood), tidy(data.composition), tidy(data.style)].filter(Boolean);
  let text = sentenceCase(withoutTrailingStop(first.join(', ')));
  if (second.length) {
    text += '. ' + sentenceCase(withoutTrailingStop(second.join(', ')));
  }
  return tidy(text + '.').slice(0, PROMPT_LIMIT);
}

// The limits the AI metadata path enforces (lib/ai.js parseMetadata),
// applied here too.
const TITLE_LIMIT = 120;
const TITLE_WORDS = 12;
const DESCRIPTION_LIMIT = 600;
const KEYWORD_LIMIT = 40;

// The first sentence of the idea, clamped to the title's shape: no trailing
// period, at most twelve words.
function draftTitle(text) {
  const firstSentence = String(text).split(/[.!?]/)[0].trim();
  const words = firstSentence.split(/\s+/).filter(Boolean).slice(0, TITLE_WORDS);
  return sentenceCase(tidy(words.join(' ')).replace(/[.!?]+$/, '')).slice(0, TITLE_LIMIT);
}

// The idea itself is a factual sentence about the image, so it doubles as
// the description, clamped like the AI path.
function draftDescription(text) {
  return tidy(String(text).replace(/\s+/g, ' ')).slice(0, DESCRIPTION_LIMIT);
}

// Keywords are the idea's own meaningful words, lowercase and deduped in
// order of first appearance, then the adjacent kept-word pairs, capped like
// the AI path. Extraction cannot invent what AI would, so the panel says the
// list may be short when it is.
function draftKeywords(text) {
  const tokens = String(text == null ? '' : text).toLowerCase().match(/[a-z][a-z'-]*/g) || [];
  const kept = tokens
    .map((token) => token.replace(/['-]+$/, ''))
    .filter((token) => token && !STOPWORDS.has(token));
  const seen = new Set();
  const keywords = [];
  const push = (keyword) => {
    if (seen.has(keyword)) return;
    seen.add(keyword);
    keywords.push(keyword);
  };
  for (const word of kept) push(word);
  for (let i = 0; i + 1 < kept.length; i += 1) push(kept[i] + ' ' + kept[i + 1]);
  return keywords.slice(0, KEYWORD_LIMIT);
}

// The manual metadata drafter: { title, description, keywords } from the
// prompt box text, or null when there is nothing to draft from.
export function draftMetadata(text) {
  const source = String(text == null ? '' : text).trim();
  if (!source) return null;
  return {
    title: draftTitle(source),
    description: draftDescription(source),
    keywords: draftKeywords(source),
  };
}