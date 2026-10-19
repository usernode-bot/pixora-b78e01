// AI configuration panel for PIXORA.
//
// Opened from the sidebar's "AI configuration" button, or by loading any
// route with ?ai=1, which is a real deep link to this settings screen.
//
// The dialog holds three tabs. Configuration shows the signed-in person's
// platform AI permission (requested through the Homeroom bridge, never
// here), a daily limit saved for that person on the server, today's usage
// from the platform's own meter, and the Provider / Type / Model choices.
// Account shows who is signed in. Settings offers a way back to defaults.
//
// There is deliberately no API key field. AI access is granted and billed by
// Homeroom: this app never holds a provider key and never calls a
// third-party AI API directly. Image processing stays mock, as before.
import { el, icon } from './ui.js';

const TABS = [
  { id: 'configuration', label: 'Configuration' },
  { id: 'account', label: 'Account' },
  { id: 'settings', label: 'Settings' },
];

const PROVIDERS = [
  { value: 'homeroom', label: 'Homeroom AI (platform)' },
];

// What the configuration applies to. A tool name here is the PIXORA screen
// the choice is meant for.
const TYPES = [
  { value: 'all', label: 'All tools' },
  { value: 'creative', label: 'Creative (image generation)' },
  { value: 'upscale', label: 'Upscale Image' },
  { value: 'remove-background', label: 'Remove Background' },
];

