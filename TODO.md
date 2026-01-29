# SyncVault TODO (Design Doc Alignment)

This list reflects gaps found by comparing the current implementation against
`docs/design/Sync Vault Tray App (electron + Git Hub + Aws Secrets Manager) - Design Doc.pdf`
and reviewing the current UI + tray behavior.

## MVP gaps
- Wire tray status to live sync state (Synced/Syncing/Error) instead of static “Status: Ready”.
- Implement **Pause syncing** toggle in tray (stop/start local watcher + remote poller).
- GitHub PAT should be stored in OS keychain (currently stored in SQLite settings).
- “Pull file” UI should show a **browseable tree** of template files (currently flat list of mappings).
- Missing secrets UX: when AWS secret lacks required keys, prompt the user or surface a clear UI flow.
- Per‑project settings UI (project details, repo, AWS secret/region) vs only global settings.

## UX polish (from doc and UI review)
- Home/status page as a real status dashboard (recent activity, last sync, errors).
- Project view: show last sync, repo head, and per‑project health indicators.
- Conflicts view: optional inline diff viewer (doc notes future enhancement).

## Tray icon + platform polish
- Provide platform‑specific tray icon sizes/variants (16/32/48) and macOS template icon.
- Confirm Windows/Linux tray icon assets are bundled and render correctly (after packaging).

## Platform features
- Auto‑start option:
  - Windows registry run key.
  - Linux desktop autostart.

## Open questions from design doc
- Support non‑git files (standalone projects) in MVP?
- `.env` parsing edge cases: multiline values, `export` syntax, and unusual quoting.
- Desired behavior when secrets are missing: block sync vs allow render with placeholders.

## Nice‑to‑have / post‑MVP
- GitHub OAuth device flow (if we move away from PAT).
- Conflict cleanup policy (auto‑clean old conflict copies).
