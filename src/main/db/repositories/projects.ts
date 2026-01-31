import type { Database, SqlValue } from "sql.js";
import { getDatabase } from "../sqlite";
import type { ProjectInput, ProjectRecord } from "../../models/project";

function mapProject(row: Record<string, unknown>): ProjectRecord {
  return {
    id: row.id as string,
    local_repo_root: row.local_repo_root as string,
    display_name: (row.display_name as string) ?? null,
    github_owner: (row.github_owner as string) ?? null,
    github_repo: (row.github_repo as string) ?? null,
    github_clone_url: (row.github_clone_url as string) ?? null,
    local_clone_path: (row.local_clone_path as string) ?? null,
    aws_region: (row.aws_region as string) ?? null,
    aws_secret_id: (row.aws_secret_id as string) ?? null,
    poll_interval_seconds: row.poll_interval_seconds as number,
    last_remote_head: (row.last_remote_head as string) ?? null,
    created_at: (row.created_at as string) ?? null,
    updated_at: (row.updated_at as string) ?? null
  };
}

export function findProjectByLocalRoot(localRepoRoot: string): ProjectRecord | null {
  const db = getDatabase() as Database;
  const stmt = db.prepare(
    "SELECT * FROM projects WHERE local_repo_root = ? LIMIT 1"
  );
  stmt.bind([localRepoRoot]);

  let result: ProjectRecord | null = null;
  if (stmt.step()) {
    result = mapProject(stmt.getAsObject());
  }
  stmt.free();
  return result;
}

export function findProjectById(projectId: string): ProjectRecord | null {
  const db = getDatabase() as Database;
  const stmt = db.prepare("SELECT * FROM projects WHERE id = ? LIMIT 1");
  stmt.bind([projectId]);

  let result: ProjectRecord | null = null;
  if (stmt.step()) {
    result = mapProject(stmt.getAsObject());
  }
  stmt.free();
  return result;
}

export function listProjects(): ProjectRecord[] {
  const db = getDatabase() as Database;
  const stmt = db.prepare("SELECT * FROM projects");
  const results: ProjectRecord[] = [];
  while (stmt.step()) {
    results.push(mapProject(stmt.getAsObject()));
  }
  stmt.free();
  return results;
}

export interface ProjectSummary {
  id: string;
  local_repo_root: string;
  display_name: string | null;
  github_owner: string | null;
  github_repo: string | null;
  github_clone_url: string | null;
  local_clone_path: string | null;
  aws_region: string | null;
  aws_secret_id: string | null;
  poll_interval_seconds: number;
  last_remote_head: string | null;
  created_at: string | null;
  updated_at: string | null;
  file_count: number;
  destination_count: number;
  open_conflicts: number;
}

export function listProjectSummaries(): ProjectSummary[] {
  const db = getDatabase() as Database;
  const stmt = db.prepare(
    "SELECT p.*, " +
      "(SELECT COUNT(*) FROM files f WHERE f.project_id = p.id) AS file_count, " +
      "(SELECT COUNT(*) FROM destinations d JOIN files f ON f.id = d.file_id " +
      "WHERE f.project_id = p.id AND d.is_enabled = 1) AS destination_count, " +
      "(SELECT COUNT(*) FROM conflicts c JOIN destinations d ON d.id = c.destination_id " +
      "JOIN files f ON f.id = d.file_id WHERE f.project_id = p.id AND c.status = 'open') AS open_conflicts " +
      "FROM projects p"
  );
  const results: ProjectSummary[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, SqlValue>;
    results.push({
      id: row.id as string,
      local_repo_root: row.local_repo_root as string,
      display_name: (row.display_name as string) ?? null,
      github_owner: (row.github_owner as string) ?? null,
      github_repo: (row.github_repo as string) ?? null,
      github_clone_url: (row.github_clone_url as string) ?? null,
      local_clone_path: (row.local_clone_path as string) ?? null,
      aws_region: (row.aws_region as string) ?? null,
      aws_secret_id: (row.aws_secret_id as string) ?? null,
      poll_interval_seconds: row.poll_interval_seconds as number,
      last_remote_head: (row.last_remote_head as string) ?? null,
      created_at: (row.created_at as string) ?? null,
      updated_at: (row.updated_at as string) ?? null,
      file_count: Number(row.file_count ?? 0),
      destination_count: Number(row.destination_count ?? 0),
      open_conflicts: Number(row.open_conflicts ?? 0)
    });
  }
  stmt.free();
  return results;
}

export function createProject(input: ProjectInput): ProjectRecord {
  const db = getDatabase() as Database;
  const stmt = db.prepare(
    `INSERT INTO projects (
      id,
      local_repo_root,
      display_name,
      github_owner,
      github_repo,
      github_clone_url,
      local_clone_path,
      aws_region,
      aws_secret_id,
      poll_interval_seconds,
      last_remote_head
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  stmt.run([
    input.id,
    input.local_repo_root,
    input.display_name,
    input.github_owner,
    input.github_repo,
    input.github_clone_url,
    input.local_clone_path,
    input.aws_region,
    input.aws_secret_id,
    input.poll_interval_seconds,
    input.last_remote_head
  ]);
  stmt.free();

  const created = findProjectByLocalRoot(input.local_repo_root);
  if (!created) {
    throw new Error("Failed to create project record.");
  }
  return created;
}

export function updateProjectFields(projectId: string, fields: Partial<ProjectInput>): void {
  const db = getDatabase() as Database;
  const assignments: string[] = [];
  const values: SqlValue[] = [];

  for (const [key, value] of Object.entries(fields)) {
    assignments.push(`${key} = ?`);
    values.push((value ?? null) as SqlValue);
  }

  if (assignments.length === 0) return;

  const stmt = db.prepare(
    `UPDATE projects SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  );
  stmt.run([...values, projectId]);
  stmt.free();
}

export function deleteProject(projectId: string): void {
  const db = getDatabase() as Database;
  const stmt = db.prepare("DELETE FROM projects WHERE id = ?");
  stmt.run([projectId]);
  stmt.free();
}
