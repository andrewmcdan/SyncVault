import { getJsonSetting, setJsonSetting } from "../../db/repositories/settings";
import type { SyncSettings } from "../../../shared/types";

const DEFAULT_SETTINGS: SyncSettings = {
  pollIntervalMs: 20000,
  debounceMs: 300,
  loopWindowMs: 800,
  refreshIntervalMs: 10000
};

export function getSyncSettings(): SyncSettings {
  const stored = getJsonSetting<Partial<SyncSettings>>("sync.settings");
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {})
  };
}

export function setSyncSettings(next: Partial<SyncSettings>): SyncSettings {
  const current = getSyncSettings();
  const merged = { ...current, ...next };
  setJsonSetting("sync.settings", merged);
  return merged;
}
