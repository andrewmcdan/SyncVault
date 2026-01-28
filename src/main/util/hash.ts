import crypto from "node:crypto";

export function hashString(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function generateId(): string {
  return crypto.randomUUID();
}
