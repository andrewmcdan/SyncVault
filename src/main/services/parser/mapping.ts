export interface FileMapping {
  fileId: string;
  templatePath: string;
  type: string;
  secrets: Record<string, { jsonKey: string }>;
}

export function buildMapping(
  fileId: string,
  templatePath: string,
  type: string,
  secretKeys: string[]
): FileMapping {
  const secrets: Record<string, { jsonKey: string }> = {};
  for (const key of secretKeys) {
    secrets[key] = { jsonKey: key };
  }
  return {
    fileId,
    templatePath,
    type,
    secrets
  };
}

export function serializeMapping(mapping: FileMapping): string {
  return JSON.stringify(mapping, null, 2);
}