const MODELS = [
  { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest)' },
  { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (balanced)' },
  { value: 'claude-opus-5-5', label: 'Claude Opus 5.5 (most capable)' },
];

const MIN_LIMIT_CENTS = 50;
const MAX_LIMIT_CENTS = 10000;

// The iframe adds `?token=` on load; forwards of API calls need it back as
// the platform's header. At the app's own address the edge adds the header
// itself, so there is no token to read and nothing extra to send.
function userToken() {
  try {
    return new URLSearchParams(window.location.search).get('token');
  } catch (err) {
    return null;
  }
}

async function api(path, options) {
  const opts = options || {};
  const headers = Object.assign({}, opts.headers);
  const token = userToken();
  if (token) headers['x-usernode-token'] = token;
  if (opts.body) headers['content-type'] = 'application/json';
  const resp = await fetch(path, Object.assign({}, opts, {
    headers,
    credentials: 'same-origin',
  }));
  let data = null;
  try {
    data = await resp.json();
  } catch (err) {
    // A non-JSON error body is still an error; the status says enough.
  }
  if (!resp.ok) {
    const error = new Error((data && data.error) || 'request_failed');
    error.status = resp.status;
    error.data = data;
    throw error;
  }
  return data;
}

function money(cents) {
  const value = Number(cents);
  if (!Number.isFinite(value)) return '$0.00';
  return '$' + (value / 100).toFixed(2);
}

// The bridge is how the app asks Homeroom about AI access. Homeroom always
// embeds the app in a frame; at the app's own address (or in standalone dev)
// there is no shell to answer, so the panel says permissions cannot be
// checked there instead of asking a bridge that would only fail.
function bridge() {
  return typeof window !== 'undefined' ? window.usernode : undefined;
}

function inPlatformFrame() {
  try {
    return window.parent !== window;
  } catch (err) {
    return false;
  }
}

function canUseBridge() {
  if (!inPlatformFrame()) return false;
  const u = bridge();
  return !!(u
    && typeof u.getLlmUsage === 'function'
    && typeof u.requestLlmAccess === 'function');
}

function field(id, labelText, options) {
  const label = el('label', 'section-label', labelText);
  label.htmlFor = id;
  const select = el('select', 'field');
  select.id = id;
  for (const option of options) {
    const node = el('option', null, option.label);
    node.value = option.value;
    select.append(node);
  }
  return { select, root: el('div', 'flex flex-col gap-1', [label, select]) };
}

function infoRow(labelText, valueNode) {
  return el('div', 'list-row', [
    el('span', 'text-body text-muted', labelText),
    el('span', 'ml-auto text-right text-body font-medium', [valueNode]),
  ]);
}

function createPanel() {
  const dialog = el('dialog', 'ai-dialog');
  dialog.id = 'ai-dialog';
  dialog.setAttribute('aria-labelledby', 'ai-dialog-title');

  const title = el('h2', 'text-heading', 'AI configuration');
  title.id = 'ai-dialog-title';

  const closeBtn = el('button', 'btn-secondary min-w-11 px-3');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close AI configuration');
  closeBtn.append(icon('close', 'h-5 w-5'));
  closeBtn.addEventListener('click', () => dialog.close());

  const header = el('div', 'flex items-center gap-3 border-b border-line px-5 py-4', [
    el('div', 'flex flex-col gap-1', [
      title,
      el('p', 'text-small text-muted', 'Access, models and limits for this app.'),
    ]),
    el('div', 'ml-auto', [closeBtn]),
  ]);

  const tablist = el('div', 'ai-tabs');
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'AI configuration sections');

  const tabButtons = new Map();
  const tabPanels = new Map();

  for (const tab of TABS) {
    const button = el('button', 'ai-tab', tab.label);
    button.type = 'button';
    button.id = 'ai-tab-' + tab.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'ai-panel-' + tab.id);
    button.setAttribute('aria-selected', 'false');
    button.tabIndex = -1;
    button.addEventListener('click', () => selectTab(tab.id));
    tablist.append(button);
    tabButtons.set(tab.id, button);

    const panel = el('div', 'flex flex-col gap-5 px-5 py-5');
    panel.id = 'ai-panel-' + tab.id;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    panel.hidden = true;
    tabPanels.set(tab.id, panel);
  }

  const scroll = el('div', 'ai-dialog-scroll');
  scroll.append(...TABS.map((tab) => tabPanels.get(tab.id)));
  dialog.append(header, tablist, scroll);

  let activeTab = 'configuration';
  function selectTab(id) {
    activeTab = id;
    for (const tab of TABS) {
      const selected = tab.id === id;
      const button = tabButtons.get(tab.id);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      tabPanels.get(tab.id).hidden = !selected;
    }
  }
  selectTab(activeTab);

  tablist.addEventListener('keydown', (event) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = TABS.findIndex((tab) => tab.id === activeTab);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else next = TABS.length - 1;
    selectTab(TABS[next].id);
    tabButtons.get(TABS[next].id).focus();
  });

  // Tapping the dimmed area around the sheet closes it. Clicks inside the
  // content target a child, never the dialog itself.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  // ── Configuration tab ───────────────────────────────────────────────────

  const configPanel = tabPanels.get('configuration');

  const envTitle = el('p', 'text-body font-medium', 'AI is not available in this environment');
  const envText = el('p', 'text-small text-muted',
    "This build has no connection to Homeroom's AI service, so permissions and usage can't be checked here. Your configuration is still saved to your account.");
  const envNotice = el('div', 'flex flex-col gap-1 rounded-lg border border-line bg-raised px-4 py-3', [
    envTitle,
    envText,
  ]);
  envNotice.hidden = true;

  const accessTitle = el('h3', 'text-heading', 'AI access');
  const accessText = el('p', 'text-body text-muted', 'Checking your AI permission…');
  const requestBtn = el('button', 'btn-secondary', 'Request AI access');
  requestBtn.type = 'button';
  requestBtn.id = 'ai-request-access';
  requestBtn.disabled = true;

  const usageAmount = el('span', 'text-small font-medium', '');
  const usageBar = el('div', 'meter-fill');
  usageBar.style.width = '0%';
  const usageTrack = el('div', 'meter', [usageBar]);
  const usageNote = el('p', 'text-small text-muted', '');
  const refreshBtn = el('button',
    'min-h-11 rounded-lg px-2 text-small font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus', 'Refresh');
  refreshBtn.type = 'button';
  refreshBtn.addEventListener('click', () => loadUsage());
  const usageMeter = el('div', 'flex flex-col gap-2', [
    el('div', 'flex flex-wrap items-baseline justify-between gap-2', [
      el('span', 'text-small font-medium', "Today's usage"),
      usageAmount,
    ]),
    usageTrack,
    usageNote,
    el('div', 'flex', [refreshBtn]),
  ]);
  const usageUnavailable = el('p', 'text-small text-muted', '');
  usageUnavailable.hidden = true;

  const accessSection = el('section', 'flex flex-col gap-3', [
    accessTitle,
    accessText,
    el('div', 'flex', [requestBtn]),
    usageMeter,
    usageUnavailable,
  ]);

  const divider = el('hr', 'border-line');

  const prefsTitle = el('h3', 'text-heading', 'Model preferences');
  const prefsText = el('p', 'text-small text-muted',
    'AI runs through Homeroom. No provider API key is needed, and PIXORA never asks for or stores one.');

  const providerField = field('ai-provider', 'Provider', PROVIDERS);
  const typeField = field('ai-type', 'Type', TYPES);
  const modelField = field('ai-model', 'Model', MODELS);

  const limitLabel = el('label', 'section-label', 'Daily limit (USD)');
  limitLabel.htmlFor = 'ai-limit';
  const limit = el('input', 'field');
  limit.id = 'ai-limit';
  limit.type = 'number';
  limit.inputMode = 'decimal';
  limit.min = '0.5';
  limit.max = '100';
  limit.step = '0.5';
  const limitHelp = el('p', 'text-small text-muted',
    'The most you want PIXORA to spend on AI in one day. Your Homeroom AI allowance also applies.');
  const limitField = el('div', 'flex flex-col gap-1', [limitLabel, limit, limitHelp]);

  const saveBtn = el('button', 'btn-primary', 'Save');
  saveBtn.type = 'submit';
  saveBtn.id = 'ai-save';
  const saveStatus = el('p', 'text-small text-muted', '');
  saveStatus.setAttribute('role', 'status');
  saveStatus.setAttribute('aria-live', 'polite');

  const form = el('form', 'flex flex-col gap-4', [
    providerField.root,
    typeField.root,
    modelField.root,
    limitField,
    el('div', 'flex flex-wrap items-center gap-3', [saveBtn, saveStatus]),
  ]);
  form.id = 'ai-form';
  form.noValidate = true;

  const formSkeleton = el('div', 'flex flex-col gap-3', [
    el('div', 'skeleton h-11 w-full'),
    el('div', 'skeleton h-11 w-full'),
    el('div', 'skeleton h-11 w-full'),
    el('div', 'skeleton h-11 w-full'),
  ]);

  const formErrorTitle = el('p', 'text-heading', 'Could not load your configuration');
  const formErrorText = el('p', 'text-body text-muted',
    'Your saved provider, model and daily limit could not be loaded.');
  const retryBtn = el('button', 'btn-secondary', 'Retry');
  retryBtn.type = 'button';
  retryBtn.addEventListener('click', () => load());
  const formError = el('div', 'state-error', [formErrorTitle, formErrorText, retryBtn]);

  const formSlot = el('div', 'flex flex-col gap-3');
  configPanel.append(
    envNotice,
    accessSection,
    divider,
    el('div', 'flex flex-col gap-2', [prefsTitle, prefsText]),
    formSlot,
  );

  function showFormState(stateName) {
    formSlot.replaceChildren();
    if (stateName === 'loading') formSlot.append(formSkeleton);
    else if (stateName === 'error') formSlot.append(formError);
    else formSlot.append(form);
  }

  // ── Account tab ─────────────────────────────────────────────────────────

  const accountPanel = tabPanels.get('account');
  const accountUsername = el('span', null, 'Not available');
  const accountPermission = el('span', null, 'Checking…');
  const accountCap = el('span', null, '—');
  const accountLimit = el('span', null, '—');

  accountPanel.append(
    el('div', 'flex flex-col gap-2', [
      el('h3', 'text-heading', 'Account'),
      el('p', 'text-body text-muted',
        'AI permissions and budgets belong to your Homeroom account. Manage them from Homeroom Settings.'),
    ]),
    el('div', 'list', [
      infoRow('Signed in as', accountUsername),
      infoRow('AI permission', accountPermission),
      infoRow('Homeroom daily allowance', accountCap),
      infoRow('Your daily limit', accountLimit),
    ]),
    el('p', 'text-small text-muted',
      'PIXORA never asks for or stores an AI provider API key. AI access goes through Homeroom.'),
  );

  // ── Settings tab ────────────────────────────────────────────────────────

  const settingsPanel = tabPanels.get('settings');
  const resetBtn = el('button', 'btn-secondary', 'Restore defaults');
  resetBtn.type = 'button';
  resetBtn.id = 'ai-reset';
  const resetStatus = el('p', 'text-small text-muted', '');
  resetStatus.setAttribute('role', 'status');
  resetStatus.setAttribute('aria-live', 'polite');

  resetBtn.addEventListener('click', async () => {
    resetBtn.disabled = true;
    resetStatus.textContent = 'Restoring…';
    try {
      const saved = await api('/api/ai/preferences', {
        method: 'PUT',
        body: JSON.stringify({}),
      });
      applyPrefs(saved);
      renderUsage();
      renderAccount();
      resetStatus.textContent = 'Defaults restored.';
    } catch (err) {
      resetStatus.textContent = err.status === 503
        ? 'Saving is unavailable in this build.'
        : 'Could not restore defaults. Try again.';
    } finally {
      resetBtn.disabled = false;
    }
  });

  settingsPanel.append(
    el('div', 'flex flex-col gap-2', [
      el('h3', 'text-heading', 'Settings'),
      el('p', 'text-body text-muted',
        'Your configuration is saved to your Homeroom account, so it follows you to any device.'),
    ]),
    el('div', 'flex flex-col gap-2', [
      el('p', 'text-body', 'Restore the provider, model and daily limit to their defaults.'),
      el('div', 'flex flex-wrap items-center gap-3', [resetBtn, resetStatus]),
    ]),
    el('p', 'text-small text-muted',
      'Image processing stays mock until AI is connected to PIXORA. Turning AI access on prepares your account for that.'),
  );

  // ── State and loading ───────────────────────────────────────────────────

  const state = {
    envKnown: false,
    envEnabled: false,
    me: null,
    prefs: null,
    use: { granted: null, spentCents: 0, capCents: null, state: 'idle' },
  };
  let loadToken = 0;

  function applyPrefs(prefs) {
    state.prefs = prefs;
    providerField.select.value = prefs.provider;
    typeField.select.value = prefs.type;
    modelField.select.value = prefs.model;
    limit.value = (prefs.dailyLimitCents / 100).toFixed(2);
  }

  function renderEnv() {
    envNotice.hidden = state.envEnabled;
    if (state.envEnabled) return;
    if (!state.envKnown) {
      envTitle.textContent = 'AI availability could not be checked';
      envText.textContent = 'PIXORA could not reach the platform just now. Reload to try again. Your configuration is still saved to your account.';
    } else {
      envTitle.textContent = 'AI is not available in this environment';
      envText.textContent = "This build has no connection to Homeroom's AI service, so permissions and usage can't be checked here. Your configuration is still saved to your account.";
    }
  }

  function renderAccess() {
    const use = state.use;
    if (!state.envEnabled) {
      accessText.textContent = "AI access can't be checked in this environment.";
      requestBtn.textContent = 'AI unavailable';
      requestBtn.disabled = true;
      return;
    }
    if (!canUseBridge()) {
      accessText.textContent = 'AI permissions can only be checked inside Homeroom.';
      requestBtn.textContent = 'Open in Homeroom';
      requestBtn.disabled = true;
      return;
    }
    requestBtn.disabled = false;
    if (use.state === 'loading') {
      accessText.textContent = 'Checking your AI permission…';
      requestBtn.textContent = 'Checking…';
      return;
    }
    if (use.state === 'error') {
      accessText.textContent = 'Your AI permission could not be checked.';
      requestBtn.textContent = 'Try again';
      return;
    }
    if (use.granted) {
      accessText.textContent = use.capCents != null
        ? 'AI access is on. Homeroom allows up to ' + money(use.capCents) + ' a day for this app.'
        : 'AI access is on for this app.';
      requestBtn.textContent = 'Review AI access';
    } else {
      accessText.textContent = "No AI access yet. Request it to let PIXORA use Homeroom's AI.";
      requestBtn.textContent = 'Request AI access';
    }
  }

  function renderUsage() {
    const use = state.use;
    if (!state.envEnabled) {
      usageMeter.hidden = true;
      usageUnavailable.hidden = false;
      usageUnavailable.textContent = 'AI usage is not available in this environment.';
      return;
    }
    if (!canUseBridge()) {
      usageMeter.hidden = true;
      usageUnavailable.hidden = false;
      usageUnavailable.textContent = 'AI usage can only be read inside Homeroom.';
      return;
    }
    usageUnavailable.hidden = true;
    usageMeter.hidden = false;

    if (use.state === 'loading' || use.state === 'idle') {
      usageAmount.textContent = 'Checking…';
      usageNote.textContent = '';
      usageBar.style.width = '0%';
      return;
    }
    if (use.state === 'error') {
      usageAmount.textContent = 'Unavailable';
      usageNote.textContent = "Today's usage could not be read. Press Refresh to try again.";
      usageBar.style.width = '0%';
      return;
    }
    if (!use.granted) {
      usageAmount.textContent = money(0) + ' used today';
      usageNote.textContent = 'Request AI access to see your allowance here.';
      usageBar.style.width = '0%';
      return;
    }

    const limitCents = state.prefs ? state.prefs.dailyLimitCents : null;
    if (limitCents == null) {
      usageAmount.textContent = money(use.spentCents) + ' used today';
      usageNote.textContent = 'Your saved daily limit could not be loaded, so the meter has no scale.';
      usageBar.style.width = '0%';
      return;
    }

    const percent = limitCents > 0
      ? Math.min(100, (use.spentCents / limitCents) * 100)
      : 0;
    usageBar.style.width = percent + '%';
    usageAmount.textContent = money(use.spentCents) + ' of ' + money(limitCents) + ' used today';

    let note = 'Resets at midnight UTC.';
    if (use.capCents != null && use.capCents !== limitCents) {
      note = 'Your Homeroom allowance for this app is ' + money(use.capCents) + ' a day. ' + note;
    }
    usageNote.textContent = note;
  }

  function renderAccount() {
    accountUsername.textContent = state.me && state.me.username
      ? state.me.username
      : 'Not available';

    if (!state.envEnabled) accountPermission.textContent = 'Not available in this environment';
    else if (!canUseBridge()) accountPermission.textContent = 'Not available outside Homeroom';
    else if (state.use.state === 'loading' || state.use.state === 'idle') accountPermission.textContent = 'Checking…';
    else if (state.use.state === 'error') accountPermission.textContent = 'Could not be checked';
    else accountPermission.textContent = state.use.granted ? 'Granted' : 'Not granted';

    accountCap.textContent = state.use.granted && state.use.capCents != null
      ? money(state.use.capCents) + ' a day'
      : '—';
    accountLimit.textContent = state.prefs
      ? money(state.prefs.dailyLimitCents) + ' a day'
      : '—';
  }

  async function loadUsage() {
    if (!state.envEnabled || !canUseBridge()) return;
    state.use = Object.assign({}, state.use, { state: 'loading' });
    renderUsage();
    renderAccess();
    renderAccount();
    try {
      const usage = await bridge().getLlmUsage();
      if (usage && usage.granted) {
        state.use = {
          granted: true,
          spentCents: Number(usage.spentCentsToday) || 0,
          capCents: typeof usage.dailyCapCents === 'number' ? usage.dailyCapCents : null,
          state: 'ready',
        };
      } else {
        state.use = { granted: false, spentCents: 0, capCents: null, state: 'ready' };
      }
    } catch (err) {
      state.use = Object.assign({}, state.use, { state: 'error' });
    }
    renderUsage();
    renderAccess();
    renderAccount();
  }

  async function load() {
    const token = ++loadToken;
    showFormState('loading');
    renderAccess();

    const results = await Promise.allSettled([
      api('/api/ai/status'),
      api('/api/ai/preferences'),
      api('/api/me'),
    ]);
    if (token !== loadToken) return;

    const statusResult = results[0];
    const prefsResult = results[1];
    const meResult = results[2];

    state.envKnown = statusResult.status === 'fulfilled';
    state.envEnabled = state.envKnown && !!(statusResult.value && statusResult.value.enabled);
    state.me = meResult.status === 'fulfilled' ? meResult.value : null;

    if (prefsResult.status === 'fulfilled') {
      applyPrefs(prefsResult.value);
      showFormState('ready');
    } else {
      showFormState('error');
      formErrorText.textContent = prefsResult.reason && prefsResult.reason.status === 503
        ? "Saving is unavailable in this build. Your configuration can't be loaded or saved here."
        : 'Your saved provider, model and daily limit could not be loaded.';
    }

    renderEnv();
    renderAccount();

    if (state.envEnabled) {
      await loadUsage();
    } else {
      state.use = { granted: false, spentCents: 0, capCents: null, state: 'ready' };
      renderUsage();
      renderAccess();
      renderAccount();
    }
  }

  requestBtn.addEventListener('click', async () => {
    if (!state.envEnabled || !canUseBridge()) return;
    requestBtn.disabled = true;
    requestBtn.textContent = 'Opening…';
    try {
      const result = await bridge().requestLlmAccess();
      if (result && result.granted) {
        if (typeof result.dailyCapCents === 'number') {
          state.use = Object.assign({}, state.use, {
            granted: true,
            capCents: result.dailyCapCents,
          });
        }
        await loadUsage();
      } else {
        accessText.textContent = 'AI access was not granted. You can ask again any time.';
      }
    } catch (err) {
      accessText.textContent = 'AI permissions could not be opened. Try again from inside Homeroom.';
    } finally {
      requestBtn.disabled = false;
      renderAccess();
      renderAccount();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const dollars = Number(limit.value);
    const cents = Math.round(dollars * 100);
    if (!Number.isFinite(dollars) || cents < MIN_LIMIT_CENTS || cents > MAX_LIMIT_CENTS) {
      saveStatus.textContent = 'Enter a daily limit between $0.50 and $100.00.';
      limit.focus();
      return;
    }

    saveBtn.disabled = true;
    saveStatus.textContent = 'Saving…';
    try {
      const saved = await api('/api/ai/preferences', {
        method: 'PUT',
        body: JSON.stringify({
          provider: providerField.select.value,
          type: typeField.select.value,
          model: modelField.select.value,
          dailyLimitCents: cents,
        }),
      });
      applyPrefs(saved);
      renderUsage();
      renderAccount();
      saveStatus.textContent = 'Saved';
    } catch (err) {
      saveStatus.textContent = err.status === 503
        ? 'Saving is unavailable in this build.'
        : 'Could not save. Try again.';
    } finally {
      saveBtn.disabled = false;
    }
  });

  dialog.addEventListener('close', () => {
    saveStatus.textContent = '';
    resetStatus.textContent = '';
  });

  function open() {
    selectTab('configuration');
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    load();
  }

  renderEnv();
  renderAccess();
  renderUsage();
  renderAccount();

  return { dialog, open };
}

// Wire the sidebar entry (and the ?ai=1 deep link) to the dialog. `onOpen`
// lets the shell close its mobile menu before the sheet appears.
export function initAiConfig(options) {
  const opts = options || {};
  const panel = createPanel();
  document.body.append(panel.dialog);

  if (opts.openButton) {
    opts.openButton.addEventListener('click', () => {
      if (typeof opts.onOpen === 'function') opts.onOpen();
      panel.open();
    });
  }

  let deepLinked = false;
  try {
    deepLinked = new URLSearchParams(window.location.search).get('ai') === '1';
  } catch (err) {
    deepLinked = false;
  }
  if (deepLinked) panel.open();

  return panel;
}
