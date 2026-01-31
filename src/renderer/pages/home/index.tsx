import { useEffect, useState } from "react";
import type { SyncStatus } from "@shared/types";

export default function HomePage(): JSX.Element {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};
    window.syncvault?.getStatus?.().then(setStatus).catch(() => {});
    if (window.syncvault?.onStatus) {
      unsubscribe = window.syncvault.onStatus(setStatus);
    }
    return () => unsubscribe();
  }, []);
  return (
    <section>
      {status ? (
        <div>
          <div className="status-pill">Status: {status.state} · {status.message}</div>
          <div className="muted" style={{ fontSize: "12px" }}>
            Updated {new Date(status.updatedAt).toLocaleString()}
          </div>
        </div>
      ) : (
        <div className="status-pill status-pill--idle">Status: connecting...</div>
      )}
      <h2>Getting started</h2>
      <ol>
        <li>Open the tray menu.</li>
        <li>Add a file from clipboard or browse.</li>
        <li>Select secret keys and sync.</li>
      </ol>
    </section>
  );
}
