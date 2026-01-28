import type { DotenvFile } from "./dotenv";

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

    const value = line.valuePart.trim();
    if (value !== "") {
      secrets[line.key] = value;
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
  matcher: (key: string) => boolean
): string[] {
  const keys = new Set<string>();
  for (const line of parsed.lines) {
    if (line.type === "kv" && matcher(line.key)) {
      keys.add(line.key);
    }
  }
  return Array.from(keys);
}
