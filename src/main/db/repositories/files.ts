import type { Database } from "sql.js";
import { getDatabase } from "../sqlite";
import type { FileInput, FileRecord } from "../../models/file";

function mapFile(row: Record<string, unknown>): FileRecord {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    source_relative_path: row.source_relative_path as string,
    template_path: row.template_path as string,
    mapping_path: row.mapping_path as string,
    type: row.type as string,
    created_at: (row.created_at as string) ?? null,
    updated_at: (row.updated_at as string) ?? null
  };
}

export function findFileByProjectPath(
  projectId: string,
  sourceRelativePath: string
): FileRecord | null {
  const db = getDatabase() as Database;
  const stmt = db.prepare(
    "SELECT * FROM files WHERE project_id = ? AND source_relative_path = ? LIMIT 1"
  );
  stmt.bind([projectId, sourceRelativePath]);

  let result: FileRecord | null = null;
  if (stmt.step()) {
    result = mapFile(stmt.getAsObject());
  }
  stmt.free();
  return result;
}

export function createFile(input: FileInput): FileRecord {
  const db = getDatabase() as Database;
  const stmt = db.prepare(
    `INSERT INTO files (
      id,
      project_id,
      source_relative_path,
      template_path,
      mapping_path,
      type
    ) VALUES (?, ?, ?, ?, ?, ?)`
  );

  stmt.run([
    input.id,
    input.project_id,
    input.source_relative_path,
    input.template_path,
    input.mapping_path,
    input.type
  ]);
  stmt.free();

  const created = findFileByProjectPath(input.project_id, input.source_relative_path);
  if (!created) {
    throw new Error("Failed to create file record.");
  }
  return created;
}
