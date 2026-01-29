import { useEffect, useMemo, useState } from "react";
import type { AwsProfileInfo, AwsProfileSelection, GitHubAuthStatus, SyncSettings } from "@shared/types";

const defaultSyncSettings: SyncSettings = {
  pollIntervalMs: 20000,
  debounceMs: 300,
  loopWindowMs: 800,
  refreshIntervalMs: 10000
};

const syncLimits = {
  pollIntervalSec: { min: 5, max: 3600 },
  debounceMs: { min: 50, max: 5000 },
  loopWindowMs: { min: 100, max: 10000 },
  refreshIntervalSec: { min: 5, max: 300 }
};

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function SettingsPage(): JSX.Element {
  const [profiles, setProfiles] = useState<AwsProfileInfo[]>([]);
  const [selection, setSelection] = useState<AwsProfileSelection | null>(null);
  const [region, setRegion] = useState("");
  const [pat, setPat] = useState("");
  const [githubStatus, setGithubStatus] = useState("");
  const [gitHubAuthed, setGitHubAuthed] = useState(false);
  const [gitHubAuthMode, setGitHubAuthMode] = useState<GitHubAuthStatus["mode"]>("pat");
  const [gitHubAuthMessage, setGitHubAuthMessage] = useState<string | undefined>();
  const [awsStatus, setAwsStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [syncSettings, setSyncSettingsState] = useState<SyncSettings>(defaultSyncSettings);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      const loadedProfiles = (await window.syncvault?.listAwsProfiles?.()) ?? [];
      setProfiles(loadedProfiles);
      const current = await window.syncvault?.getAwsProfile?.();
      setSelection(current ?? null);
      if (current?.region) {
        setRegion(current.region);
      } else if (loadedProfiles.length > 0) {
        const first = loadedProfiles.find((p) => p.name === current?.profile);
        if (first?.region) setRegion(first.region);
      }
      const status = await window.syncvault?.getGitHubAuthStatus?.();
      if (status) {
        setGitHubAuthed(status.isAuthenticated);
        setGitHubAuthMode(status.mode);
        setGitHubAuthMessage(status.message);
      }
      const settings = await window.syncvault?.getSyncSettings?.();
      if (settings) setSyncSettingsState(settings);
    };
    void load();
  }, []);

  const profileOptions = useMemo(() => profiles.map((p) => p.name), [profiles]);
  const pollSeconds = Math.round(syncSettings.pollIntervalMs / 1000);
  const refreshSeconds = Math.round(syncSettings.refreshIntervalMs / 1000);
  const syncErrors = useMemo(() => {
    return {
      pollInterval:
        pollSeconds < syncLimits.pollIntervalSec.min ||
        pollSeconds > syncLimits.pollIntervalSec.max
          ? `Enter ${syncLimits.pollIntervalSec.min}-${syncLimits.pollIntervalSec.max} seconds.`
          : "",
      debounce:
        syncSettings.debounceMs < syncLimits.debounceMs.min ||
        syncSettings.debounceMs > syncLimits.debounceMs.max
          ? `Enter ${syncLimits.debounceMs.min}-${syncLimits.debounceMs.max} ms.`
          : "",
      loopWindow:
        syncSettings.loopWindowMs < syncLimits.loopWindowMs.min ||
        syncSettings.loopWindowMs > syncLimits.loopWindowMs.max
          ? `Enter ${syncLimits.loopWindowMs.min}-${syncLimits.loopWindowMs.max} ms.`
          : "",
      refreshInterval:
        refreshSeconds < syncLimits.refreshIntervalSec.min ||
        refreshSeconds > syncLimits.refreshIntervalSec.max
          ? `Enter ${syncLimits.refreshIntervalSec.min}-${syncLimits.refreshIntervalSec.max} seconds.`
          : ""
    };
  }, [pollSeconds, refreshSeconds, syncSettings.debounceMs, syncSettings.loopWindowMs]);
  const hasSyncErrors = Object.values(syncErrors).some(Boolean);

  const handleAwsSave = async () => {
    if (!selection?.profile) {
      setAwsStatus("Select a profile first.");
      return;
    }
    setIsBusy(true);
    setAwsStatus("Saving AWS profile...");
    try {
      const next = { profile: selection.profile, region: region || undefined };
      await window.syncvault?.setAwsProfile?.(next);
      setSelection(next);
      setAwsStatus("AWS profile saved.");
    } catch (error) {
      setAwsStatus("Failed to save AWS profile.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSavePat = async () => {
    if (gitHubAuthMode === "native") {
      setGithubStatus("GitHub is already enabled via system credentials.");
      return;
    }
    if (!pat.trim()) {
      setGithubStatus("GitHub token is required.");
      return;
    }
    setIsBusy(true);
    setGithubStatus("Saving token...");
    try {
      await window.syncvault?.setGitHubToken?.({ token: pat });
      setGitHubAuthed(true);
      setGithubStatus("GitHub token saved.");
      setPat("");
    } catch (error) {
      setGithubStatus("Failed to save token.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleClearGitHub = async () => {
    await window.syncvault?.clearGitHubAuth?.();
    setGitHubAuthed(false);
    setGithubStatus("GitHub token cleared.");
  };

  const handleSyncSave = async () => {
    if (hasSyncErrors) {
      setSyncStatus("Fix validation errors before saving.");
      return;
    }
    setIsBusy(true);
    setSyncStatus("Saving sync settings...");
    try {
      const next = await window.syncvault?.setSyncSettings?.(syncSettings);
      if (next) setSyncSettingsState(next);
      setSyncStatus("Sync settings saved.");
    } catch (error) {
      setSyncStatus("Failed to save sync settings.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="settings">
      <h2>Settings</h2>

      <div className="settings__section">
        <h3>AWS profile</h3>
        {profileOptions.length === 0 ? (
          <p className="muted">No AWS profiles found. Configure ~/.aws/config first.</p>
        ) : (
          <div className="settings__row">
            <label>
              Profile
              <select
                value={selection?.profile ?? ""}
                onChange={(event) =>
                  setSelection({ profile: event.target.value, region: selection?.region })
                }
              >
                <option value="" disabled>
                  Select a profile
                </option>
                {profileOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Region
              <input
                type="text"
                placeholder="us-east-1"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
              />
            </label>
            <button type="button" onClick={handleAwsSave} disabled={isBusy}>
              Save
            </button>
          </div>
        )}
        {awsStatus && <p className="settings__status">{awsStatus}</p>}
      </div>

      <div className="settings__section">
        <h3>GitHub token</h3>
        <div className="settings__row">
          <label>
            Personal Access Token
            <input
              type="text"
              value={pat}
              onChange={(event) => setPat(event.target.value)}
              placeholder="ghp_..."
              disabled={gitHubAuthMode === "native"}
            />
          </label>
          <button type="button" onClick={handleSavePat} disabled={isBusy || gitHubAuthMode === "native"}>
            Save token
          </button>
          <button
            type="button"
            onClick={handleClearGitHub}
            disabled={!gitHubAuthed || gitHubAuthMode === "native"}
          >
            Clear token
          </button>
        </div>
        {githubStatus && <p className="settings__status">{githubStatus}</p>}
        {gitHubAuthMode === "native" && (
          <p className="settings__status">
            {gitHubAuthMessage ?? "GitHub already enabled via system Git credentials."}
          </p>
        )}
        {gitHubAuthed && gitHubAuthMode !== "native" && (
          <p className="settings__status">GitHub is connected.</p>
        )}
      </div>

      <div className="settings__section">
        <h3>Sync settings</h3>
        <div className="settings__row">
          <label>
            Remote poll interval (seconds)
            <input
              type="number"
              min={syncLimits.pollIntervalSec.min}
              max={syncLimits.pollIntervalSec.max}
              value={pollSeconds}
              className={syncErrors.pollInterval ? "is-invalid" : ""}
              onChange={(event) =>
                setSyncSettingsState((prev) => ({
                  ...prev,
                  pollIntervalMs: toNumber(event.target.value) * 1000
                }))
              }
            />
            {syncErrors.pollInterval && (
              <span className="settings__error">{syncErrors.pollInterval}</span>
            )}
          </label>
          <label>
            Local debounce (ms)
            <input
              type="number"
              min={syncLimits.debounceMs.min}
              max={syncLimits.debounceMs.max}
              value={syncSettings.debounceMs}
              className={syncErrors.debounce ? "is-invalid" : ""}
              onChange={(event) =>
                setSyncSettingsState((prev) => ({
                  ...prev,
                  debounceMs: toNumber(event.target.value)
                }))
              }
            />
            {syncErrors.debounce && <span className="settings__error">{syncErrors.debounce}</span>}
          </label>
          <label>
            Loop suppression window (ms)
            <input
              type="number"
              min={syncLimits.loopWindowMs.min}
              max={syncLimits.loopWindowMs.max}
              value={syncSettings.loopWindowMs}
              className={syncErrors.loopWindow ? "is-invalid" : ""}
              onChange={(event) =>
                setSyncSettingsState((prev) => ({
                  ...prev,
                  loopWindowMs: toNumber(event.target.value)
                }))
              }
            />
            {syncErrors.loopWindow && (
              <span className="settings__error">{syncErrors.loopWindow}</span>
            )}
          </label>
          <label>
            Watch refresh interval (seconds)
            <input
              type="number"
              min={syncLimits.refreshIntervalSec.min}
              max={syncLimits.refreshIntervalSec.max}
              value={refreshSeconds}
              className={syncErrors.refreshInterval ? "is-invalid" : ""}
              onChange={(event) =>
                setSyncSettingsState((prev) => ({
                  ...prev,
                  refreshIntervalMs: toNumber(event.target.value) * 1000
                }))
              }
            />
            {syncErrors.refreshInterval && (
              <span className="settings__error">{syncErrors.refreshInterval}</span>
            )}
          </label>
          <button type="button" onClick={handleSyncSave} disabled={isBusy || hasSyncErrors}>
            Save sync settings
          </button>
        </div>
        {syncStatus && <p className="settings__status">{syncStatus}</p>}
      </div>
    </section>
  );
}
