import { getSetting, setSetting } from "../../db/repositories/settings";
import { listProjects } from "../../db/repositories/projects";
import { runGit } from "../git/git-client";
import { spawn } from "node:child_process";

export type GitHubAuthMode = "pat" | "native";

const AUTH_MODE_KEY = "github.auth.mode";

export function getGitHubToken(): string | null {
  return getSetting("github.token");
}

export function setGitHubToken(token: string): void {
  setSetting("github.token", token);
}

export function clearGitHubToken(): void {
  setSetting("github.token", null);
}

export function getGitHubAuthMode(): GitHubAuthMode {
  return getSetting(AUTH_MODE_KEY) === "native" ? "native" : "pat";
}

export function setGitHubAuthMode(mode: GitHubAuthMode): void {
  setSetting(AUTH_MODE_KEY, mode);
}

export function shouldUseGitHubTokenForGit(): boolean {
  return getGitHubAuthMode() === "pat";
}

async function readGitCredentialToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "never",
      GCM_GUI_PROMPT: "0"
    };
    const child = spawn("git", ["credential", "fill"], {
      cwd: process.cwd(),
      env
    });
    child.on("error", () => resolve(null));
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", () => {
      const lines = output.split(/\r?\n/);
      const values: Record<string, string> = {};
      for (const line of lines) {
        if (!line.includes("=")) continue;
        const [key, ...rest] = line.split("=");
        values[key] = rest.join("=");
      }
      const password = values.password?.trim();
      resolve(password || null);
    });
    child.stdin.write("protocol=https\nhost=github.com\n\n");
    child.stdin.end();
  });
}

export async function getGitHubApiToken(): Promise<string | null> {
  const token = getGitHubToken();
  if (token) return token;
  if (getGitHubAuthMode() !== "native") return null;
  return readGitCredentialToken();
}

export async function detectGitHubAuthMode(): Promise<GitHubAuthMode> {
  if (process.platform !== "win32") {
    return getGitHubAuthMode();
  }

  const projects = listProjects().filter((project) => project.github_clone_url);
  if (projects.length === 0) {
    return getGitHubAuthMode();
  }

  const env = {
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never"
  };

  for (const project of projects) {
    const cloneUrl = project.github_clone_url;
    if (!cloneUrl) continue;
    try {
      await runGit(["ls-remote", cloneUrl, "HEAD"], process.cwd(), { env });
      setGitHubAuthMode("native");
      return "native";
    } catch {
      continue;
    }
  }

  setGitHubAuthMode("pat");
  return "pat";
}
