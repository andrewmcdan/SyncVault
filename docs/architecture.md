# Architecture

SyncVault is an Electron tray app with a long-running main process that performs file sync, Git and AWS operations, and persistence. Renderer windows are opened for focused workflows (add file, pull file, conflicts, logs, settings).

## Components

### Electron main process
- Owns the tray menu and global app lifecycle.
- Orchestrates sync, polling, and background tasks.
- Hosts the SQL.js (SQLite) database and services for GitHub, Git, and AWS.

### Tray and windows
- Tray menu is always available and triggers core actions.
- Windows are lightweight and task-specific:
  - Add file wizard
  - Pull file from remote
  - Projects list
  - Conflicts list
  - Logs
  - Settings

### Services
- `sync`: state machine, local watcher, remote poller, conflict handling
- `git`: clone/fetch/pull/commit/push wrappers
- `github`: repo creation and listing via Octokit
- `aws`: Secrets Manager read/write
- `auth`: GitHub PAT storage and AWS profile selection
- `parser`: dotenv parsing and templating
- `scheduler`: debounce and scheduling utilities

### Storage
- SQL.js DB stored under `app.getPath("userData")/data/syncvault.sqlite`.
- Local clones of template repos stored under `app.getPath("userData")/data/repos`.
- Templates and mapping files live in the remote GitHub repo under `templates/` and `syncvault/`.
- Each repo includes `syncvault/project.json` and `syncvault/files/<fileId>.json` mappings.

## Data flow

### Add file
1. Detect project root by running `git rev-parse --show-toplevel`.
2. Create project record if missing.
3. Create or connect to remote GitHub repo and clone locally.
4. Parse file, select secret keys, and generate template + mapping.
5. Write template, mapping, and `syncvault/project.json` into the local clone.
6. Update AWS secret JSON.
7. Commit and push the template repo.
8. Register destination path for ongoing watch + sync.

### Local change
1. Watcher detects file change and debounces.
2. Parse plaintext and compare with last render.
3. Update AWS secret values for managed keys.
4. Update template for non-secret changes.
5. Commit and push the template repo.

### Remote change
1. Poller fetches remote updates.
2. Pulls and identifies changed templates.
3. Renders plaintext using AWS secret values.
4. Writes files atomically to destinations.
5. Suppresses watcher loop for tool-originated writes.

## Conflict handling
- If local and remote changed since the last sync, write `.local` and `.remote` copies.
- Mark conflict records for UI resolution.
- UI actions allow “keep local” (updates template + AWS) or “keep remote” (overwrites plaintext).
- “Open diff” generates a git diff between copies.

## Security posture
- No secret values in Git or in the local DB.
- Secrets read/write via AWS Secrets Manager only.
- GitHub PAT and AWS profile selection are stored in SQLite settings (keychain planned).
