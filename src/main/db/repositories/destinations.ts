import type { Database, SqlValue } from "sql.js";
import { getDatabase } from "../sqlite";
import type { DestinationInput, DestinationRecord } from "../../models/destination";

function mapDestination(row: Record<string, unknown>): DestinationRecord {
  return {
    id: row.id as string,
    file_id: row.file_id as string,
    destination_path: row.destination_path as string,
    last_local_hash: (row.last_local_hash as string) ?? null,
    last_render_hash: (row.last_render_hash as string) ?? null,
    last_tool_write_at: (row.last_tool_write_at as number) ?? null,
    is_enabled: (row.is_enabled as number) ?? null,
    created_at: (row.created_at as string) ?? null,
    updated_at: (row.updated_at as string) ?? null
  };
}

export function findDestinationByPath(
  fileId: string,
  destinationPath: string
): DestinationRecord | null {
  const db = getDatabase() as Database;
  const stmt = db.prepare(
    "SELECT * FROM destinations WHERE file_id = ? AND destination_path = ? LIMIT 1"
  );
  stmt.bind([fileId, destinationPath]);

  let result: DestinationRecord | null = null;
  if (stmt.step()) {
    result = mapDestination(stmt.getAsObject());
  }
  stmt.free();
  return result;
}

export interface DestinationContext {
  id: string;
  destination_path: string;
  last_tool_write_at: number | null;
  file_id: string;
  mapping_path: string;
  template_path: string;
  project_id: string;
  local_clone_path: string | null;
  github_owner: string | null;
  github_repo: string | null;
  aws_region: string | null;
  aws_secret_id: string | null;
}

export function getDestinationContextByPath(destinationPath: string): DestinationContext | null {
  const db = getDatabase() as Database;
  const stmt = db.prepare(
    "SELECT d.id, d.destination_path, d.last_tool_write_at, d.file_id, " +
      "f.mapping_path, f.template_path, f.project_id, " +
      "p.local_clone_path, p.github_owner, p.github_repo, p.aws_region, p.aws_secret_id " +
      "FROM destinations d " +
      "JOIN files f ON f.id = d.file_id " +
      "JOIN projects p ON p.id = f.project_id " +
      "WHERE d.destination_path = ? AND d.is_enabled = 1 LIMIT 1"
  );
  stmt.bind([destinationPath]);

  let result: DestinationContext | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, SqlValue>;
    result = {
      id: row.id as string,
      destination_path: row.destination_path as string,
      last_tool_write_at: (row.last_tool_write_at as number) ?? null,
      file_id: row.file_id as string,
      mapping_path: row.mapping_path as string,
      template_path: row.template_path as string,
      project_id: row.project_id as string,
      local_clone_path: (row.local_clone_path as string) ?? null,
      github_owner: (row.github_owner as string) ?? null,
      github_repo: (row.github_repo as string) ?? null,
      aws_region: (row.aws_region as string) ?? null,
      aws_secret_id: (row.aws_secret_id as string) ?? null
    };
  }
  stmt.free();
  return result;
}

export function listDestinationPaths(): string[] {
  const db = getDatabase() as Database;
  const stmt = db.prepare("SELECT destination_path FROM destinations WHERE is_enabled = 1");
  const results: string[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { destination_path?: string };
    if (row.destination_path) results.push(row.destination_path);
  }
  stmt.free();
  return results;
}

export function listDestinationsByFileId(fileId: string): DestinationRecord[] {
  const db = getDatabase() as Database;
  const stmt = db.prepare("SELECT * FROM destinations WHERE file_id = ? AND is_enabled = 1");
  stmt.bind([fileId]);
  const results: DestinationRecord[] = [];
  while (stmt.step()) {
    results.push(mapDestination(stmt.getAsObject()));
  }
  stmt.free();
  return results;
}

export function updateDestinationFields(
  destinationId: string,
  fields: Partial<DestinationInput>
): void {
  const db = getDatabase() as Database;
  const assignments: string[] = [];
  const values: SqlValue[] = [];

  for (const [key, value] of Object.entries(fields)) {
    assignments.push(`${key} = ?`);
    values.push((value ?? null) as SqlValue);
  }

  if (assignments.length === 0) return;

  const stmt = db.prepare(
    `UPDATE destinations SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  );
  stmt.run([...values, destinationId]);
  stmt.free();
}

export function createDestination(input: DestinationInput): DestinationRecord {
  const db = getDatabase() as Database;
  const stmt = db.prepare(
    `INSERT INTO destinations (
      id,
      file_id,
      destination_path,
      last_local_hash,
      last_render_hash,
      last_tool_write_at,
      is_enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  stmt.run([
    input.id,
    input.file_id,
    input.destination_path,
    input.last_local_hash,
    input.last_render_hash,
    input.last_tool_write_at,
    input.is_enabled
  ]);
  stmt.free();

  const created = findDestinationByPath(input.file_id, input.destination_path);
  if (!created) {
    throw new Error("Failed to create destination record.");
  }
  return created;
}
