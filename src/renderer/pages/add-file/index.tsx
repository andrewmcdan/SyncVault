import { useMemo, useState } from "react";
import type { AddFilePreviewLine } from "@shared/types";

interface PreviewState {
  filePath: string;
  lines: AddFilePreviewLine[];
  suggestedSecretKeys: string[];
}

export default function AddFilePage(): JSX.Element {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<string>("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  const secretKeys = useMemo(() => {
    if (!preview) return [];
    const keys = new Set<string>();
    for (const line of preview.lines) {
      if (selected.has(line.index) && line.key) {
        keys.add(line.key);
      }
    }
    return Array.from(keys);
  }, [preview, selected]);

  const handlePickFile = async () => {
    setStatus("");
    setWarnings([]);
    setIsBusy(true);
    try {
      if (!window.syncvault?.pickAddFile) {
        setStatus("IPC bridge not available.");
        return;
      }
      const filePath = await window.syncvault?.pickAddFile?.();
      if (!filePath) {
        setIsBusy(false);
        return;
      }
      const result = await window.syncvault?.previewAddFile?.(filePath);
      if (result) {
        setPreview(result);
        const initial = new Set<number>();
        for (const line of result.lines) {
          if (line.key && result.suggestedSecretKeys.includes(line.key)) {
            initial.add(line.index);
          }
        }
        setSelected(initial);
      }
    } catch (error) {
      setStatus("Failed to load preview.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleLine = (line: AddFilePreviewLine) => {
    if (line.type !== "kv") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(line.index)) {
        next.delete(line.index);
      } else {
        next.add(line.index);
      }
      return next;
    });
  };

  const handleCommit = async () => {
    if (!preview) return;
    setIsBusy(true);
    setStatus("Adding file…");
    setWarnings([]);
    try {
      const result = await window.syncvault?.commitAddFile?.({
        filePath: preview.filePath,
        secretKeys
      });
      if (result && typeof result === "object" && "warnings" in result) {
        const warningsList = (result as { warnings?: string[] }).warnings ?? [];
        setWarnings(warningsList);
      }
      setStatus("File added.");
    } catch (error) {
      setStatus("Failed to add file.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="add-file">
      <div className="add-file__header">
        <h2>Add file</h2>
        <button type="button" onClick={handlePickFile} disabled={isBusy}>
          Choose file
        </button>
      </div>

      {!preview ? (
        <>
          <p className="muted">Select a .env file to preview and mark secrets.</p>
          {status && <p className="add-file__status">{status}</p>}
        </>
      ) : (
        <>
          <div className="add-file__meta">
            <span className="add-file__path">{preview.filePath}</span>
            <span className="add-file__count">
              {secretKeys.length} secret{secretKeys.length === 1 ? "" : "s"} selected
            </span>
          </div>
          <div className="add-file__viewer" role="list">
            {preview.lines.map((line) => {
              const isSecret = selected.has(line.index);
              const isSelectable = line.type === "kv";
              return (
                <button
                  key={`${line.index}-${line.raw}`}
                  type="button"
                  role="listitem"
                  className={`add-file__line ${isSelectable ? "is-selectable" : ""} ${
                    isSecret ? "is-secret" : ""
                  }`}
                  onClick={() => handleToggleLine(line)}
                  disabled={!isSelectable || isBusy}
                >
                  <span className="add-file__line-number">{line.index + 1}</span>
                  <span className="add-file__line-content">{line.raw || " "}</span>
                </button>
              );
            })}
          </div>
          <div className="add-file__footer">
            <button type="button" onClick={handleCommit} disabled={isBusy}>
              Confirm &amp; add
            </button>
            {status && <span className="add-file__status">{status}</span>}
          </div>
          {warnings.length > 0 && (
            <div className="add-file__warnings">
              {warnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
