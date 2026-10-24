// Creative: prompt input, Generate button, results area. Mock processing.
import { el, icon, pageHeader, workspace, mockDelay } from '../ui.js';
import { conversionDone } from '../onboarding.js';
import { AiError, getAiStatus, getAiUsage, runAssistant } from '../ai.js';
import { buildPrompt, draftMetadata } from '../manual.js';

// Download a small text file from the browser. Results are mock captions,
// not real images, so the toolbar's Export and CSV actions write those.
function downloadText(filename, type, text) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// One item in the workspace header toolbar: the icon over its visible name,
// evenly sized with the others. The label is the accessible name; the
// tooltip says what the button does.
function toolbarButton(name, label, description) {
  const button = el('button',
    'inline-flex min-h-14 w-14 flex-col items-center justify-center gap-1 rounded-md px-1 py-1 text-small font-medium text-muted hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50');
  button.type = 'button';
  if (description) button.title = description;
  button.append(icon(name, 'h-6 w-6'));
  button.append(el('span', null, label));
  return button;
}

export default {
  id: 'creative',
  name: 'Creative',
  path: '/creative',
  tagline: 'Generate images from a text prompt',
  icon: 'sparkles',
  render(view) {
    const prompt = el('textarea', 'field min-h-32 resize-y');
    prompt.id = 'creative-prompt';
    prompt.rows = 5;
    prompt.placeholder = 'Describe the image you want, for example: a minimal studio shot of a ceramic mug on linen';
    prompt.setAttribute('aria-label', 'Image prompt');
    const label = el('label', 'section-label', 'Prompt');
    label.htmlFor = 'creative-prompt';

    const message = el('p', 'text-small text-danger', '');
    const generateBtn = el('button', 'btn-primary', 'Generate');
    generateBtn.type = 'button';
    generateBtn.id = 'creative-generate';

    const controls = el('section', 'card flex flex-col gap-4', [
      el('div', 'flex flex-col gap-2', [label, prompt]),
      message,
      el('p', 'text-small text-muted', 'Image generation is mock. Use AI for prompt and metadata help.'),
    ]);

    // The toolbar holds the workspace utilities: jump to the prompt, export
    // the last captions, and the mock AI status. Export actions stay disabled
    // until a generation has produced something to write.
    const lastResults = { current: null };

    const exportTxt = toolbarButton('export', 'Export', 'Export captions');
    const exportCsv = toolbarButton('csv', 'CSV', 'Export CSV');
    exportTxt.disabled = true;
    exportCsv.disabled = true;

    function setExportReady(ready) {
      exportTxt.disabled = !ready;
      exportCsv.disabled = !ready;
    }

    function csvCell(value) {
      return '"' + String(value).replace(/"/g, '""') + '"';
    }

    exportTxt.addEventListener('click', () => {
      const results = lastResults.current;
      if (!results) return;
      downloadText('pixora-creative-previews.txt', 'text/plain',
        'Mock previews for "' + results.prompt + '"\n\n' +
        results.captions.map((caption, i) => (i + 1) + '. ' + caption).join('\n') + '\n');
    });
    exportCsv.addEventListener('click', () => {
      const results = lastResults.current;
      if (!results) return;
      const rows = [['index', 'caption']].concat(
        results.captions.map((caption, i) => [i + 1, caption]));
      downloadText('pixora-creative-previews.csv', 'text/csv',
        rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n');
    });

    const inputBtn = toolbarButton('input', 'Input', 'Focus the prompt input');
    inputBtn.addEventListener('click', () => prompt.focus());

    const promptBtn = toolbarButton('prompt', 'Prompt', 'Select the prompt');
    promptBtn.addEventListener('click', () => {
      prompt.focus();
      prompt.select();
    });

    // The assistant button. Its dot reports AI availability: green once the
    // platform's proxy says it is ready, neutral while that is unknown or
    // unavailable. The panel says more when it opens.
    const aiBtn = toolbarButton('sparkles', 'AI', 'Open the AI assistant');
    aiBtn.id = 'creative-ai';
    aiBtn.classList.add('relative');
    aiBtn.setAttribute('aria-expanded', 'false');
    aiBtn.setAttribute('aria-controls', 'creative-assistant');
    const aiDot = el('span',
      'absolute right-3 top-2 h-2 w-2 rounded-full bg-line ring-2 ring-surface');
    aiDot.setAttribute('aria-hidden', 'true');
    aiBtn.append(aiDot);

    const toolbar = el('div',
      'flex items-center gap-1 rounded-lg border border-line bg-surface p-1',
      [inputBtn, exportTxt, promptBtn, exportCsv, aiBtn]);
    toolbar.id = 'creative-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Creative tools');

    // ── Creative assistant ──────────────────────────────────────────────
    // Two text capabilities: turn an idea into a polished prompt, and write
    // microstock metadata for the prompt. Both run through the platform's
    // LLM proxy via this app's server when it can, and fall back to the
    // manual helpers in ../manual.js wherever it cannot. Image generation
    // stays mock.
    let aiState = 'checking'; // 'checking' | 'ready' | 'off' | 'error'

    const announce = el('p', 'sr-only', '');
    announce.setAttribute('role', 'status');
    announce.setAttribute('aria-live', 'polite');

    const usage = el('p', 'text-small text-muted', 'Checking AI availability');

    const noticeTitle = el('p', 'text-body font-medium', '');
    const noticeBody = el('p', 'text-small text-muted', '');
    const noticeAction = el('button', 'btn-secondary mt-2 self-start', 'Check again');
    noticeAction.type = 'button';
    const notice = el('div', 'flex flex-col gap-1 rounded-lg border border-line bg-raised p-4', [
      noticeTitle,
      noticeBody,
      noticeAction,
    ]);
    notice.hidden = true;
    notice.setAttribute('role', 'status');

    // One capability: a heading, an explanation that follows the mode, the
    // controls for that mode, and exactly one of loading, error and result
    // underneath. The controls themselves are rendered per mode by the
    // functions below: the AI action, or the manual alternative that works
    // without AI.
    function assistantSection(title) {
      const desc = el('p', 'text-small text-muted', '');
      const heading = el('div', 'flex flex-col gap-1', [
        el('h3', 'text-body font-medium', title),
        desc,
      ]);
      const controls = el('div', 'flex flex-col gap-3');
      const validation = el('p', 'text-small text-danger', '');
      validation.hidden = true;
      const loading = el('div', 'flex flex-col gap-2', [
        el('div', 'skeleton h-4 w-3/4'),
        el('div', 'skeleton h-4 w-full'),
        el('div', 'skeleton h-4 w-2/3'),
      ]);
      loading.hidden = true;
      const error = el('div', 'state-error rounded-lg border border-line bg-ground');
      error.hidden = true;
      const result = el('div', 'flex flex-col gap-3');
      result.hidden = true;
      result.setAttribute('aria-live', 'polite');
      const root = el('section', 'flex flex-col gap-3', [
        heading,
        controls,
        validation,
        loading,
        error,
        result,
      ]);
      return { root, desc, controls, action: null, validation, loading, error, result };
    }

    // Copy on the click itself: the clipboard call needs the user gesture.
    async function copyText(value, button, label) {
      let copied = false;
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch (err) {
        // A frame can refuse the clipboard API. Fall back to selecting the
        // text, which the browser copies from the same gesture.
        const field = el('textarea', 'sr-only');
        field.value = value;
        field.setAttribute('readonly', '');
        document.body.append(field);
        field.select();
        try {
          copied = document.execCommand('copy');
        } catch (execErr) {
          copied = false;
        }
        field.remove();
      }
      announce.textContent = copied ? label + ' copied' : label + ' could not be copied';
      button.textContent = copied ? 'Copied' : 'Copy failed';
      setTimeout(() => { button.textContent = 'Copy'; }, 1500);
    }

    function promptResult(text) {
      const useBtn = el('button', 'btn-secondary', 'Use as prompt');
      useBtn.type = 'button';
      useBtn.addEventListener('click', () => {
        prompt.value = text;
        prompt.focus();
        prompt.setSelectionRange(text.length, text.length);
        announce.textContent = 'The prompt box now holds the polished prompt.';
      });
      const copyBtn = el('button', 'btn-secondary', 'Copy');
      copyBtn.type = 'button';
      copyBtn.setAttribute('aria-label', 'Copy the polished prompt');
      copyBtn.addEventListener('click', () => copyText(text, copyBtn, 'Polished prompt'));
      return [
        el('div', 'flex flex-col gap-1', [
          el('p', 'text-small font-medium text-muted', 'Polished prompt'),
          el('p', 'whitespace-pre-wrap break-words rounded-lg border border-line bg-ground p-3 text-body', text),
        ]),
        el('div', 'flex flex-wrap gap-2', [useBtn, copyBtn]),
      ];
    }

    function metadataRow(label, value) {
      const copyBtn = el('button', 'btn-secondary shrink-0 px-3', 'Copy');
      copyBtn.type = 'button';
      copyBtn.setAttribute('aria-label', 'Copy ' + label.toLowerCase());
      copyBtn.addEventListener('click', () => copyText(value, copyBtn, label));
      return el('div', 'list-row items-start', [
        el('div', 'flex min-w-0 flex-1 flex-col gap-1', [
          el('p', 'text-small font-medium text-muted', label),
          el('p', 'break-words text-body', value),
        ]),
        copyBtn,
      ]);
    }

    function metadataResult(metadata) {
      return [
        el('div', 'list', [
          metadataRow('Title', metadata.title),
          metadataRow('Description', metadata.description),
          metadataRow('Keywords', metadata.keywords.join(', ')),
        ]),
        // The AI path refuses fewer than five keywords, so a short list can
        // only come from the manual drafter; say so there.
        el('p', 'text-small text-muted', metadata.keywords.length + ' keywords, most relevant first.' +
          (metadata.keywords.length < 5 ? ' Drafted without AI, so the list may be short.' : '')),
      ];
    }

    function declinedNode(message) {
      return el('p', 'text-body', message);
    }

    function showPartError(part, message, retry) {
      const retryBtn = el('button', 'btn-secondary', 'Retry');
      retryBtn.type = 'button';
      retryBtn.addEventListener('click', retry);
      const actions = el('div', 'flex flex-wrap gap-2', [retryBtn]);
      // A failed call is not a dead end: the section can finish its job
      // without AI for the rest of the session.
      if (part.mode === 'ai') {
        const manualBtn = el('button', 'btn-secondary', 'Use the manual tool');
        manualBtn.type = 'button';
        manualBtn.addEventListener('click', () => setMode(part, 'manual'));
        actions.append(manualBtn);
      }
      part.error.replaceChildren(
        icon('sparkles', 'h-6 w-6 text-muted'),
        el('p', 'text-body font-medium', 'The assistant could not answer'),
        el('p', 'text-small text-muted', message),
        actions,
      );
      part.error.hidden = false;
    }

    async function runPart(part, produce) {
      part.action.disabled = true;
      part.validation.hidden = true;
      part.result.hidden = true;
      part.error.hidden = true;
      part.loading.hidden = false;
      try {
        const content = await produce();
        part.result.replaceChildren(...(Array.isArray(content) ? content : [content]));
        part.result.hidden = false;
      } catch (err) {
        if (err && err.code === 'ai_unavailable') setAiState('off');
        showPartError(part,
          err && err.message ? err.message : 'The assistant could not answer. Try again.',
          () => runPart(part, produce));
      } finally {
        part.loading.hidden = true;
        syncAction(part);
        if (aiState === 'ready') refreshUsage();
      }
    }

    const promptPart = assistantSection('Prompt builder');
    const metaPart = assistantSection('Microstock metadata');
    promptPart.mode = 'ai';
    metaPart.mode = 'ai';

    function currentPrompt(part) {
      const text = prompt.value.trim();
      if (!text) {
        part.validation.textContent = 'Write an idea in the prompt box first.';
        part.validation.hidden = false;
        prompt.focus();
        return null;
      }
      return text;
    }

    // The six guided fields of the manual prompt builder. Their placeholders
    // are fragments, so the assembled paragraph reads as one piece.
    const PROMPT_FIELDS = [
      ['subject', 'Subject', 'a hand-thrown ceramic mug'],
      ['setting', 'Setting', 'on natural linen'],
      ['lighting', 'Lighting', 'soft morning light'],
      ['mood', 'Mood', 'calm and warm'],
      ['composition', 'Composition', 'close-up, shallow depth of field'],
      ['style', 'Style', 'minimal commercial studio photo'],
    ];

    function fieldInput(labelText, placeholder) {
      const input = el('input', 'field');
      input.type = 'text';
      input.placeholder = placeholder;
      input.setAttribute('aria-label', labelText);
      const label = el('label', 'text-small font-medium text-muted', labelText);
      return { wrap: el('div', 'flex flex-col gap-1', [label, input]), input };
    }

    // A section's controls follow its mode: the AI action when the panel is
    // ready, the manual alternative wherever AI cannot answer.
    function renderPromptControls(part) {
      if (part.mode === 'manual') {
        part.desc.textContent = 'Assembles a polished prompt from the fields below. Works without AI.';
        const grid = el('div', 'grid gap-2 sm:grid-cols-2');
        const inputs = {};
        for (const [key, label, placeholder] of PROMPT_FIELDS) {
          const row = fieldInput(label, placeholder);
          inputs[key] = row.input;
          grid.append(row.wrap);
        }
        const buildBtn = el('button', 'btn-secondary self-start', 'Build prompt');
        buildBtn.type = 'button';
        buildBtn.id = 'creative-prompt-build';
        part.controls.replaceChildren(grid, buildBtn);
        part.action = buildBtn;
        buildBtn.addEventListener('click', () => {
          const fields = {};
          for (const [key] of PROMPT_FIELDS) fields[key] = inputs[key].value.trim();
          part.validation.hidden = true;
          if (!fields.subject) {
            part.validation.textContent = 'Name a subject first.';
            part.validation.hidden = false;
            inputs.subject.focus();
            return;
          }
          runPart(part, async () => {
            await mockDelay(400);
            return promptResult(buildPrompt(fields));
          });
        });
      } else {
        part.desc.textContent = 'Turns the idea in the prompt box into a polished, ready-to-use image prompt.';
        const aiBtn = el('button', 'btn-secondary self-start', 'Improve prompt');
        aiBtn.type = 'button';
        aiBtn.id = 'creative-ai-prompt-run';
        part.controls.replaceChildren(aiBtn);
        part.action = aiBtn;
        aiBtn.addEventListener('click', () => {
          const text = currentPrompt(part);
          if (!text) return;
          runPart(part, async () => {
            const data = await runAssistant('prompt', text);
            if (data.declined) return declinedNode(data.message);
            if (!data.text) throw new AiError('The assistant did not return a prompt. Try again.');
            return promptResult(data.text);
          });
        });
      }
      syncAction(part);
    }

    function renderMetaControls(part) {
      if (part.mode === 'manual') {
        part.desc.textContent = 'Drafts a title, a description and keywords from the text in the prompt box. Works without AI.';
        const draftBtn = el('button', 'btn-secondary self-start', 'Draft metadata');
        draftBtn.type = 'button';
        draftBtn.id = 'creative-metadata-draft';
        part.controls.replaceChildren(draftBtn);
        part.action = draftBtn;
        draftBtn.addEventListener('click', () => {
          const text = currentPrompt(part);
          if (!text) return;
          runPart(part, async () => {
            await mockDelay(400);
            return metadataResult(draftMetadata(text));
          });
        });
      } else {
        part.desc.textContent = 'Writes a title, a description and keywords for the text in the prompt box.';
        const aiBtn = el('button', 'btn-secondary self-start', 'Write metadata');
        aiBtn.type = 'button';
        aiBtn.id = 'creative-ai-metadata-run';
        part.controls.replaceChildren(aiBtn);
        part.action = aiBtn;
        aiBtn.addEventListener('click', () => {
          const text = currentPrompt(part);
          if (!text) return;
          runPart(part, async () => {
            const data = await runAssistant('metadata', text);
            if (data.declined) return declinedNode(data.message);
            if (!data.metadata) throw new AiError('The assistant did not return metadata. Try again.');
            return metadataResult(data.metadata);
          });
        });
      }
      syncAction(part);
    }

    // Switch a section's mode and re-render its controls. Session state
    // only: a fresh page load re-derives everything from /api/ai/status.
    function setMode(part, next) {
      if (part.mode === next) {
        syncAction(part);
        return;
      }
      part.mode = next;
      part.validation.hidden = true;
      part.error.hidden = true;
      part.result.hidden = true;
      if (part === promptPart) renderPromptControls(part);
      else renderMetaControls(part);
    }

    // AI actions wait for a ready panel; manual ones always work.
    function syncAction(part) {
      if (part.action) part.action.disabled = part.mode === 'ai' && aiState !== 'ready';
    }

    renderPromptControls(promptPart);
    renderMetaControls(metaPart);

    function dollars(cents) {
      const value = Number(cents);
      if (!Number.isFinite(value)) return '$0.00';
      return '$' + (value / 100).toFixed(2);
    }

    async function refreshUsage() {
      const result = await getAiUsage();
      if (aiState !== 'ready') return;
      if (!result || !result.available) {
        usage.textContent = 'AI usage is unavailable here.';
      } else if (result.granted) {
        usage.textContent = 'AI usage today: ' + dollars(result.spentCentsToday) +
          ' of ' + dollars(result.dailyCapCents);
      } else {
        usage.textContent = 'AI access is not granted yet. The first request asks for it.';
      }
    }

    function setAiState(next) {
      const prev = aiState;
      aiState = next;
      const ready = next === 'ready';
      aiDot.classList.toggle('bg-success', ready);
      aiDot.classList.toggle('bg-line', !ready);
      notice.hidden = next === 'ready' || next === 'checking';
      if (next === 'checking') {
        usage.textContent = 'Checking AI availability';
      } else if (next === 'off') {
        noticeTitle.textContent = 'AI is not available in this environment';
        noticeBody.textContent = 'Homeroom AI is not connected here. The manual prompt builder and the metadata drafter below work without it.';
        noticeAction.hidden = true;
        usage.textContent = '';
      } else if (next === 'error') {
        noticeTitle.textContent = 'AI could not be reached';
        noticeBody.textContent = 'The app could not ask the platform about AI. Open PIXORA inside Homeroom and try again. The manual tools below still work.';
        noticeAction.hidden = false;
        usage.textContent = '';
      }
      // The sections follow the state: the manual tools wherever AI cannot
      // answer, the AI actions once a fresh check says it can.
      if (next === 'off' || next === 'error') {
        setMode(promptPart, 'manual');
        setMode(metaPart, 'manual');
      } else if (next === 'ready') {
        if (prev !== 'ready') {
          setMode(promptPart, 'ai');
          setMode(metaPart, 'ai');
        } else {
          syncAction(promptPart);
          syncAction(metaPart);
        }
        refreshUsage();
      } else {
        syncAction(promptPart);
        syncAction(metaPart);
      }
    }

    async function loadAiStatus() {
      setAiState('checking');
      try {
        const status = await getAiStatus();
        setAiState(status.available ? 'ready' : 'off');
      } catch (err) {
        setAiState('error');
      }
      // setAiState('ready') already starts the usage refresh.
    }
    noticeAction.addEventListener('click', loadAiStatus);

    const assistantTitle = el('h2', 'text-heading', 'Creative assistant');
    assistantTitle.id = 'creative-assistant-title';
    const assistantSummary = el('p', 'text-small text-muted',
      'Turns your idea into an image prompt and stock metadata. Uses Homeroom AI when it is available, with manual tools when it is not.');
    assistantSummary.id = 'creative-assistant-summary';

    const closeAiBtn = el('button', 'btn-secondary px-3', 'Close');
    closeAiBtn.type = 'button';

    const assistantHead = el('div', 'flex flex-wrap items-start justify-between gap-3', [
      el('div', 'flex flex-col gap-1', [assistantTitle, assistantSummary]),
      closeAiBtn,
    ]);

    const assistant = el('section', 'card mt-6 flex flex-col gap-5');
    assistant.id = 'creative-assistant';
    assistant.hidden = true;
    assistant.setAttribute('aria-labelledby', 'creative-assistant-title');
    assistant.setAttribute('aria-describedby', 'creative-assistant-summary');
    assistant.append(
      assistantHead,
      notice,
      el('div', 'grid gap-6 lg:grid-cols-2', [promptPart.root, metaPart.root]),
      el('div', 'flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between', [
        el('p', 'text-small text-muted', 'Image generation is still mock. With AI the assistant polishes the prompt and writes the metadata; without it, the manual tools above do.'),
        usage,
      ]),
      announce,
    );

    function setAssistantOpen(open) {
      assistant.hidden = !open;
      aiBtn.setAttribute('aria-expanded', String(open));
      aiBtn.classList.toggle('bg-raised', open);
      if (open) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        assistant.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
      }
    }

    aiBtn.addEventListener('click', () => setAssistantOpen(assistant.hidden));
    closeAiBtn.addEventListener('click', () => {
      setAssistantOpen(false);
      aiBtn.focus();
    });

    loadAiStatus();

    // The workspace header: title on the left, the toolbar and the one
    // primary action on the right, separated by a thin rule. Stacks on
    // phones, where the Generate pair wraps to its own right-aligned row.
    const header = el('div',
      'flex flex-col gap-4 md:flex-row md:items-start md:justify-between', [
      pageHeader('Creative', 'Describe an image and generate previews.'),
      el('div', 'flex flex-wrap items-center gap-2 md:justify-end', [
        toolbar,
        el('div', 'ml-auto flex items-center gap-2', [
          el('span', 'h-8 w-px bg-line'),
          generateBtn,
        ]),
      ]),
    ]);

    // Results: exactly one of empty, loading, done shows at a time.
    const empty = el('div', 'state-empty', [
      icon('image', 'h-6 w-6 text-muted'),
      el('p', 'text-heading', 'No results yet'),
      el('p', 'text-body text-muted', 'Write a prompt and press Generate.'),
    ]);
    const loading = el('div', 'grid grid-cols-2 gap-4',
      [1, 2, 3, 4].map(() => el('div', 'skeleton aspect-square rounded-lg')));
    const grid = el('div', 'grid grid-cols-2 gap-4');
    const caption = el('p', 'text-small text-muted', '');
    const done = el('div', 'flex flex-col gap-3', [
      caption,
      grid,
      el('p', 'text-small text-muted', 'Placeholder output. Real generation comes later.'),
    ]);
    loading.hidden = true;
    done.hidden = true;

    function show(state) {
      empty.hidden = state !== 'empty';
      loading.hidden = state !== 'loading';
      done.hidden = state !== 'done';
    }

    async function generate() {
      const text = prompt.value.trim();
      if (!text) {
        message.textContent = 'Write a prompt first.';
        prompt.focus();
        return;
      }
      message.textContent = '';
      generateBtn.disabled = true;
      setExportReady(false);
      show('loading');
      await mockDelay(1500);
      const captions = [1, 2, 3, 4].map((n) => 'Mock preview ' + n);
      caption.textContent = 'Mock previews for "' + text + '"';
      grid.replaceChildren(...captions.map((previewCaption) =>
        el('figure', 'flex aspect-square flex-col items-center justify-center gap-2 rounded-lg bg-raised text-muted', [
          icon('image', 'h-8 w-8'),
          el('figcaption', 'text-small', previewCaption),
        ])));
      lastResults.current = { prompt: text, captions };
      setExportReady(true);
      show('done');
      generateBtn.disabled = false;
      conversionDone();
    }
    generateBtn.addEventListener('click', generate);

    const results = el('section', 'flex flex-col gap-3', [
      el('h2', 'text-heading', 'Results'),
      empty,
      loading,
      done,
    ]);

    view.append(header, assistant, workspace(controls, results));
  },
};
