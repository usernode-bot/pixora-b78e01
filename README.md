# pixora

An AI creative toolkit for microstock contributors. pixora helps stock
creators create and prepare commercial visual assets for stock libraries
through five tools:

- **Creative** — create AI-generated visual assets and stock content.
- **Upscale Image** — increase image resolution and improve quality for
  stock submission.
- **Remove Background** — create clean isolated assets with transparent
  backgrounds.
- **Metadata AI** — generate stock-friendly titles, descriptions,
  keywords, and categories.
- **Prompt Generator** — create optimized prompts for generating original
  commercial stock content.

The app shell is live: a sidebar (a top tab bar on phones) lists the five
tools and each tool opens its own page. The tools ship progressively —
every tool page currently shows an honest "This tool is coming next"
state until its functionality is built.

## How it's built

- **Sign-in** — the server verifies the platform-issued user token
  (an RS256 JWT) on every request, so users sign in through Homeroom
  automatically. No accounts to build.
- **Database** — the app has its own private Postgres database, kept
  ready for the tools. Nothing is stored yet.
- **Styling** — Tailwind CSS, precompiled by `npm run build` during image
  creation, in a light and a dark look that follow the viewer's Homeroom
  theme.
- **Server** — Express serving the app shell and the platform-hosted
  assets. There are no API routes yet; the tools will add theirs.

## Changing this app

To change this app, ask Homeroom bot: open the app on Homeroom, tap the
Homeroom icon in the header, then **Ask for a change**, and describe what
you'd like in plain English. You can also run Claude Code against this
repo directly; start with `CLAUDE.md`, which carries the app-specific
notes and points at the platform rules.