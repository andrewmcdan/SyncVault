import type { Database } from "sql.js";
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
