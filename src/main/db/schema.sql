PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  local_repo_root TEXT NOT NULL,
  display_name TEXT,
  github_owner TEXT,
  github_repo TEXT,
  github_clone_url TEXT,
  local_clone_path TEXT,
  aws_region TEXT,
  aws_secret_id TEXT,
  poll_interval_seconds INTEGER DEFAULT 20,
  last_remote_head TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_relative_path TEXT NOT NULL,
  template_path TEXT NOT NULL,
  mapping_path TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS destinations (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  destination_path TEXT NOT NULL,
  last_local_hash TEXT,
  last_render_hash TEXT,
  last_tool_write_at INTEGER,
  is_enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS secret_keys (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  key_name TEXT NOT NULL,
  json_key TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conflicts (
  id TEXT PRIMARY KEY,
  destination_id TEXT NOT NULL,
  detected_at TEXT DEFAULT CURRENT_TIMESTAMP,
  local_copy_path TEXT,
  remote_copy_path TEXT,
  status TEXT NOT NULL,
  FOREIGN KEY (destination_id) REFERENCES destinations (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_files_project_id ON files (project_id);
CREATE INDEX IF NOT EXISTS idx_destinations_file_id ON destinations (file_id);
CREATE INDEX IF NOT EXISTS idx_destinations_path ON destinations (destination_path);
CREATE INDEX IF NOT EXISTS idx_conflicts_destination_id ON conflicts (destination_id);
CREATE INDEX IF NOT EXISTS idx_secret_keys_project_id ON secret_keys (project_id);
