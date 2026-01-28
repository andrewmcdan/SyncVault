import { useEffect, useState } from "react";
import type { LogEntry } from "@shared/types";

export default function LogsPage(): JSX.Element {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    let unsubscribe = () => {};
    window.syncvault?.getLogs?.().then(setEntries).catch(() => {});
    if (window.syncvault?.onLog) {
      unsubscribe = window.syncvault.onLog((entry) => {
        setEntries((prev) => [entry, ...prev]);
      });
    }
    return () => unsubscribe();
  }, []);

  return (
    <section>
      <h2>Logs</h2>
      {entries.length === 0 ? (
        <p className="muted">No logs yet.</p>
      ) : (
        <ul className="logs">
          {entries.map((entry) => (
            <li key={entry.id} className={`logs__item logs__item--${entry.level}`}>
              <span className="logs__timestamp">{entry.timestamp}</span>
              <span className="logs__message">{entry.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
