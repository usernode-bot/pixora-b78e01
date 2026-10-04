// Upscale Image: upload area, preview, 2x/4x option, Upscale button,
// result area. Mock processing.
import { el, pageHeader, workspace, uploadZone, imagePreview, segmented, badge, mockDelay } from '../ui.js';

export default {
  id: 'upscale',
  name: 'Upscale Image',
  path: '/upscale',
  tagline: 'Enlarge an image 2x or 4x',
  icon: 'maximize',
  render(view) {
    let file = null;
    const zone = uploadZone((f) => setFile(f));

    const meta = el('p', 'text-small text-muted', '');
    const removeBtn = el('button', 'btn-secondary', 'Remove image');
    removeBtn.type = 'button';
    const preview = el('div', 'hidden flex-col gap-2');

    const scale = segmented([{ value: 2, label: '2x' }, { value: 4, label: '4x' }], 2);

    const upscaleBtn = el('button', 'btn-primary', 'Upscale');
    upscaleBtn.type = 'button';
    upscaleBtn.id = 'upscale-btn';
    upscaleBtn.disabled = true;

    function setFile(next) {
      file = next;
      if (file) {
        preview.replaceChildren(imagePreview(file), meta, removeBtn);
        preview.classList.remove('hidden');
        preview.classList.add('flex');
        meta.textContent = file.name + ' · ' + file.width + ' × ' + file.height + ' px';
        upscaleBtn.disabled = false;
      } else {
        zone.reset();
        preview.replaceChildren();
        preview.classList.add('hidden');
        preview.classList.remove('flex');
        upscaleBtn.disabled = true;
      }
      show('empty');
    }
    removeBtn.addEventListener('click', () => setFile(null));

    // Results: exactly one of empty, loading, done shows at a time.
    const empty = el('div', 'state-empty', [
      el('p', 'text-heading', 'No result yet'),
      el('p', 'text-body text-muted', 'Upload an image, choose a scale and press Upscale.'),
    ]);
    const loading = el('div', 'skeleton aspect-video rounded-lg');
    const resultImage = el('img', 'mx-auto max-h-96 w-auto rounded');
    const resultBadge = badge('');
    const sizeCaption = el('p', 'text-small text-muted', '');
    const done = el('div', 'flex flex-col gap-3', [
      el('div', 'flex justify-center rounded-lg border border-line bg-surface p-4', [resultImage]),
      el('div', 'flex flex-wrap items-center gap-2', [resultBadge, sizeCaption]),
      el('p', 'text-small text-muted', 'Placeholder output. The original image is shown, not a real upscale.'),
    ]);
    loading.hidden = true;
    done.hidden = true;

    function show(state) {
      empty.hidden = state !== 'empty';
      loading.hidden = state !== 'loading';
      done.hidden = state !== 'done';
    }

    async function runUpscale() {
      if (!file) return;
      upscaleBtn.disabled = true;
      show('loading');
      await mockDelay(1200);
      resultImage.src = file.dataUrl;
      resultImage.alt = 'Mock upscaled preview of ' + file.name;
      resultBadge.textContent = scale.value + 'x upscale · mock';
      sizeCaption.textContent = 'Output size: '
        + (file.width * scale.value) + ' × ' + (file.height * scale.value) + ' px (mock)';
      show('done');
      upscaleBtn.disabled = false;
    }
    upscaleBtn.addEventListener('click', runUpscale);

    const controls = el('section', 'card flex flex-col gap-4', [
      el('div', 'flex flex-col gap-2', [el('h2', 'section-label', 'Image'), zone.root]),
      preview,
      el('div', 'flex flex-col gap-2', [el('h2', 'section-label', 'Scale'), scale.root]),
      upscaleBtn,
      el('p', 'text-small text-muted', 'Mock processing. No real AI is connected yet.'),
    ]);

    const results = el('section', 'flex flex-col gap-3', [
      el('h2', 'text-heading', 'Result'),
      empty,
      loading,
      done,
    ]);

    view.append(
      pageHeader('Upscale Image', 'Upload a photo and enlarge it 2x or 4x.'),
      workspace(controls, results),
    );
  },
};
