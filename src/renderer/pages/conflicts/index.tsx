import { useCallback, useEffect, useState } from "react";
import type { ConflictListItem } from "@shared/types";

export default function ConflictsPage(): JSX.Element {
  const [conflicts, setConflicts] = useState<ConflictListItem[]>([]);
  const [status, setStatus] = useState("");
  const [refreshMs, setRefreshMs] = useState(10000);

  const loadConflicts = useCallback(async () => {
    const items = await window.syncvault?.listConflicts?.();
    setConflicts(items ?? []);
  }, []);

  useEffect(() => {
    void loadConflicts();
  }, [loadConflicts]);

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await window.syncvault?.getSyncSettings?.();
      if (settings?.refreshIntervalMs) {
        setRefreshMs(Math.max(5000, settings.refreshIntervalMs));
      }
    };
    void loadSettings();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadConflicts();
    }, refreshMs);
    return () => window.clearInterval(id);
  }, [loadConflicts, refreshMs]);

  const handleOpen = async (filePath: string | null) => {
    if (!filePath) return;
    await window.syncvault?.openPath?.(filePath);
  };

  const handleOpenDiff = async (localPath: string | null, remotePath: string | null) => {
    if (!localPath || !remotePath) {
      setStatus("Both local and remote copies are required to open a diff.");
      return;
    }
    setStatus("Opening diff...");
    try {
      await window.syncvault?.openDiff?.(localPath, remotePath);
      setStatus("Diff opened.");
    } catch {
      setStatus("Failed to open diff.");
    }
  };

  const handleKeepLocal = async (conflictId: string) => {
    setStatus("Keeping local version...");
    try {
      await window.syncvault?.resolveConflictKeepLocal?.(conflictId);
      await loadConflicts();
      setStatus("Resolved with local version.");
    } catch {
      setStatus("Failed to keep local version.");
    }
  };

  const handleKeepRemote = async (conflictId: string) => {
    setStatus("Keeping remote version...");
    try {
      await window.syncvault?.resolveConflictKeepRemote?.(conflictId);
      await loadConflicts();
      setStatus("Resolved with remote version.");
    } catch {
      setStatus("Failed to keep remote version.");
    }
  };

  return (
    <section className="conflicts">
      <h2>Conflicts</h2>
      {conflicts.length === 0 ? (
        <p className="muted">No conflicts detected.</p>
      ) : (
        <ul className="conflicts__list">
          {conflicts.map((conflict) => (
            <li key={conflict.id} className="conflicts__item">
              <div className="conflicts__path">{conflict.destinationPath}</div>
              <div className="conflicts__meta">
                <span>Status: {conflict.status}</span>
                {conflict.detectedAt && <span>Detected: {conflict.detectedAt}</span>}
              </div>
              <div className="conflicts__actions">
                <button type="button" onClick={() => handleKeepLocal(conflict.id)}>
                  Keep local
                </button>
                <button type="button" onClick={() => handleKeepRemote(conflict.id)}>
                  Keep remote
                </button>
                <button type="button" onClick={() => handleOpen(conflict.localCopyPath)}>
                  Open local copy
                </button>
                <button type="button" onClick={() => handleOpen(conflict.remoteCopyPath)}>
                  Open remote copy
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenDiff(conflict.localCopyPath, conflict.remoteCopyPath)}
                  disabled={!conflict.localCopyPath || !conflict.remoteCopyPath}
                >
                  Open diff
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {status && <p className="conflicts__status">{status}</p>}
    </section>
  );
}
