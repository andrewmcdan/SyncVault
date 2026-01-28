import { startLocalWatcher, stopLocalWatcher } from "./local-watcher";
import { startRemotePoller, stopRemotePoller } from "./remote-poller";
import { getSyncSettings } from "./settings";

let running = false;

export function startSyncEngine(): void {
  if (running) return;
  running = true;
  const settings = getSyncSettings();
  startLocalWatcher({
    debounceMs: settings.debounceMs,
    loopWindowMs: settings.loopWindowMs,
    refreshIntervalMs: settings.refreshIntervalMs
  });
  startRemotePoller(settings.pollIntervalMs);
}

export async function stopSyncEngine(): Promise<void> {
  if (!running) return;
  running = false;
  await stopLocalWatcher();
  stopRemotePoller();
}
