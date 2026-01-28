import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { ensureDir, getDataRoot, resolveAppPath } from "../util/paths";

let db: Database | null = null;
let sql: SqlJsStatic | null = null;
let dbPath: string | null = null;

function findSchemaPath(): string {
  const candidates = [
    resolveAppPath("dist", "main", "db", "schema.sql"),
    resolveAppPath("main", "db", "schema.sql"),
    resolveAppPath("src", "main", "db", "schema.sql")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error("SQLite schema file not found in known locations.");
}

function loadSchema(): string {
  const schemaPath = findSchemaPath();
  return fs.readFileSync(schemaPath, "utf8");
}

function findWasmPath(): string {
  const candidates = [
    resolveAppPath("dist", "main", "sql-wasm.wasm"),
    resolveAppPath("main", "sql-wasm.wasm"),
    resolveAppPath("node_modules", "sql.js", "dist", "sql-wasm.wasm")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (sql) return sql;
  sql = await initSqlJs({
    locateFile: () => findWasmPath()
  });
  return sql;
}

function loadExistingDatabase(): Database {
  if (!sql || !dbPath) {
    throw new Error("SQL.js not initialized.");
  }

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    return new sql.Database(fileBuffer);
  }

  return new sql.Database();
}

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  const dataRoot = getDataRoot();
  ensureDir(dataRoot);
  dbPath = path.join(dataRoot, "syncvault.sqlite");

  await loadSqlJs();
  db = loadExistingDatabase();
  db.exec(loadSchema());

  return db;
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error("Database has not been initialized.");
  }
  return db;
}

export function saveDatabase(): void {
  if (!db || !dbPath) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

export function closeDatabase(): void {
  if (!db) return;
  saveDatabase();
  db.close();
  db = null;
}
