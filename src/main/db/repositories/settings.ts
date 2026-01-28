import type { Database } from "sql.js";
import { getDatabase } from "../sqlite";

export function getSetting(key: string): string | null {
  const db = getDatabase() as Database;
  const stmt = db.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1");
  stmt.bind([key]);
  let value: string | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject() as { value?: string };
    value = row.value ?? null;
  }
  stmt.free();
  return value;
}

export function setSetting(key: string, value: string | null): void {
  const db = getDatabase() as Database;
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  stmt.run([key, value]);
  stmt.free();
}

export function getJsonSetting<T>(key: string): T | null {
  const raw = getSetting(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setJsonSetting<T>(key: string, value: T | null): void {
  if (value === null) {
    setSetting(key, null);
    return;
  }
  setSetting(key, JSON.stringify(value));
}
