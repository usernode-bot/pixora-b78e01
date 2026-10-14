// Guards the first-run guide's contract in the source itself: the copy a
// visitor reads, the accessibility hooks, the one localStorage key, the
// sample's dimensions, and the whole-literal class rule the precompiled
// Tailwind build depends on.
//
// These read the files, so they are fast and need no DOM. They fail without
// the change: before it, public/js/onboarding.js and the #onboarding section
// do not exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const onboardingJs = readFileSync(path.join(root, 'public', 'js', 'onboarding.js'), 'utf8');
const mainJs = readFileSync(path.join(root, 'public', 'js', 'main.js'), 'utf8');

test('the guide carries its heading, guarantee and three steps', () => {
  assert.match(html, /Convert images in your browser/);
  assert.match(html, /Nothing is uploaded\. Files never leave your device\./);
  assert.match(html, /Add your images/);
  assert.match(html, /Choose a format and a size/);
  assert.match(html, /Download them one by one, or all together as one \.zip/);
});

test('the guide is a labelled region with a polite status line', () => {
  assert.match(html, /id="onboarding"[^>]*data-onboarding[^>]*aria-labelledby="onboarding-heading"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /id="onboarding-heading"/);
});

test('the guide ships hidden so a returning visitor never sees it flash', () => {
  assert.match(html, /<section id="onboarding" data-onboarding hidden/);
});

test('the dropzone is a focusable control that fronts a file input', () => {
  assert.match(html, /<button id="onboarding-dropzone" type="button"/);
  assert.match(html, /focus-visible:ring-2 focus-visible:ring-focus/);
  assert.match(html, /<input id="onboarding-file"[^>]*type="file"/);
});

test('the "?" header buttons carry an accessible name', () => {
  const opens = html.match(/data-guide-open/g) || [];
  assert.equal(opens.length, 2, 'one "?" in the desktop sidebar, one in the mobile header');
  assert.match(html, /aria-label="Show the getting-started guide"/);
});

test('one localStorage key holds the flag, with both completion values', () => {
  assert.match(onboardingJs, /'pixora:onboarded'/);
  assert.match(onboardingJs, /'done'/);
  assert.match(onboardingJs, /'dismissed'/);
  // One key only: a second key would let the two answers diverge.
  const keys = onboardingJs.match(/localStorage\.(?:getItem|setItem)\(/g) || [];
  assert.equal(keys.length, 2);
});

test('the sample is a 1600x1000 canvas with a label, built without the network', () => {
  assert.match(onboardingJs, /canvas\.width = 1600/);
  assert.match(onboardingJs, /canvas\.height = 1000/);
  assert.match(onboardingJs, /createLinearGradient/);
  assert.match(onboardingJs, /fillText\('SAMPLE'/);
  assert.match(onboardingJs, /toDataURL\('image\/png'\)/);
  assert.doesNotMatch(onboardingJs, /\bfetch\(/);
  assert.doesNotMatch(onboardingJs, /new Image\([^)]*\)\s*;?\s*[^\n]*\.src\s*=\s*'(?:https?:)?\/\//);
});

test('the guide is the home empty state, so the router keys it on the route', () => {
  assert.match(mainJs, /shouldShowGuide\(!tool\)/);
  assert.match(mainJs, /route\.replaceChildren\(\)/);
});

test('every class name is a whole literal, so the Tailwind build keeps it', () => {
  // A class assembled at runtime is invisible to Tailwind's extractor. Check
  // real code only: the files also carry comments that quote the bad pattern
  // as an example, so strip comments first.
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  for (const source of [html, onboardingJs, mainJs]) {
    const code = stripComments(source);
    assert.doesNotMatch(code, /['"`]bg-\s*['"`]\s*\+/, 'a class is assembled from fragments');
    assert.doesNotMatch(code, /\.className\s*=\s*['"`][^'"`]*['"`]\s*\+/, 'a className is built by concatenation');
  }
});
