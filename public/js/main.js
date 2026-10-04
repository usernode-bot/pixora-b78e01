// PIXORA shell: builds the sidebar navigation from the tool registry and
// routes /, /creative, /upscale and /remove-background to their tools.
// Path-based routing works with the server's HTML catch-all, so every tool
// page is directly reachable by URL.
import { el, icon } from './ui.js';
import { tools } from './tools.js';

const view = document.getElementById('view');
const nav = document.getElementById('nav');
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('backdrop');
const menuBtn = document.getElementById('menu-btn');

const routes = new Map(tools.map((tool) => [tool.path, tool]));

// The sidebar is generated from the registry: a new tool in tools.js shows
// up here automatically.
for (const tool of tools) {
  const link = el('a',
    'flex min-h-11 items-center gap-3 rounded-lg px-3 text-body font-medium text-sb-muted hover:bg-sb-raised hover:text-sb-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus', [
    icon(tool.icon, 'h-5 w-5 shrink-0 text-sb-muted'),
    el('span', null, tool.name),
  ]);
  link.href = tool.path;
  link.dataset.nav = '';
  nav.append(link);
}

function setActive(path) {
  for (const link of nav.querySelectorAll('a')) {
    const active = link.getAttribute('href') === path;
    link.classList.toggle('bg-sb-active', active);
    link.classList.toggle('text-sb-fg', active);
    link.classList.toggle('text-sb-muted', !active);
    const svg = link.querySelector('svg');
    svg.classList.toggle('text-sb-accent', active);
    svg.classList.toggle('text-sb-muted', !active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function renderHome() {
  view.append(
    el('section', 'flex flex-col gap-2', [
      el('h1', 'text-title', 'Welcome to PIXORA'),
      el('p', 'text-body text-muted', 'An AI toolkit for microstock creators. Pick a tool to get started.'),
    ]),
    el('section', 'mt-8 flex flex-col gap-3', [
      el('h2', 'section-label', 'Tools'),
      el('div', 'grid gap-4 sm:grid-cols-3', tools.map((tool) =>
        el('a',
          'card flex flex-col gap-3 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus', [
          icon(tool.icon, 'h-6 w-6 text-accent'),
          el('span', 'text-body font-medium', tool.name),
          el('span', 'text-small text-muted', tool.tagline),
        ]))),
    ]),
  );
}

function render() {
  const tool = routes.get(location.pathname);
  setActive(tool ? tool.path : '/');
  view.replaceChildren();
  if (tool) {
    document.title = tool.name + ' · PIXORA';
    tool.render(view);
  } else {
    document.title = 'PIXORA';
    renderHome();
  }
}

// Mobile sidebar: the menu button toggles it over a backdrop; any
// navigation closes it.
function openMenu() {
  sidebar.classList.remove('-translate-x-full');
  backdrop.hidden = false;
  menuBtn.setAttribute('aria-expanded', 'true');
}
function closeMenu() {
  sidebar.classList.add('-translate-x-full');
  backdrop.hidden = true;
  menuBtn.setAttribute('aria-expanded', 'false');
}
menuBtn.addEventListener('click', () => {
  if (menuBtn.getAttribute('aria-expanded') === 'true') closeMenu();
  else openMenu();
});
backdrop.addEventListener('click', closeMenu);

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-nav]');
  if (!link) return;
  event.preventDefault();
  history.pushState({}, '', link.getAttribute('href'));
  closeMenu();
  render();
});
window.addEventListener('popstate', render);
render();
