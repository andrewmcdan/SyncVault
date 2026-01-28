import { getSetting, setSetting } from "../../db/repositories/settings";

export function getGitHubToken(): string | null {
  return getSetting("github.token");
}

export function setGitHubToken(token: string): void {
  setSetting("github.token", token);
}

export function clearGitHubToken(): void {
  setSetting("github.token", null);
}
