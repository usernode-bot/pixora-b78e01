# PIXORA

An AI creative toolkit for microstock contributors. Version 1 ships three
tools, each with its own page and workspace:

- **Creative** — describe an image with a text prompt and generate previews.
- **Upscale Image** — upload a photo and enlarge it 2x or 4x.
- **Remove Background** — upload a photo and strip the background.

Processing is mock/placeholder for now: results are simulated client-side
after a short delay, and no AI API is connected yet.

## Architecture

- `server.js` — Express server: platform auth (iframe JWT), static files,
  the HTML catch-all that makes every tool route directly reachable, and a
  graceful shutdown handler.
- `public/index.html` — the shell: dark sidebar, light main area, mobile
  header.
- `public/js/tools.js` — the tool registry. The sidebar, the router and the
  home page cards all read it.
- `public/js/tools/*.js` — one module per tool exporting
  `{ id, name, path, tagline, icon, render }`.

**Adding a tool:** create a module in `public/js/tools/` with that shape and
add one import plus one array entry in `public/js/tools.js`. Nothing else
changes — the sidebar, routing and home page pick it up automatically.

- `public/js/ui.js` — shared workspace helpers (drop zone, segmented
  control, icons, page layout).
- `styles/tailwind-input.css` + `tailwind.config.js` — the design tokens
  (colour tokens with light/dark values, plus the sidebar's fixed dark
  palette).

## Development

```sh
npm ci --include=dev
npm run build   # compiles public/tailwind.css
npm start
```
