# Data Model

The SQLite schema mirrors the project concept in the design doc. Each local Git repo maps to one project, each template file maps to a file record, and each file can have multiple destinations (paths on different machines).

## Tables

### projects
Represents a SyncVault project (one local Git repo + one GitHub repo + one AWS secret).

Columns:
- `id`: UUID (primary key)
- `local_repo_root`: absolute local repo path
- `display_name`: user-facing name
- `github_owner`: owner/org for the template repo
- `github_repo`: repo name
- `github_clone_url`: clone URL
- `local_clone_path`: path to local clone in app data
- `aws_region`: AWS region for the secret
- `aws_secret_id`: secret name or ARN
- `poll_interval_seconds`: remote polling interval
- `last_remote_head`: last synced Git commit SHA
- `created_at`, `updated_at`: timestamps

### files
Represents a templated file tracked in a project.

Columns:
- `id`: UUID (primary key)
- `project_id`: FK to `projects.id`
- `source_relative_path`: path relative to local repo root
- `template_path`: path within the GitHub template repo
- `mapping_path`: path within the GitHub template repo
- `type`: file type (e.g. `dotenv`)
- `created_at`, `updated_at`: timestamps

### destinations
Represents a concrete render location for a template file.

Columns:
- `id`: UUID (primary key)
- `file_id`: FK to `files.id`
- `destination_path`: absolute path to the plaintext file
- `last_local_hash`: hash of last observed local content
- `last_render_hash`: hash of last rendered content
- `last_tool_write_at`: epoch millis for loop suppression
- `is_enabled`: bool flag (1/0)
- `created_at`, `updated_at`: timestamps

### secret_keys
Represents which keys are managed as secrets for a project.

Columns:
- `id`: UUID (primary key)
- `project_id`: FK to `projects.id`
- `key_name`: logical key name (e.g. `DB_PASSWORD`)
- `json_key`: JSON field in the AWS secret
- `created_at`: timestamp

### conflicts
Tracks active conflicts between local plaintext and remote template.

Columns:
- `id`: UUID (primary key)
- `destination_id`: FK to `destinations.id`
- `detected_at`: timestamp
- `local_copy_path`: path to the saved local version
- `remote_copy_path`: path to the saved remote version
- `status`: `open` or `resolved`

### settings
Simple key/value store for app settings.

Columns:
- `key`: string (primary key)
- `value`: string

## Indexes
- `files.project_id`
- `destinations.file_id`
- `destinations.destination_path`
- `conflicts.destination_id`
- `secret_keys.project_id`

## Constraints and behavior
- Deleting a project cascades to files, destinations, secret keys, and conflicts.
- Deleting a file cascades to its destinations and related conflicts.
- Secret values are never stored in the DB; only metadata and hashes are stored.
