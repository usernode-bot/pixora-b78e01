// First-run onboarding for PIXORA.
//
// The guide is markup in public/index.html (so it paints with the shell);
// this module decides whether it shows, remembers the choice, draws the
// "Try a sample" image, and hands an image to whichever tool is open through
// the same contract an upload produces.
//
// Nothing here touches the network: the sample is drawn on a canvas and
// exported as a data URL, exactly like a file the user picked.

// One key. Read it, and never seed it: the app's own logic reads it, so a
// fabricated value would answer a question only a real conversion or a real
// dismissal may answer.
const FLAG_KEY = 'pixora:onboarded';
const DONE = 'done';
const DISMISSED = 'dismissed';

// What the file picker and the sample both accept, matching the tools.
const ACCEPTED = /^image\/(png|jpeg|webp)$/;
const MAX_BYTES = 10 * 1024 * 1024;

// An image the guide asked a tool to load, waiting for that tool to render.
// The guide navigates to the tool, so "the tool is ready" is "the tool
// called takePendingFile()", which is why the image is parked here first.
let pendingFile = null;

// Set by the "?" buttons for the session only: it reopens the guide
// regardless of the flag, and a reload goes back to the flag's answer.
let reopened = false;

// The wired guide, so a conversion can update it and hide it.
let controller = null;

export function readFlag() {
  try {
    return window.localStorage.getItem(FLAG_KEY);
  } catch (err) {
    // Private modes and blocked storage throw. Treat that as "no flag":
    // better a returning visitor sees the guide again than a crash.
    return null;
  }
}

export function markOnboarded(value) {
  try {
    window.localStorage.setItem(FLAG_KEY, value);
  } catch (err) {
    // Storage unavailable: the choice holds for this page's session only.
  }
}

export function isFirstRun() {
  return readFlag() === null;
}

// The guide is the home empty state, so it belongs to the home route only.
export function shouldShowGuide(routeIsHome) {
  if (!routeIsHome) return false;
  return isFirstRun() || reopened;
}

// A tool calls this when its work reaches a finished result: the visitor has
// now seen a conversion, so the guide has done its job.
export function conversionDone() {
  markOnboarded(DONE);
  if (controller) {
    controller.status.textContent = '1 of 1 done';
    controller.root.hidden = true;
  }
}

// A tool calls this once, at the top of its render. It returns the image the
// guide parked, or null when there is none, so a tool that never sees a
// sample behaves exactly as it did before.
export function takePendingFile() {
  const file = pendingFile;
  pendingFile = null;
  return file;
}

// Draw the sample: a 1600x1000 canvas with a soft gradient, a circle and a
// rounded rectangle, and a label. No asset file, no fetch, no Image source.
export function sampleImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');

  // If a canvas context is somehow refused, report no sample rather than
  // throwing inside a click handler.
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#4f46e5');
  gradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.arc(1120, 340, 260, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(1120, 340, 360, 0, Math.PI * 2);
  ctx.stroke();

  const barX = 160;
  const barY = 800;
  const barW = 480;
  const barH = 24;
  const r = barH / 2;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.moveTo(barX + r, barY);
  ctx.lineTo(barX + barW - r, barY);
  ctx.quadraticCurveTo(barX + barW, barY, barX + barW, barY + r);
  ctx.lineTo(barX + barW, barY + barH - r);
  ctx.quadraticCurveTo(barX + barW, barY + barH, barX + barW - r, barY + barH);
  ctx.lineTo(barX + r, barY + barH);
  ctx.quadraticCurveTo(barX, barY + barH, barX, barY + barH - r);
  ctx.lineTo(barX, barY + r);
  ctx.quadraticCurveTo(barX, barY, barX + r, barY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 96px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('SAMPLE', 160, 720);
  ctx.font = '400 40px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fillText('1600 x 1000', 160, 780);

  // dataURL is "data:image/png;base64,<payload>": derive the byte size the
  // way a real file's size is reported, without decoding the image.
  const dataUrl = canvas.toDataURL('image/png');
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';
  const padding = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0);
  const size = Math.max(0, Math.round((base64.length * 3) / 4) - padding);

  return {
    name: 'pixora-sample.png',
    size,
    dataUrl,
    width: canvas.width,
    height: canvas.height,
  };
}

// Read a picked file into the same shape an upload produces: a data URL plus
// the natural dimensions. Rejects with a sentence to show in the status line.
export function readPickedFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!ACCEPTED.test(file.type)) {
      return reject(new Error('That file type is not supported. Use PNG, JPEG or WebP.'));
    }
    if (file.size > MAX_BYTES) {
      return reject(new Error('That file is larger than 10 MB. Choose a smaller image.'));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That image could not be read. Try another file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be read. Try another file.'));
      img.onload = () => resolve({
        name: file.name,
        size: file.size,
        dataUrl: reader.result,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Park an image and open a tool that can load it.
function handOff(file, openTool) {
  pendingFile = file;
  openTool();
}

// Wire the guide's markup. `openTool` routes to a tool that can receive an
// image; the guide itself handles both the sample and picked files.
export function initOnboarding({ root, openTool }) {
  const status = root.querySelector('#onboarding-status');
  const dismissBtn = root.querySelector('#onboarding-dismiss');
  const sampleBtn = root.querySelector('#onboarding-sample');
  const dropzone = root.querySelector('#onboarding-dropzone');
  const input = root.querySelector('#onboarding-file');

  controller = { root, status };

  dismissBtn.addEventListener('click', () => {
    markOnboarded(DISMISSED);
    root.hidden = true;
  });

  sampleBtn.addEventListener('click', () => {
    const file = sampleImage();
    if (!file) {
      status.textContent = 'The sample could not be drawn. Try adding an image instead.';
      return;
    }
    status.textContent = 'Converting your sample';
    handOff(file, openTool);
  });

  // The dropzone is a real button, so the keyboard reaches it; Enter and
  // Space arrive here as a click and forward to the hidden file input.
  dropzone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    readPickedFile(file)
      .then((read) => { if (read) handOff(read, openTool); })
      .catch((err) => { status.textContent = err.message; });
  });

  return controller;
}

// The "?" buttons reopen the guide. Kept as a session-only override so the
// stored flag (and therefore the dismissal) is untouched.
export function reopenGuide(showHome) {
  reopened = true;
  if (showHome) showHome();
}
