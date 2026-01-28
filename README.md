# SyncVault

SyncVault is a cross-platform tray app that keeps local config files in sync across machines while keeping secrets out of Git. Templates live in a private GitHub repo; secret values live in AWS Secrets Manager. The app renders plaintext locally, monitors changes, and keeps both sides synchronized.

## Status
Early scaffolding. Core flows and UI are not yet implemented.

## Core ideas
- Template files in GitHub with placeholders instead of secrets.
- One AWS Secrets Manager secret per project (JSON object).
- Bidirectional sync: local edits update templates and secrets; remote template updates re-render plaintext.
- Conflict-safe behavior with explicit resolution.

## Project layout
- `src/main`: Electron main process, background services, DB
- `src/renderer`: UI windows (add file, pull file, projects, logs, conflicts)
- `src/shared`: shared types/constants/validators
- `docs`: architecture and data model notes


## Docs
- `docs/architecture.md`
- `docs/data-model.md`

## Development
Requirements:
- Node.js (LTS recommended)
- Git
- AWS credentials (for Secrets Manager)
- GitHub token (for repo creation and access)

Scripts:
- `npm run dev`: run main watcher, renderer dev server, and Electron
- `npm run dev:main`: watch-compile main process
- `npm run dev:renderer`: run Vite dev server for renderer
- `npm run dev:electron`: run Electron against the Vite dev server
- `npm run build`: build main and renderer
- `npm run start`: run Electron (after build)
- `npm run pack`: package without installer
- `npm run dist`: build installer



## Sandbox notes (Linux dev)
If you see the SUID sandbox error, you can either:
- Use the dev script (we pass `--no-sandbox` for local dev only), or
- Fix permissions on Electron's `chrome-sandbox` (requires sudo).

## IPC
Renderer access is via a preload bridge (contextIsolation on).
- Status + logs are exposed through `window.syncvault`.

## Data storage
- SQLite DB stored in the app data directory (`app.getPath("userData")/data`).
- Clones of template repos stored under the same data root (planned).
- No secret values stored in the DB.

## Security notes
- Secrets are never written to Git.
- Secrets are never logged.
- AWS and GitHub credentials are stored via OS keychain (planned).

## Roadmap (high level)
1. CLI prototype for templating + sync engine
2. Electron tray MVP with SQLite persistence
3. Conflict UI + logs
4. Auth improvements (GitHub OAuth, AWS profile UI)
