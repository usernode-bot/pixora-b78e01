// Creative: prompt input, Generate button, results area. Mock processing.
import { el, icon, pageHeader, workspace, mockDelay } from '../ui.js';
import { conversionDone } from '../onboarding.js';

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
      el('p', 'text-small text-muted', 'Mock processing. No real AI is connected yet.'),
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

    // The mock AI engine is always on, so its dot is always green.
    const aiStatus = el('span',
      'relative inline-flex min-h-14 w-14 flex-col items-center justify-center gap-1 rounded-md px-1 py-1 text-small font-medium text-muted');
    aiStatus.title = 'AI: mock mode active';
    aiStatus.append(icon('sparkles', 'h-6 w-6'));
    aiStatus.append(el('span',
      'absolute right-3 top-2 h-2 w-2 rounded-full bg-success ring-2 ring-surface'));
    const aiLabel = el('span', null, 'AI');
    aiLabel.setAttribute('aria-hidden', 'true');
    aiStatus.append(aiLabel);
    aiStatus.append(el('span', 'sr-only', 'AI status: mock mode active'));

    const toolbar = el('div',
      'flex items-center gap-1 rounded-lg border border-line bg-surface p-1',
      [inputBtn, exportTxt, promptBtn, exportCsv, aiStatus]);
    toolbar.id = 'creative-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Creative tools');

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

    view.append(header, workspace(controls, results));
  },
};
