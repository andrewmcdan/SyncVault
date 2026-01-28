import type { Database, SqlValue } from "sql.js";
import { getDatabase } from "../sqlite";

export interface ConflictRecord {
  id: string;
  destination_id: string;
  detected_at: string;
  local_copy_path: string | null;
  remote_copy_path: string | null;
  status: string;
}

export interface ConflictListItem {
  id: string;
  destination_id: string;
  destination_path: string;
  local_copy_path: string | null;
  remote_copy_path: string | null;
  status: string;
  detected_at: string;
}

function normalizeDetectedAt(value: unknown): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return new Date().toISOString();
}

function mapConflict(row: Record<string, unknown>): ConflictRecord {
  return {
    id: row.id as string,
    destination_id: row.destination_id as string,
    detected_at: normalizeDetectedAt(row.detected_at),
    local_copy_path: (row.local_copy_path as string) ?? null,
    remote_copy_path: (row.remote_copy_path as string) ?? null,
    status: row.status as string
  };
}

export function findOpenConflictByDestination(destinationId: string): ConflictRecord | null {
  const db = getDatabase() as Database;
  const stmt = db.prepare(
    "SELECT * FROM conflicts WHERE destination_id = ? AND status = 'open' LIMIT 1"
  );
  stmt.bind([destinationId]);
  let result: ConflictRecord | null = null;
  if (stmt.step()) {
    result = mapConflict(stmt.getAsObject());
  }
  stmt.free();
  return result;
}

export function createConflict(input: ConflictRecord): ConflictRecord {
  const db = getDatabase() as Database;
  const detectedAt = input.detected_at || new Date().toISOString();
  const stmt = db.prepare(
    "INSERT INTO conflicts (id, destination_id, detected_at, local_copy_path, remote_copy_path, status) VALUES (?, ?, ?, ?, ?, ?)"
  );
  stmt.run([
    input.id,
    input.destination_id,
    detectedAt,
    input.local_copy_path,
    input.remote_copy_path,
    input.status
  ]);
  stmt.free();
  return { ...input, detected_at: detectedAt };
}

export function listOpenConflicts(): ConflictListItem[] {
  const db = getDatabase() as Database;
  const stmt = db.prepare(
    "SELECT c.id, c.destination_id, c.detected_at, c.local_copy_path, c.remote_copy_path, c.status, d.destination_path " +
      "FROM conflicts c JOIN destinations d ON d.id = c.destination_id WHERE c.status = 'open'"
  );
  const results: ConflictListItem[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, SqlValue>;
    results.push({
      id: row.id as string,
      destination_id: row.destination_id as string,
      destination_path: row.destination_path as string,
      local_copy_path: (row.local_copy_path as string) ?? null,
      remote_copy_path: (row.remote_copy_path as string) ?? null,
      status: row.status as string,
      detected_at: normalizeDetectedAt(row.detected_at)
    });
  }
  stmt.free();
  return results;
}

export function findConflictListItemById(conflictId: string): ConflictListItem | null {
  const db = getDatabase() as Database;
  const stmt = db.prepare(
    "SELECT c.id, c.destination_id, c.detected_at, c.local_copy_path, c.remote_copy_path, c.status, d.destination_path " +
      "FROM conflicts c JOIN destinations d ON d.id = c.destination_id WHERE c.id = ? LIMIT 1"
  );
  stmt.bind([conflictId]);
  let result: ConflictListItem | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, SqlValue>;
    result = {
      id: row.id as string,
      destination_id: row.destination_id as string,
      destination_path: row.destination_path as string,
      local_copy_path: (row.local_copy_path as string) ?? null,
      remote_copy_path: (row.remote_copy_path as string) ?? null,
      status: row.status as string,
      detected_at: normalizeDetectedAt(row.detected_at)
    };
  }
  stmt.free();
  return result;
}

export function resolveConflict(conflictId: string): void {
  const db = getDatabase() as Database;
  const stmt = db.prepare("UPDATE conflicts SET status = 'resolved' WHERE id = ?");
  stmt.run([conflictId]);
  stmt.free();
}
