// Creative: prompt input, Generate button, results area. Mock processing.
import { el, icon, pageHeader, workspace, mockDelay } from '../ui.js';

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
      generateBtn,
      message,
      el('p', 'text-small text-muted', 'Mock processing. No real AI is connected yet.'),
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
      show('loading');
      await mockDelay(1500);
      caption.textContent = 'Mock previews for "' + text + '"';
      grid.replaceChildren(...[1, 2, 3, 4].map((n) =>
        el('figure', 'flex aspect-square flex-col items-center justify-center gap-2 rounded-lg bg-raised text-muted', [
          icon('image', 'h-8 w-8'),
          el('figcaption', 'text-small', 'Mock preview ' + n),
        ])));
      show('done');
      generateBtn.disabled = false;
    }
    generateBtn.addEventListener('click', generate);

    const results = el('section', 'flex flex-col gap-3', [
      el('h2', 'text-heading', 'Results'),
      empty,
      loading,
      done,
    ]);

    view.append(
      pageHeader('Creative', 'Describe an image and generate previews.'),
      workspace(controls, results),
    );
  },
};
