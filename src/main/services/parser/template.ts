import type { DotenvFile } from "./dotenv";
import { extractSecretMarker } from "./dotenv";

export const PLACEHOLDER_PREFIX = "SYNCVAULT";

export function makePlaceholder(key: string): string {
  return `{{${PLACEHOLDER_PREFIX}:${key}}}`;
}

export function renderTemplate(
  parsed: DotenvFile,
  secretKeys: Set<string>
): { template: string; secrets: Record<string, string> } {
  const secrets: Record<string, string> = {};
  const outputLines: string[] = [];

  for (const line of parsed.lines) {
    if (line.type !== "kv") {
      outputLines.push(line.raw);
      continue;
    }

    if (!secretKeys.has(line.key)) {
      outputLines.push(line.raw);
      continue;
    }

    const { value } = extractSecretMarker(line.valuePart);
    const trimmedValue = value.trim();
    if (trimmedValue !== "") {
      secrets[line.key] = trimmedValue;
    }

    const placeholder = makePlaceholder(line.key);
    const renderedValue = `${placeholder}${line.trailingWhitespace}${line.commentPart}`;
    outputLines.push(`${line.prefix}${line.key}${line.separator}${renderedValue}`);
  }

  let template = outputLines.join("\n");
  if (parsed.endsWithNewline && outputLines[outputLines.length - 1] !== "") {
    template += "\n";
  }

  return { template, secrets };
}

export function collectSecretKeys(
  parsed: DotenvFile,
  matcher: (line: Extract<DotenvFile["lines"][number], { type: "kv" }>) => boolean
): string[] {
  const keys = new Set<string>();
  for (const line of parsed.lines) {
    if (line.type === "kv" && matcher(line)) {
      keys.add(line.key);
    }
  }
  return Array.from(keys);
}
