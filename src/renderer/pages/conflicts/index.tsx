import { useEffect, useState } from "react";
import type { ConflictListItem } from "@shared/types";

export default function ConflictsPage(): JSX.Element {
  const [conflicts, setConflicts] = useState<ConflictListItem[]>([]);
  const [status, setStatus] = useState("");

  const loadConflicts = async () => {
    const items = await window.syncvault?.listConflicts?.();
    setConflicts(items ?? []);
  };

  useEffect(() => {
    void loadConflicts();
  }, []);

  const handleOpen = async (filePath: string | null) => {
    if (!filePath) return;
    await window.syncvault?.openPath?.(filePath);
  };

  const handleResolve = async (conflictId: string) => {
    setStatus("Resolving...");
    await window.syncvault?.resolveConflict?.(conflictId);
    await loadConflicts();
    setStatus("Resolved.");
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
                <button type="button" onClick={() => handleOpen(conflict.localCopyPath)}>
                  Open local copy
                </button>
                <button type="button" onClick={() => handleOpen(conflict.remoteCopyPath)}>
                  Open remote copy
                </button>
                <button type="button" onClick={() => handleResolve(conflict.id)}>
                  Mark resolved
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
