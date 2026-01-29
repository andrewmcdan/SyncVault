# SyncVault

SyncVault is a cross-platform tray app that keeps local config files in sync across machines while keeping secrets out of Git. Templates live in a private GitHub repo; secret values live in AWS Secrets Manager. The app renders plaintext locally, monitors changes, and keeps both sides synchronized.

## Status
MVP flows are implemented and usable. Core screens and background sync are in place.

Current release label: `beta.1.0.0` (see `VERSION`).

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
- AWS credentials (for Secrets Manager). Profiles are read from `~/.aws/config` and `~/.aws/credentials`.
- GitHub fine-grained PAT (for repo creation and access)

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

```bash
sudo chown root:root /home/andrew/Documents/projects/SyncVault/node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 /home/andrew/Documents/projects/SyncVault/node_modules/electron/dist/chrome-sandbox
```

## IPC
Renderer access is via a preload bridge (contextIsolation on).
- All UI actions (add/pull files, settings, conflicts, logs) are exposed through `window.syncvault`.

## Data storage
- SQLite (sql.js) DB stored in the app data directory (`app.getPath("userData")/data/syncvault.sqlite`).
- Clones of template repos stored under the same data root (`app.getPath("userData")/data/repos`).
- No secret values stored in the DB.

## Security notes
- Secrets are never written to Git.
- Secrets are never logged.
- GitHub PAT and AWS profile selection are stored in SQLite settings (no keychain yet).

## Features implemented
- Add file wizard with line-based secret selection and template preview.
- Pull file browser that renders templates with AWS secrets.
- Background sync (local watcher + remote poller) with conflict detection.
- Conflicts UI with keep-local/keep-remote resolution and open diff.
- Settings for GitHub PAT, AWS profile/region, and sync timing.
- Projects and logs views.

## Marking secrets inline
You can explicitly mark a value as a secret by appending `!SYNCVAULT`:

```
SECRET_ENV_VAR=my_secret_value !SYNCVAULT
```

SyncVault strips the marker, treats the key as secret, and updates the mapping.

## Roadmap (high level)
1. Tray MVP polish (pause syncing, richer project details)
2. Keychain storage for PAT
3. Auth improvements (GitHub OAuth device flow)
