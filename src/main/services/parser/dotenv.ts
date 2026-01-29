export interface DotenvLineCommon {
  raw: string;
}

export interface DotenvLineBase extends DotenvLineCommon {
  type: "blank" | "comment" | "raw";
}

export interface DotenvKeyValueLine extends DotenvLineCommon {
  type: "kv";
  key: string;
  prefix: string;
  separator: string;
  valuePart: string;
  trailingWhitespace: string;
  commentPart: string;
}

export type DotenvLine = DotenvLineBase | DotenvKeyValueLine;

export interface DotenvFile {
  lines: DotenvLine[];
  endsWithNewline: boolean;
}

const KEY_REGEX = /^([A-Za-z_][A-Za-z0-9_]*)$/;
export const SYNCVAULT_SECRET_MARKER = "!SYNCVAULT";

function splitInlineComment(valueRaw: string): {
  valuePart: string;
  commentPart: string;
} {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < valueRaw.length; i += 1) {
    const char = valueRaw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char === "#" && !inSingle && !inDouble) {
      return {
        valuePart: valueRaw.slice(0, i),
        commentPart: valueRaw.slice(i)
      };
    }
  }

  return { valuePart: valueRaw, commentPart: "" };
}

export function parseDotenv(content: string): DotenvFile {
  const endsWithNewline = content.endsWith("\n");
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const parsed: DotenvLine[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      parsed.push({ type: "blank", raw: line });
      continue;
    }

    const trimmed = line.trimStart();
    if (trimmed.startsWith("#")) {
      parsed.push({ type: "comment", raw: line });
      continue;
    }

    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match) {
      parsed.push({ type: "raw", raw: line });
      continue;
    }

    const [, prefix, key, separator, valueRaw] = match;
    if (!KEY_REGEX.test(key)) {
      parsed.push({ type: "raw", raw: line });
      continue;
    }

    const { valuePart, commentPart } = splitInlineComment(valueRaw);
    const trailingWhitespaceMatch = valuePart.match(/\s*$/);
    const trailingWhitespace = trailingWhitespaceMatch ? trailingWhitespaceMatch[0] : "";
    const valueCore = valuePart.slice(0, Math.max(0, valuePart.length - trailingWhitespace.length));

    parsed.push({
      type: "kv",
      raw: line,
      key,
      prefix,
      separator,
      valuePart: valueCore,
      trailingWhitespace,
      commentPart
    });
  }

  return { lines: parsed, endsWithNewline };
}

export function isLikelySecretKey(key: string): boolean {
  const upper = key.toUpperCase();
  return ["SECRET", "TOKEN", "PASSWORD", "PASS", "API_KEY", "PRIVATE_KEY", "KEY"].some((token) =>
    upper.includes(token)
  );
}

export function extractSecretMarker(valuePart: string): { value: string; hasMarker: boolean } {
  const trimmed = valuePart.trimEnd();
  const markerUpper = SYNCVAULT_SECRET_MARKER.toUpperCase();
  const trimmedUpper = trimmed.toUpperCase();
  if (!trimmedUpper.endsWith(markerUpper)) {
    return { value: valuePart, hasMarker: false };
  }

  const markerStart = trimmed.length - SYNCVAULT_SECRET_MARKER.length;
  const beforeMarker = markerStart > 0 ? trimmed[markerStart - 1] : "";
  if (markerStart > 0 && !/\s/.test(beforeMarker)) {
    return { value: valuePart, hasMarker: false };
  }

  const withoutMarker = trimmed.slice(0, markerStart).trimEnd();
  return { value: withoutMarker, hasMarker: true };
}

export function hasSecretMarker(valuePart: string): boolean {
  return extractSecretMarker(valuePart).hasMarker;
}
