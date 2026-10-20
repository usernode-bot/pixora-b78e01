'use strict';

// The Creative assistant's text layer.
//
// The browser never talks to an AI provider directly. This module builds the
// Messages API request that server.js sends to the platform's own LLM proxy
// (USERNODE_LLM_PROXY_URL, see "App LLM access" in the platform conventions)
// and parses what comes back. Keeping it here makes the parsing rules
// testable without a network, a database or an API key.

// The proxy mirrors the Anthropic Messages API. This is the model every
// request asks for.
const MODEL = 'claude-opus-5-5';

// What the model is told to answer with when a request falls outside a
// general-audience stock library. server.js recognises it and shows it as a
// plain message rather than an error.
const DECLINE = "I can't help with that. Ask for a different image idea.";

// Applied to every task. The platform's content rules require an AI feature
// to decline mature topics instead of producing them, so this is part of the
// system prompt, not an optional nicety.
const AI_RULES = [
  'This app makes commercial stock imagery for a general audience.',
  'Never write sexual or suggestive content, nudity, violence or weapons,',
  'gambling, or any other mature theme.',
  'If the request asks for any of those, reply with exactly this sentence and nothing else:',
  DECLINE,
  'Never use em dashes.',
].join(' ');

const TASKS = {
  prompt: {
    maxTokens: 800,
    system: [
      'You turn a short idea into one polished prompt for AI image generation,',
      'written for a microstock photographer.',
      '',
      'Write a single paragraph of 25 to 60 words describing the subject, setting,',
      'lighting, mood, composition and visual style in concrete terms, so the result',
      'reads as a finished commercial stock photo.',
      'Do not mention artists, brands, celebrities, camera models or software.',
      'Do not use lists, headings or quotation marks.',
      'Reply with the prompt text only.',
      '',
      AI_RULES,
    ].join('\n'),
  },
  metadata: {
    maxTokens: 1400,
    system: [
      'You write microstock metadata for an image described by the user\'s image prompt.',
      '',
      'Reply with JSON only, in exactly this shape:',
      '{"title": "string", "description": "string", "keywords": ["string"]}',
      '',
      '- title: 5 to 12 words describing the image, no trailing period, no brand names.',
      '- description: one or two factual sentences about the image.',
      '- keywords: 25 to 40 relevant single words or short phrases, lowercase,',
      '  most relevant first, no duplicates.',
      '',
      AI_RULES,
    ].join('\n'),
  },
};

// Replace an em dash with a comma so model output follows the app's copy
// rule, wherever it slipped through. Comments and code are out of scope; this
// is applied only to text a person reads.
function tidy(text) {
  return String(text == null ? '' : text)
    .replace(/—/g, ',')
    .replace(/[ \t]+,/g, ',')
    .replace(/,[ \t]*,/g, ',')
    .trim();
}

// A prompt arrives as one plain paragraph: no code fence, no wrapping quotes.
function cleanPromptText(raw) {
  let text = String(raw == null ? '' : raw).trim();
  text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();
  text = text.replace(/^["'“”]+/, '').replace(/["'“”]+$/, '').trim();
  return tidy(text).slice(0, 1200);
}

// Join the text blocks of a Messages API response. Thinking and other block
// types are ignored.
function extractText(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();
}

function isDecline(text) {
  return typeof text === 'string' && text.trim().startsWith(DECLINE);
}

// The model is asked for JSON, but may wrap it in a code fence or add a
// sentence around it, so find the object rather than parsing the whole text.
// Returns null for anything that is not usable metadata.
function parseMetadata(raw) {
  if (typeof raw !== 'string') return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  let data;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch (err) {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const title = tidy(typeof data.title === 'string' ? data.title : '')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  const description = tidy(typeof data.description === 'string' ? data.description : '')
    .replace(/\s+/g, ' ')
    .slice(0, 600);

  const keywords = [];
  const seen = new Set();
  if (Array.isArray(data.keywords)) {
    for (const entry of data.keywords) {
      if (typeof entry !== 'string') continue;
      const keyword = tidy(entry).toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
      if (!keyword || seen.has(keyword)) continue;
      seen.add(keyword);
      keywords.push(keyword);
      if (keywords.length >= 40) break;
    }
  }

  // A title, a description and a real keyword list are all required; a
  // partial answer is an error the user can retry, not a half-filled result.
  if (!title || !description || keywords.length < 5) return null;
  return { title, description, keywords };
}

// The request body for one task, or null for an unknown task.
function buildRequestBody(task, text) {
  const config = TASKS[task];
  if (!config) return null;
  const label = task === 'metadata' ? 'Image prompt' : 'Idea';
  return {
    model: MODEL,
    max_tokens: config.maxTokens,
    system: config.system,
    messages: [{ role: 'user', content: label + ':\n' + text }],
  };
}

module.exports = {
  MODEL,
  DECLINE,
  AI_RULES,
  TASKS,
  buildRequestBody,
  cleanPromptText,
  extractText,
  isDecline,
  parseMetadata,
};
