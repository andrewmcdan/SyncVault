import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getJsonSetting, setJsonSetting } from "../../db/repositories/settings";

export interface AwsProfileInfo {
  name: string;
  region?: string;
  source: "config" | "credentials";
}

export interface AwsProfileSelection {
  profile: string;
  region?: string;
}

function parseIni(content: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  let currentSection: string | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;

    const sectionMatch = line.match(/^\[(.+)]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (!result[currentSection]) {
        result[currentSection] = {};
      }
      continue;
    }

    if (!currentSection) continue;
    const [key, ...rest] = line.split("=");
    if (!key) continue;
    const value = rest.join("=").trim();
    result[currentSection][key.trim()] = value;
  }

  return result;
}

function normalizeProfileName(section: string): string {
  if (section === "default") return "default";
  return section.replace(/^profile\s+/, "");
}

export function listAwsProfiles(): AwsProfileInfo[] {
  const home = os.homedir();
  const configPath = path.join(home, ".aws", "config");
  const credentialsPath = path.join(home, ".aws", "credentials");

  const profiles: Record<string, AwsProfileInfo> = {};

  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, "utf8");
    const parsed = parseIni(content);
    for (const [section, values] of Object.entries(parsed)) {
      const name = normalizeProfileName(section);
      profiles[name] = {
        name,
        region: values.region,
        source: "config"
      };
    }
  }

  if (fs.existsSync(credentialsPath)) {
    const content = fs.readFileSync(credentialsPath, "utf8");
    const parsed = parseIni(content);
    for (const section of Object.keys(parsed)) {
      const name = normalizeProfileName(section);
      profiles[name] = profiles[name] ?? {
        name,
        source: "credentials"
      };
    }
  }

  return Object.values(profiles).sort((a, b) => a.name.localeCompare(b.name));
}

export function getAwsSelection(): AwsProfileSelection | null {
  return getJsonSetting<AwsProfileSelection>("aws.selection");
}

export function setAwsSelection(selection: AwsProfileSelection | null): void {
  setJsonSetting("aws.selection", selection);
}

export function applyAwsSelection(): AwsProfileSelection | null {
  const selection = getAwsSelection();
  if (!selection) return null;
  process.env.AWS_PROFILE = selection.profile;
  if (selection.region) {
    process.env.AWS_REGION = selection.region;
    process.env.AWS_DEFAULT_REGION = selection.region;
  }
  return selection;
}
