"use client";
import { useRef, useState } from "react";
import { z } from "zod";
import { Download, Upload } from "lucide-react";
import { downloadFile } from "@/lib/download";
import { parseLedger, type Ledger } from "@/lib/personal-ledgers";
export const actionClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-cream-300 bg-white px-3 py-2 text-caption font-medium text-stone-700 hover:border-copper disabled:opacity-40";
export const primaryClass = `${actionClass} !bg-copper !text-white`;
export const fieldClass =
  "mt-1 w-full rounded-xl border-cream-300 bg-white text-caption";
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-caption text-stone-600">
      {label}
      {children}
    </label>
  );
}
export function messageOf(error: unknown) {
  return error instanceof z.ZodError
    ? error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(" / ")}: ${issue.message}`)
        .join(" ")
    : error instanceof Error
      ? error.message
      : "Unable to save. Browser storage may be unavailable or full.";
}

export function LedgerTools<T extends { name: string }>({
  kind,
  storageKey,
  schema,
  stored,
  onRestore,
  disabled,
  exportDisabled,
  summarize,
  validateEntries,
}: {
  kind: string;
  storageKey: string;
  schema: z.ZodType<T>;
  stored: Ledger<T> | null;
  onRestore: (value: unknown) => void;
  disabled?: boolean;
  exportDisabled?: boolean;
  summarize: (entry: T) => string;
  validateEntries?: (entries: T[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [preview, setPreview] = useState<Ledger<T> | null>(null),
    [error, setError] = useState(""),
    [pasted, setPasted] = useState("");
  function reviewText(text: string) {
    setError("");
    setPreview(null);
    try {
      if (new Blob([text]).size > 30 * 1024 * 1024)
        throw new Error("Use a backup under 30 MB.");
      const next = parseLedger(JSON.parse(text), kind, schema);
      validateEntries?.(next.entries);
      setPreview(next);
    } catch (error) {
      setError(messageOf(error));
    }
  }
  function clearReview() {
    request.current++;
    setPasted("");
    setPreview(null);
    setError("");
  }
  return (
    <div className="no-print space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          className={actionClass}
          onClick={() =>
            downloadFile(
              `symphony-${kind}-backup.json`,
              JSON.stringify(
                stored || {
                  format: "symphony-ledger-v1",
                  kind,
                  updatedAt: new Date().toISOString(),
                  entries: [],
                },
                null,
                2,
              ),
              "application/json",
            )
          }
          disabled={disabled || exportDisabled}
        >
          <Download size={13} />
          Export JSON backup
        </button>
        <button
          className={actionClass}
          onClick={() => input.current?.click()}
          disabled={disabled}
        >
          <Upload size={13} />
          Import JSON backup
        </button>
        <button
          className={actionClass}
          onClick={() => {
            try {
              downloadFile(
                `symphony-${kind}-raw-backup.txt`,
                window.localStorage.getItem(storageKey) || "No saved dataset",
              );
            } catch (error) {
              setError(messageOf(error));
            }
          }}
        >
          Raw backup
        </button>
        <input
          ref={input}
          className="sr-only"
          aria-label={`Import ${kind} backup`}
          type="file"
          accept=".json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            clearReview();
            const token = request.current;
            try {
              if (file.size > 30 * 1024 * 1024)
                throw new Error("Use a backup under 30 MB.");
              const text = await file.text();
              if (token === request.current) reviewText(text);
            } catch (error) {
              if (token === request.current) setError(messageOf(error));
            }
          }}
        />
      </div>
      <details>
        <summary className="cursor-pointer text-caption text-copper-700">
          Paste JSON backup
        </summary>
        <p className="text-caption text-stone-600 mt-3">
          Paste a backup for this module when a file picker is unavailable.
          Previewing does not change saved records. Review the contents and
          replacement scope before confirming; JSON is processed locally.
        </p>
        <Field label={`Paste ${kind} backup JSON`}>
          <textarea
            className={`${fieldClass} min-h-32 font-mono`}
            value={pasted}
            maxLength={30 * 1024 * 1024}
            spellCheck={false}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => {
              request.current++;
              setPasted(event.target.value);
              setPreview(null);
              setError("");
            }}
          />
        </Field>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            className={actionClass}
            disabled={disabled || !pasted.trim()}
            onClick={() => {
              request.current++;
              reviewText(pasted);
            }}
          >
            Preview pasted backup
          </button>
          <button className={actionClass} onClick={clearReview}>
            Clear pasted JSON
          </button>
        </div>
      </details>
      {error && (
        <p role="alert" className="text-caption text-rose-dark">
          {error}
        </p>
      )}
      {preview && (
        <div className="rounded-xl border border-copper/30 bg-copper-50 p-4 text-caption">
          <p>
            Review: {preview.entries.length} {kind} records from a backup saved{" "}
            {new Date(preview.updatedAt).toLocaleString()}. Replacing this
            ledger removes its current records; export a backup first.
          </p>
          <ul className="mt-3 max-h-64 overflow-y-auto space-y-2">
            {preview.entries.slice(0, 10).map((entry, index) => (
              <li key={index} className="rounded-lg bg-white p-3">
                <strong className="font-medium">{entry.name}</strong>
                <p className="text-stone-500 mt-1">{summarize(entry)}</p>
              </li>
            ))}
          </ul>
          {preview.entries.length > 10 && (
            <p className="text-micro text-stone-500 mt-2">
              Showing the first 10 of {preview.entries.length} records.
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button
              className={primaryClass}
              onClick={() => {
                try {
                  onRestore(preview);
                  clearReview();
                } catch (error) {
                  setError(messageOf(error));
                }
              }}
            >
              Replace with reviewed backup
            </button>
            <button className={actionClass} onClick={clearReview}>
              Cancel restore
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
