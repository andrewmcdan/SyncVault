import { startLocalWatcher, stopLocalWatcher } from "./local-watcher";
import { startRemotePoller, stopRemotePoller } from "./remote-poller";
import { getSyncSettings } from "./settings";
import { publishStatus } from "../../ipc/handlers";

let running = false;

export function startSyncEngine(): void {
  if (running) return;
  const settings = getSyncSettings();
  if (settings.paused) {
    publishStatus({
      state: "ready",
      message: "Sync paused",
      updatedAt: new Date().toISOString()
    });
    return;
  }
  running = true;
  startLocalWatcher({
    debounceMs: settings.debounceMs,
    loopWindowMs: settings.loopWindowMs,
    refreshIntervalMs: settings.refreshIntervalMs
  });
  startRemotePoller(settings.pollIntervalMs);
  publishStatus({
    state: "ready",
    message: "Watching for changes",
    updatedAt: new Date().toISOString()
  });
}

export async function stopSyncEngine(): Promise<void> {
  if (!running) return;
  running = false;
  await stopLocalWatcher();
  stopRemotePoller();
  const paused = getSyncSettings().paused;
  publishStatus({
    state: "ready",
    message: paused ? "Sync paused" : "Sync stopped",
    updatedAt: new Date().toISOString()
  });
}
