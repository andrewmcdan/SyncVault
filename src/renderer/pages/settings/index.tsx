import { useEffect, useMemo, useState } from "react";
import type { AwsProfileInfo, AwsProfileSelection } from "@shared/types";

export default function SettingsPage(): JSX.Element {
  const [profiles, setProfiles] = useState<AwsProfileInfo[]>([]);
  const [selection, setSelection] = useState<AwsProfileSelection | null>(null);
  const [region, setRegion] = useState("");
  const [pat, setPat] = useState("");
  const [githubStatus, setGithubStatus] = useState("");
  const [gitHubAuthed, setGitHubAuthed] = useState(false);
  const [awsStatus, setAwsStatus] = useState("");
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
      }
    };
    void load();
  }, []);

  const profileOptions = useMemo(() => profiles.map((p) => p.name), [profiles]);

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
            />
          </label>
          <button type="button" onClick={handleSavePat} disabled={isBusy}>
            Save token
          </button>
          <button type="button" onClick={handleClearGitHub} disabled={!gitHubAuthed}>
            Clear token
          </button>
        </div>
        {githubStatus && <p className="settings__status">{githubStatus}</p>}
        {gitHubAuthed && <p className="settings__status">GitHub is connected.</p>}
      </div>
    </section>
  );
}
