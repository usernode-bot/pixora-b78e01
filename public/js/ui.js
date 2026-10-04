// Shared UI helpers for PIXORA's tool workspaces.
//
// Everything is built with DOM APIs and textContent (never HTML strings for
// user data), and every class name is a whole literal so the precompiled
// Tailwind stylesheet keeps it. Icons are simple stroke SVGs drawn on a
// 24-unit grid; no emoji, no icon font.

const ICON_PATHS = {
  sparkles:
    '<path d="M12 3l1.8 4.9 4.9 1.8-4.9 1.8L12 16.4l-1.8-4.9-4.9-1.8 4.9-1.8L12 3z"/>' +
    '<path d="M18.5 14.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4z"/>',
  maximize:
    '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>' +
    '<line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
  isolate:
    '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>' +
    '<path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>' +
    '<line x1="8" y1="12" x2="16" y2="12"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/>' +
    '<path d="M21 15l-5-5L5 21"/>',
  upload:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
};

export function icon(name, cls) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICON_PATHS[name];
  if (cls) svg.setAttribute('class', cls);
  return svg;
}

// el('p', 'text-small text-muted', 'hello') -> <p class=...>hello</p>.
// children may be a string, a Node, an array of either, or null.
export function el(tag, cls, children) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (children != null) {
    (Array.isArray(children) ? children : [children]).forEach((child) => {
      if (child == null) return;
      node.append(child.nodeType ? child : document.createTextNode(child));
    });
  }
  return node;
}

// The page heading every tool starts with: one h1, one line of context.
export function pageHeader(title, description) {
  const wrap = el('div', 'flex flex-col gap-1');
  wrap.append(el('h1', 'text-title', title));
  if (description) wrap.append(el('p', 'text-body text-muted', description));
  return wrap;
}

// The two-column workspace: controls on the left, results on the right.
// Stacks on phones and tablets.
export function workspace(controlsEl, resultsEl) {
  return el('div', 'mt-6 grid items-start gap-6 lg:grid-cols-3', [
    el('div', 'flex flex-col gap-3', [controlsEl]),
    el('div', 'flex flex-col gap-3 lg:col-span-2', [resultsEl]),
  ]);
}

export function badge(text) {
  return el('span', 'rounded-full bg-accent/10 px-3 py-1 text-small font-medium text-accent', text);
}

// Placeholder latency for mock processing. Swap the mockDelay + result
// builders in a tool for a real API call when AI is wired up.
export function mockDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The upload drop zone shared by Upscale Image and Remove Background.
// Reads the chosen file client-side (data URL plus natural dimensions) and
// hands it to onFile. Nothing is uploaded anywhere: processing is mock.
// Returns { root, reset } so a tool can clear the input after "Remove image".
export function uploadZone(onFile) {
  const input = el('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp';
  input.className = 'sr-only';

  const zone = el('button',
    'flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line bg-ground px-4 py-6 text-center hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus', [
    icon('upload', 'h-6 w-6 text-muted'),
    el('span', 'text-body font-medium', 'Click to upload or drag an image here'),
    el('span', 'block text-small text-muted', 'PNG, JPEG or WebP up to 10 MB'),
  ]);
  zone.type = 'button';

  const error = el('p', 'hidden text-small text-danger', '');

  function fail(message) {
    error.textContent = message;
    error.classList.remove('hidden');
  }

  function handle(file) {
    error.classList.add('hidden');
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      fail('That file type is not supported. Use PNG, JPEG or WebP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      fail('That file is larger than 10 MB. Choose a smaller image.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => fail('That image could not be read. Try another file.');
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => fail('That image could not be read. Try another file.');
      img.onload = () => onFile({
        name: file.name,
        size: file.size,
        dataUrl: reader.result,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => handle(input.files && input.files[0]));
  ['dragenter', 'dragover'].forEach((ev) =>
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('border-accent'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('border-accent'); }));
  zone.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handle(file);
  });

  const root = el('div', 'flex flex-col gap-2', [input, zone, error]);
  return { root, reset: () => { input.value = ''; } };
}

export function imagePreview(file, cls) {
  const img = el('img', cls || 'mx-auto max-h-64 w-auto rounded-lg border border-line');
  img.src = file.dataUrl;
  img.alt = 'Preview of ' + file.name;
  return img;
}

// The 2x / 4x chooser: a two-button segmented control with aria-pressed.
export function segmented(options, initial) {
  let value = initial;
  const buttons = new Map();
  const root = el('div', 'grid grid-cols-2 gap-1 rounded-lg border border-line bg-raised p-1');
  for (const opt of options) {
    const b = el('button',
      'min-h-11 rounded-md px-4 text-body font-medium text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
      opt.label);
    b.type = 'button';
    b.addEventListener('click', () => set(opt.value));
    buttons.set(opt.value, b);
    root.append(b);
  }
  function set(next) {
    value = next;
    for (const [val, b] of buttons) {
      const active = val === next;
      b.classList.toggle('bg-surface', active);
      b.classList.toggle('text-fg', active);
      b.classList.toggle('text-muted', !active);
      b.setAttribute('aria-pressed', String(active));
    }
  }
  set(initial);
  return { root, get value() { return value; } };
}
