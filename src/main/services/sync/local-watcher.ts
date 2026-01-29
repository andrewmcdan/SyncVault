import chokidar from "chokidar";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { appendLog } from "../../ipc/handlers";
import { saveDatabase } from "../../db/sqlite";
import {
  getDestinationContextByPath,
  listDestinationPaths,
  updateDestinationFields
} from "../../db/repositories/destinations";
import { hashString } from "../../util/hash";
import { parseDotenv, hasSecretMarker } from "../parser/dotenv";
import { collectSecretKeys, renderTemplate } from "../parser/template";
import { upsertSecretJson } from "../aws/secrets-manager";
import { getGitHubToken, shouldUseGitHubTokenForGit } from "../auth/github-auth";
import { commitAll, pushWithAuth } from "../git/repo-manager";
import { applyAwsSelection } from "../auth/aws-auth";
import type { LogEntry } from "../../../shared/types";

const DEFAULTS = {
  debounceMs: 300,
  loopWindowMs: 800,
  refreshIntervalMs: 10000
};

let watcher: chokidar.FSWatcher | null = null;
let refreshTimer: NodeJS.Timeout | null = null;
const pending = new Map<string, NodeJS.Timeout>();
let config = { ...DEFAULTS };

export interface LocalWatcherOptions {
  debounceMs?: number;
  loopWindowMs?: number;
  refreshIntervalMs?: number;
}

function createLog(level: LogEntry["level"], message: string): LogEntry {
  return {
    id: crypto.randomUUID(),
    level,
    message,
    timestamp: new Date().toISOString()
  };
}

function schedule(pathKey: string, handler: () => Promise<void>): void {
  const existing = pending.get(pathKey);
  if (existing) clearTimeout(existing);
  const timeout = setTimeout(() => {
    pending.delete(pathKey);
    void handler();
  }, config.debounceMs);
  pending.set(pathKey, timeout);
}

async function handleLocalChange(destinationPath: string): Promise<void> {
  const context = getDestinationContextByPath(destinationPath);
  if (!context) return;

  const now = Date.now();
  if (context.last_tool_write_at && now - context.last_tool_write_at < config.loopWindowMs) {
    return;
  }

  if (!context.local_clone_path) return;
  if (!context.mapping_path || !context.template_path) return;

  const mappingFullPath = path.join(context.local_clone_path, context.mapping_path);
  if (!fs.existsSync(mappingFullPath)) return;
  const mappingRaw = fs.readFileSync(mappingFullPath, "utf8");
  const mapping = JSON.parse(mappingRaw) as {
    secrets?: Record<string, { jsonKey: string }>;
  };
  const secretKeys = new Set(Object.keys(mapping.secrets ?? {}));

  const content = fs.readFileSync(destinationPath, "utf8");
  const parsed = parseDotenv(content);
  const explicitSecretKeys = collectSecretKeys(parsed, (line) =>
    hasSecretMarker(line.valuePart)
  );
  let mappingUpdated = false;
  if (explicitSecretKeys.length > 0) {
    mapping.secrets = mapping.secrets ?? {};
    for (const key of explicitSecretKeys) {
      if (!mapping.secrets[key]) {
        mapping.secrets[key] = { jsonKey: key };
        secretKeys.add(key);
        mappingUpdated = true;
      }
    }
  }
  if (mappingUpdated) {
    fs.writeFileSync(mappingFullPath, JSON.stringify(mapping, null, 2), "utf8");
  }

  const { template, secrets } = renderTemplate(parsed, secretKeys);

  const templateFullPath = path.join(context.local_clone_path, context.template_path);
  fs.mkdirSync(path.dirname(templateFullPath), { recursive: true });
  fs.writeFileSync(templateFullPath, template, "utf8");

  updateDestinationFields(context.id, {
    last_local_hash: hashString(content)
  });

  const selection = applyAwsSelection();
  const region = context.aws_region ?? selection?.region;
  if (region && context.aws_secret_id && Object.keys(secrets).length > 0) {
    await upsertSecretJson(context.aws_secret_id, region, secrets);
  }

  await commitAll(context.local_clone_path, `SyncVault: update ${context.template_path}`);
  const token = getGitHubToken();
  if (context.github_owner && context.github_repo) {
    await pushWithAuth(
      context.local_clone_path,
      context.github_owner,
      context.github_repo,
      token,
      shouldUseGitHubTokenForGit()
    );
  }

  saveDatabase();
  appendLog(createLog("info", `Synced local change ${destinationPath}`));
}

async function refreshWatchedPaths(): Promise<void> {
  if (!watcher) return;
  const paths = listDestinationPaths();
  await watcher.add(paths);
}

export function startLocalWatcher(options: LocalWatcherOptions = {}): void {
  if (watcher) return;
  config = { ...DEFAULTS, ...options };
  const paths = listDestinationPaths();
  watcher = chokidar.watch(paths, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100
    }
  });

  watcher.on("add", (filePath) => schedule(filePath, () => handleLocalChange(filePath)));
  watcher.on("change", (filePath) => schedule(filePath, () => handleLocalChange(filePath)));

  refreshTimer = setInterval(() => {
    void refreshWatchedPaths();
  }, config.refreshIntervalMs);
}

export async function stopLocalWatcher(): Promise<void> {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
  for (const timeout of pending.values()) {
    clearTimeout(timeout);
  }
  pending.clear();
}
