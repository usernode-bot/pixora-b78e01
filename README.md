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

## Run it locally

```sh
npm ci --include=dev   # devDependencies, so the Tailwind CLI is installed
npm run build:css      # writes public/tailwind.css
npm start              # serves on http://localhost:3000
npm test               # node --test over test/
```

For development there is one command:

```sh
npm run dev   # rebuilds the stylesheet on change AND runs the server
```

It starts the Tailwind CLI in watch mode over `styles/tailwind-input.css`
and `node --watch server.js` in parallel, so an edit to the markup or a
class is compiled as you work. A class name that appears in
`public/**/*.html` or `public/**/*.js` is compiled; one assembled at runtime
("bg-" + tone) is not, which is why every class in this app is a whole
literal.

**`public/tailwind.css` is generated, never committed.** It is in
`.gitignore`, and the two-stage `Dockerfile` compiles it in its `css` stage
on every image build, from the markup in that exact commit. Run
`npm run build:css` locally, or `npm run dev`, and the file exists in your
checkout; without one the page loads unstyled, which is a missing build, not
a missing route.

### Environment variables

The server reads these, and every one has a safe default so a plain
`npm start` works:

| Variable | What it is |
| --- | --- |
| `PORT` | The port to listen on. Defaults to `3000`. |
| `USERNODE_JWT_PUBLIC_KEY` | The platform's RSA public key (PEM). Unset locally, so the app simply treats every request as unauthenticated. |
| `USERNODE_APP_ID` | This app's numeric id, which forms the expected token audience. Unset locally. |
| `USERNODE_PLATFORM_ORIGIN` | The platform's origin, used only to proxy `/usernode-bridge/`, `/usernode-native/` and `/usernode-tailwind/` when nothing else serves them. Unset locally, so those three paths answer `503`. The theme script then falls back to the operating system's dark mode. |

`DATABASE_URL` and `USERNODE_ENV` are injected by the platform and are not
read by this app: it has no database and no environment-specific behaviour.

### Local deep links

`http://localhost:3000/` renders the shell, and the sidebar navigates the
tool pages client-side. A direct hit on `/creative`, `/upscale` or
`/remove-background` (typing the URL, or a reload while you are on one) goes
through the server's HTML catch-all, which is auth-gated: outside the
platform there is no token, so instead of the page you get the "Open in
Homeroom" notice, or a redirect to the platform when
`USERNODE_PLATFORM_ORIGIN` is set. Navigate with the sidebar while you work,
or set `USERNODE_PLATFORM_ORIGIN`.
