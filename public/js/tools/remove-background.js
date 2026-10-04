// Remove Background: upload area, preview, Remove Background button,
// result area. Mock processing.
import { el, pageHeader, workspace, uploadZone, imagePreview, badge, mockDelay } from '../ui.js';

export default {
  id: 'remove-background',
  name: 'Remove Background',
  path: '/remove-background',
  tagline: 'Isolate your subject on a transparent background',
  icon: 'isolate',
  render(view) {
    let file = null;
    const zone = uploadZone((f) => setFile(f));

    const meta = el('p', 'text-small text-muted', '');
    const removeBtn = el('button', 'btn-secondary', 'Remove image');
    removeBtn.type = 'button';
    const preview = el('div', 'hidden flex-col gap-2');

    const removeBgBtn = el('button', 'btn-primary', 'Remove Background');
    removeBgBtn.type = 'button';
    removeBgBtn.id = 'removebg-btn';
    removeBgBtn.disabled = true;

    function setFile(next) {
      file = next;
      if (file) {
        preview.replaceChildren(imagePreview(file), meta, removeBtn);
        preview.classList.remove('hidden');
        preview.classList.add('flex');
        meta.textContent = file.name + ' · ' + file.width + ' × ' + file.height + ' px';
        removeBgBtn.disabled = false;
      } else {
        zone.reset();
        preview.replaceChildren();
        preview.classList.add('hidden');
        preview.classList.remove('flex');
        removeBgBtn.disabled = true;
      }
      show('empty');
    }
    removeBtn.addEventListener('click', () => setFile(null));

    // Results: exactly one of empty, loading, done shows at a time.
    const empty = el('div', 'state-empty', [
      el('p', 'text-heading', 'No result yet'),
      el('p', 'text-body text-muted', 'Upload an image and press Remove Background.'),
    ]);
    const loading = el('div', 'skeleton aspect-video rounded-lg');
    const resultImage = el('img', 'mx-auto max-h-96 w-auto rounded');
    const done = el('div', 'flex flex-col gap-3', [
      el('div', 'checker-bg flex justify-center rounded-lg border border-line p-4', [resultImage]),
      el('div', 'flex flex-wrap items-center gap-2', [badge('Background removed · mock')]),
      el('p', 'text-small text-muted', 'Placeholder output. The checkerboard stands in for transparency.'),
    ]);
    loading.hidden = true;
    done.hidden = true;

    function show(state) {
      empty.hidden = state !== 'empty';
      loading.hidden = state !== 'loading';
      done.hidden = state !== 'done';
    }

    async function runRemove() {
      if (!file) return;
      removeBgBtn.disabled = true;
      show('loading');
      await mockDelay(1200);
      resultImage.src = file.dataUrl;
      resultImage.alt = 'Mock background-removed preview of ' + file.name;
      show('done');
      removeBgBtn.disabled = false;
    }
    removeBgBtn.addEventListener('click', runRemove);

    const controls = el('section', 'card flex flex-col gap-4', [
      el('div', 'flex flex-col gap-2', [el('h2', 'section-label', 'Image'), zone.root]),
      preview,
      removeBgBtn,
      el('p', 'text-small text-muted', 'Mock processing. No real AI is connected yet.'),
    ]);

    const results = el('section', 'flex flex-col gap-3', [
      el('h2', 'text-heading', 'Result'),
      empty,
      loading,
      done,
    ]);

    view.append(
      pageHeader('Remove Background', 'Upload a photo and strip the background.'),
      workspace(controls, results),
    );
  },
};
