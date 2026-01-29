# SyncVault Completion Plan

This plan translates the design doc + TODO gaps into an ordered, concrete task list with file entry points.

## Decision Gate (confirm before coding)
1) Non-git projects in MVP? If yes, define how to create and identify a "standalone project" (no git root).
2) `.env` edge cases to support in MVP: multiline values, `export KEY=...`, and quoting rules.
3) Missing secrets behavior: block sync, allow placeholders, or prompt-and-save in AWS.
4) Stable project identity across machines: confirm `syncvault/project.json` UUID strategy is the source of truth.

Capture decisions in `docs/architecture.md` or a new `docs/decisions.md`.

## Implementation Plan (ordered)
1) Live sync status + tray wiring
   - Emit sync status transitions from the engine (start/finish/error) instead of only add/pull flows.
   - Files: `src/main/services/sync/engine.ts`, `src/main/services/sync/local-watcher.ts`,
     `src/main/services/sync/remote-poller.ts`, `src/main/ipc/handlers/index.ts`.
   - Update tray menu status label dynamically (rebuild menu when status changes).
   - File: `src/main/app/main.ts` (subscribe to status changes, update label + maybe icon).
   - Update home dashboard to show status and recent activity.
   - File: `src/renderer/pages/home/index.tsx`.

2) Pause syncing toggle (tray + persistence)
   - Add a persisted "paused" flag (in settings) and honor it in the sync engine.
   - Files: `src/main/services/sync/settings.ts`, `src/shared/types/ipc.ts`.
   - Wire tray checkbox to toggle pause and start/stop engine.
   - File: `src/main/app/main.ts`.
   - Optional UI: surface pause state in Settings.
   - File: `src/renderer/pages/settings/index.tsx`.

3) GitHub PAT in OS keychain (remove from SQLite)
   - Add keychain storage (likely `keytar`) and migrate existing token from settings on first run.
   - Files: `package.json`, `src/main/services/auth/github-auth.ts`, `src/main/app/main.ts`.
   - Keep renderer blind to stored token; only set/clear via IPC.
   - Files: `src/main/ipc/handlers/index.ts`, `src/renderer/pages/settings/index.tsx`.
   - Update docs to note keychain storage.
   - File: `README.md`.

4) Pull-file UI: browseable tree of templates
   - Build a tree model from template paths and render expandable folders.
   - File: `src/renderer/pages/pull-file/index.tsx`.
   - Keep API as-is (list returns `templatePath`); only UI needs rework unless you want server-side tree.
   - File (optional): `src/main/services/pull-file.ts`.

5) Missing secrets UX + flow
   - Detect missing keys during pull and present a UI prompt to supply values.
   - Files: `src/main/services/pull-file.ts`, `src/shared/types/ipc.ts`,
     `src/main/ipc/handlers/index.ts`, `src/renderer/pages/pull-file/index.tsx`.
   - Add an IPC action to upsert missing keys into AWS Secrets Manager.
   - File: `src/main/services/aws/secrets-manager.ts` (or new helper).
   - For background sync, decide behavior (block + warn vs placeholder) and surface status errors.
   - Files: `src/main/services/sync/remote-poller.ts`, `src/main/services/sync/local-watcher.ts`.

6) Per-project settings UI (repo + AWS fields)
   - Add IPC to fetch and update individual project fields.
   - Files: `src/main/ipc/handlers/index.ts`, `src/main/db/repositories/projects.ts`,
     `src/main/models/project.ts`, `src/shared/types/ipc.ts`.
   - Add UI for editing project details (AWS region/secret, repo info).
   - File: `src/renderer/pages/projects/index.tsx` (or new route/page).
   - Validate changes and persist; restart poller if interval changes.
   - File: `src/main/services/sync/engine.ts`.

7) Tray icon assets + platform polish
   - Add size variants (16/32/48) and macOS template icon.
   - Files: `assets/icons/tray/*`, `assets/icons` (if mac template).
   - Update tray icon selection per platform.
   - File: `src/main/app/main.ts`.
   - Verify assets included in packaging.
   - File: `electron-builder.yml`.

8) Auto-start option (Windows + Linux)
   - Add settings toggle + IPC surface.
   - Files: `src/shared/types/ipc.ts`, `src/main/ipc/handlers/index.ts`,
     `src/renderer/pages/settings/index.tsx`.
   - Implement OS-specific startup enable/disable (Windows run key or `app.setLoginItemSettings`,
     Linux autostart `.desktop` file).
   - File: `src/main/services/autostart.ts` (new).

9) UX polish: status dashboard + project health
   - Add "last sync", "last error", and recent activity summaries.
   - Files: `src/renderer/pages/home/index.tsx`, `src/main/ipc/handlers/index.ts`.
   - Add per-project health info (last sync/error timestamps).
   - Files: `src/main/db/schema.sql`, `src/main/db/repositories/projects.ts`,
     `src/main/services/sync/local-watcher.ts`, `src/main/services/sync/remote-poller.ts`.
   - Update projects UI to show health indicators and repo head.
   - File: `src/renderer/pages/projects/index.tsx`.

10) Optional: inline conflict diff viewer
   - If desired, add a diff view instead of only `openDiff` external.
   - Files: `src/renderer/pages/conflicts/index.tsx`, `src/renderer/components/*` (new).

## Validation + Release Checklist
- Manual flows: add from clipboard, add from browse, pull from remote, local edit sync, remote edit sync,
  conflict creation + resolution, missing secrets prompt, pause/resume.
- Security: confirm no secrets in DB/logs; PAT only in keychain.
- Packaging: `npm run build`, `npm run dist`, verify tray icons and auto-start behavior.
- Update `README.md` + `VERSION`.
