"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { ObservationTable } from "@/components/medical-observations";
import RecordOwnership from "@/components/record-ownership";
import { ReferenceAudit } from "@/components/reference-audit";
import { Download, FileText, Plus, Search, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import {
  Field,
  LedgerTools,
  actionClass,
  fieldClass,
  messageOf,
  primaryClass,
} from "@/components/ui/ledger-tools";
import { KEYS } from "@/lib/user-data";
import { useLedger } from "@/lib/use-ledger";
import { downloadFile } from "@/lib/download";
import { toCsv } from "@/lib/tabular";
import {
  medicalRecordSchema,
  medicalRecordsCsvRows,
  parseFhirReport,
  validateRecordSet,
  RECORD_METHOD,
  type MedicalRecord,
} from "@/lib/medical-records";

const blank = (): MedicalRecord => ({
  id: "",
  name: "",
  kind: "Visit",
  at: null,
  provider: "",
  sourceUrl: "",
  notes: "",
  checkedAt: null,
  origin: "manual",
  sourceFile: "",
  sourceSha256: "",
  importedAt: null,
  subject: "",
  reportId: "",
  version: "",
  status: "recorded by you",
  observations: [],
  warnings: [],
});
export default function RecordsPage() {
  const records = useLedger(
    KEYS.records,
    "medical-records",
    medicalRecordSchema,
    validateRecordSet,
  );
  const [form, setForm] = useState<MedicalRecord | null>(null),
    [preview, setPreview] = useState<MedicalRecord | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pasted, setPasted] = useState(""),
    [importError, setImportError] = useState(""),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState("All types"),
    [removed, setRemoved] = useState<MedicalRecord | null>(null);
  const fileInput = useRef<HTMLInputElement>(null),
    importRequest = useRef(0);
  function discardImport() {
    importRequest.current++;
    setPreview(null);
    setConfirmed(false);
    setImportError("");
    setPasted("");
    setBusy(false);
  }
  async function previewBytes(
    bytes: Uint8Array,
    filename: string,
    token: number,
    pastedInput = false,
  ) {
    try {
      if (bytes.byteLength > 10 * 1024 * 1024)
        throw new Error("Use JSON under 10 MiB.");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new Uint8Array(bytes).buffer,
      );
      const sha256 = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      const next = parseFhirReport(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
        {
          id: crypto.randomUUID(),
          filename,
          sha256,
          importedAt: new Date().toISOString(),
        },
      );
      if (pastedInput)
        next.warnings.push(
          "Source hash covers UTF-8 pasted text; it may differ from the original file bytes. Keep the original source.",
        );
      validateRecordSet([...records.entries, next]);
      if (token === importRequest.current) setPreview(next);
    } catch (err) {
      if (token === importRequest.current) setImportError(messageOf(err));
    } finally {
      if (token === importRequest.current) setBusy(false);
    }
  }
  const disabled = !records.ready || !!records.error;
  const visible = records.entries
    .filter(
      (r) =>
        (kind === "All types" || r.kind === kind) &&
        `${r.name} ${r.provider} ${r.notes} ${r.observations.map((o) => o.name).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (b.at?.slice(0, 10) || "").localeCompare(a.at?.slice(0, 10) || "") ||
        a.name.localeCompare(b.name),
    );
  const checked = records.entries.filter((r) => r.checkedAt).length;
  function save(record: MedicalRecord) {
    try {
      records.save(record);
      setForm(null);
      discardImport();
      setError("");
    } catch (e) {
      setError(messageOf(e));
    }
  }
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-micro uppercase tracking-widest text-copper-700">
              Symphony AI / Medical records
            </p>
            <h2 className="font-serif text-[30px] sm:text-[36px] leading-tight mt-2">
              A timeline you can trace
            </h2>
            <p className="text-body text-stone-600 mt-3">
              Keep visits and reports together, check their source, and inspect
              the original measurements. Every record starts with your own entry
              or a reviewed structured import.
            </p>
          </div>
          <button
            className={`${primaryClass} self-start`}
            disabled={disabled}
            onClick={() => {
              setForm(blank());
              setError("");
            }}
          >
            <Plus size={16} /> Add a record
          </button>
        </div>
        <Link href="/records/people" className={`${actionClass} mt-5`}>
          Open person notebooks →
        </Link>
        <p className="text-micro text-stone-500 mt-2">
          New person notebooks keep sources in separate stores. Existing records
          and reviewed attributions below stay in this register.
        </p>
        <div className="grid sm:grid-cols-3 gap-3 mt-6">
          {[
            [records.entries.length, "Saved records"],
            [checked, "Checked against source"],
            [
              records.entries.reduce(
                (sum, r) => sum + r.observations.length,
                0,
              ),
              "Linked observations",
            ],
          ].map(([v, label]) => (
            <div
              key={label}
              className="p-4 rounded-xl bg-cream-100 border border-cream-300"
            >
              <p className="font-serif text-[28px] tabular-nums">{v}</p>
              <p className="text-caption text-stone-500">{label}</p>
            </div>
          ))}
        </div>
        <p className="text-micro text-stone-500 mt-4">
          Stored only in this browser, without encryption. Keep original files
          and export backups. This register stores metadata and supported
          fields; it is not a document vault. Source checking is your review,
          not clinical validation.
        </p>
      </Card>
      <RecordOwnership />
      {(error || records.error) && (
        <Card>
          <p role="alert" className="text-caption text-rose-dark">
            {error || records.error}
          </p>
        </Card>
      )}
      {removed && (
        <div
          role="status"
          className="rounded-xl border border-cream-300 bg-white p-4 text-caption flex flex-wrap items-center gap-3"
        >
          Removed {removed.name}.
          <button
            className={actionClass}
            onClick={() => {
              try {
                records.save(removed);
                setRemoved(null);
                setError("");
              } catch (e) {
                setError(messageOf(e));
              }
            }}
          >
            Undo removal
          </button>
        </div>
      )}
      {form && (
        <Card>
          <SectionTitle
            icon={FileText}
            stackOnMobile
            title={form.id ? "Edit record metadata" : "Add a source record"}
            subtitle="Unknown dates and providers can remain blank"
          />
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save({ ...form, id: form.id || crypto.randomUUID() });
            }}
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Record title">
                <input
                  required
                  maxLength={300}
                  className={fieldClass}
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, checkedAt: null, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Record type">
                <select
                  className={fieldClass}
                  value={form.kind}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      checkedAt: null,
                      kind: e.target.value as MedicalRecord["kind"],
                    })
                  }
                >
                  {["Laboratory", "Imaging", "Visit", "Other"].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </Field>
              <Field label="Collection or visit date">
                {form.origin === "manual" ? (
                  <input
                    type="date"
                    className={fieldClass}
                    value={form.at || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        checkedAt: null,
                        at: e.target.value || null,
                      })
                    }
                  />
                ) : (
                  <p className="text-caption pt-3">
                    {form.at || "Unknown"} · source field, read-only
                  </p>
                )}
              </Field>
              <Field label="Provider or facility">
                <input
                  className={fieldClass}
                  maxLength={300}
                  value={form.provider}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      checkedAt: null,
                      provider: e.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Source URL (optional)">
              <input
                type="url"
                className={fieldClass}
                value={form.sourceUrl}
                onChange={(e) =>
                  setForm({
                    ...form,
                    checkedAt: null,
                    sourceUrl: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Your notes">
              <textarea
                className={fieldClass}
                rows={3}
                maxLength={4000}
                value={form.notes}
                onChange={(e) =>
                  setForm({ ...form, checkedAt: null, notes: e.target.value })
                }
              />
            </Field>
            <label className="flex items-start gap-2 text-caption text-stone-600">
              <input
                type="checkbox"
                checked={!!form.checkedAt}
                onChange={(e) =>
                  setForm({
                    ...form,
                    checkedAt: e.target.checked
                      ? new Date().toISOString()
                      : null,
                  })
                }
                className="mt-1 text-copper rounded border-cream-300"
              />
              I checked these metadata fields against the original source.
            </label>
            {form.origin !== "manual" && (
              <p className="text-micro text-stone-500">
                Imported observations, status, collection time and provenance
                remain read-only. An amended clinical result must be imported
                from its source.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                className={primaryClass}
                type="submit"
                disabled={disabled}
              >
                Save record
              </button>
              <button
                className={actionClass}
                type="button"
                onClick={() => setForm(null)}
              >
                Cancel editing
              </button>
            </div>
          </form>
        </Card>
      )}
      <Card>
        <SectionTitle
          icon={Upload}
          stackOnMobile
          title="Bring a structured report"
          subtitle="FHIR R4 subset · one DiagnosticReport and its linked flat numeric or absent observations"
          action={
            <button
              className={actionClass}
              disabled={disabled || busy}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={14} />
              {busy ? "Reading report…" : "Preview FHIR report"}
            </button>
          }
        />
        <p className="text-caption text-stone-600">
          A local JSON Bundle is checked before anything is saved. Review the
          patient reference, statuses, exact values, units and reference
          identity audit. References must resolve inside the file; the app makes
          no network requests and does not merge this report into Blood Work.
        </p>
        <p className="text-micro text-stone-500 mt-3">
          PDFs, images, OCR and general FHIR validation are not supported.
          Components, conditional ranges, withdrawn results and unresolved
          references block import. Keep separate personal workspaces for
          different patient references; a reference is not proof of identity.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          aria-label="FHIR report file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            discardImport();
            const token = importRequest.current;
            setBusy(true);
            try {
              if (file.size > 10 * 1024 * 1024)
                throw new Error("Use JSON under 10 MiB.");
              const bytes = new Uint8Array(await file.arrayBuffer());
              if (token === importRequest.current)
                await previewBytes(bytes, file.name, token);
            } catch (err) {
              if (token === importRequest.current) {
                setImportError(messageOf(err));
                setBusy(false);
              }
            }
          }}
        />
        <details className="mt-4">
          <summary className="cursor-pointer text-caption text-copper-700">
            Paste a FHIR Bundle
          </summary>
          <p className="text-caption text-stone-600 mt-3">
            Paste original source JSON for a local preview. The source hash
            covers the UTF-8 text entered here, saved as pasted-fhir.json; it
            may differ from the original file. Previewing does not save a
            record.
          </p>
          <Field label="FHIR Bundle JSON">
            <textarea
              className={`${fieldClass} min-h-40 font-mono`}
              value={pasted}
              maxLength={10 * 1024 * 1024}
              spellCheck={false}
              autoComplete="off"
              disabled={disabled}
              onChange={(e) => {
                importRequest.current++;
                setPasted(e.target.value);
                setPreview(null);
                setConfirmed(false);
                setImportError("");
                setBusy(false);
              }}
            />
          </Field>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              className={actionClass}
              disabled={disabled || busy || !pasted.trim()}
              onClick={() => {
                const token = ++importRequest.current;
                setPreview(null);
                setConfirmed(false);
                setImportError("");
                setBusy(true);
                void previewBytes(
                  new TextEncoder().encode(pasted),
                  "pasted-fhir.json",
                  token,
                  true,
                );
              }}
            >
              Preview pasted FHIR report
            </button>
            <button className={actionClass} onClick={discardImport}>
              Clear FHIR input
            </button>
          </div>
        </details>
        {importError && (
          <p role="alert" className="text-caption text-rose-dark mt-4">
            {importError}
          </p>
        )}
        {preview && (
          <div className="mt-5 rounded-xl border border-copper/30 bg-copper-50 p-4">
            <h3 className="font-serif text-title">Review before saving</h3>
            <p className="text-caption mt-2 font-medium">
              {preview.name} · {preview.status} · {preview.observations.length}{" "}
              observations
            </p>
            <p className="text-caption text-stone-600 mt-2 break-all">
              Subject: {preview.subject}
            </p>
            <p className="text-caption text-stone-600 mt-1">
              Collection: {preview.at || "Unknown"} ·{" "}
              {preview.provider || "Provider unknown"}
            </p>
            <p className="text-micro text-stone-500 mt-2 break-all">
              {preview.sourceFile} · SHA-256 {preview.sourceSha256}
            </p>
            <ul className="mt-3 space-y-2 text-caption text-stone-600">
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <ReferenceAudit record={preview} />
            {preview.observations.length > 0 && (
              <ObservationTable record={preview} />
            )}
            <label className="flex gap-2 items-start text-caption text-stone-700 mt-4">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 text-copper rounded border-cream-300"
              />
              I checked the subject and fields against the original; this report
              belongs in my personal workspace.
            </label>
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                className={primaryClass}
                disabled={!confirmed || disabled}
                onClick={() =>
                  save({ ...preview, checkedAt: new Date().toISOString() })
                }
              >
                Save reviewed report
              </button>
              <button className={actionClass} onClick={discardImport}>
                Discard preview
              </button>
            </div>
          </div>
        )}
      </Card>
      <Card>
        <SectionTitle
          icon={FileText}
          stackOnMobile
          title="Your record timeline"
          subtitle="Grouped by source calendar date; date-only entries are never assigned an invented time"
          action={
            <button
              className={actionClass}
              disabled={disabled || !records.entries.length}
              onClick={() =>
                downloadFile(
                  "symphony-medical-records.csv",
                  toCsv(medicalRecordsCsvRows(records.entries)),
                  "text/csv",
                )
              }
            >
              <Download size={14} /> Export all-record index CSV
            </button>
          }
        />
        <div className="flex flex-wrap gap-3 mb-5">
          <label className="flex items-center gap-2 flex-1 min-w-[180px] rounded-xl border border-cream-300 px-3">
            <Search size={16} className="text-stone-500" />
            <input
              aria-label="Search medical records"
              placeholder="Search title, provider or observation…"
              className="w-full border-0 bg-transparent text-caption py-3"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Filter medical record type"
            className="rounded-xl border-cream-300 text-caption"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {["All types", "Laboratory", "Imaging", "Visit", "Other"].map(
              (k) => (
                <option key={k}>{k}</option>
              ),
            )}
          </select>
        </div>
        <p role="status" className="text-caption text-stone-500 mb-4">
          {records.ready
            ? `${visible.length} of ${records.entries.length} records`
            : "Loading local records…"}
        </p>
        {!visible.length && (
          <div className="rounded-xl border border-dashed border-cream-400 bg-cream-50 p-6 text-caption text-stone-600">
            {records.entries.length
              ? "No records match your filters."
              : "Your timeline starts here. Add a visit or preview a structured report. No example results or testing recommendations are added to your record."}
          </div>
        )}
        <div className="space-y-4">
          {visible.map((r) => (
            <article
              key={r.id}
              className="rounded-xl border border-cream-300 p-4"
            >
              <div className="flex flex-wrap gap-3 justify-between">
                <div className="min-w-0">
                  <p className="text-micro text-stone-500">
                    {r.at?.slice(0, 10) || "Date unknown"} · {r.kind} ·{" "}
                    {r.origin}
                  </p>
                  <h3 className="font-serif text-title mt-1 break-words">
                    {r.name}
                  </h3>
                  <p className="text-caption text-stone-600 mt-1">
                    {r.provider || "Provider not supplied"} · {r.status}
                  </p>
                </div>
                <span className="text-micro rounded-full bg-cream-100 border border-cream-300 px-3 py-1 h-fit text-copper-700">
                  {r.checkedAt
                    ? "Source checked by you"
                    : "Needs source review"}
                </span>
              </div>
              {r.notes && (
                <p className="text-caption text-stone-600 mt-3 whitespace-pre-wrap break-words">
                  {r.notes}
                </p>
              )}
              <details className="mt-4 border-t border-cream-200 pt-3">
                <summary className="cursor-pointer text-caption text-copper-700">
                  Source details & {r.observations.length} linked observations
                </summary>
                <div className="pt-3 space-y-2 text-caption text-stone-600">
                  <p className="break-all">
                    Collection: {r.at || "Unknown"} · Imported:{" "}
                    {r.importedAt || "Manual entry"}
                  </p>
                  {r.sourceFile && (
                    <p className="break-all">
                      Source: {r.sourceFile} · SHA-256 {r.sourceSha256}
                    </p>
                  )}
                  {r.subject && (
                    <p className="break-all">
                      Subject: {r.subject} · Report: {r.reportId} · Version:{" "}
                      {r.version || "Not supplied"}
                    </p>
                  )}
                  {r.sourceUrl && (
                    <a
                      className="text-copper-700 underline break-all"
                      href={r.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open source reference
                    </a>
                  )}
                  {r.warnings.map((w) => (
                    <p key={w} className="text-micro text-stone-500">
                      {w}
                    </p>
                  ))}
                </div>
                <ReferenceAudit record={r} />
                {r.observations.length > 0 && <ObservationTable record={r} />}
              </details>
              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  className={actionClass}
                  disabled={disabled}
                  onClick={() => {
                    setForm(r);
                    setError("");
                  }}
                >
                  Edit metadata
                </button>
                <button
                  className={actionClass}
                  disabled={disabled}
                  onClick={() => {
                    try {
                      setRemoved(records.remove(r.id) || null);
                      setError("");
                    } catch (e) {
                      setError(messageOf(e));
                    }
                  }}
                >
                  Remove record
                </button>
              </div>
            </article>
          ))}
        </div>
      </Card>
      <Card>
        <SectionTitle
          title="Keep a portable copy"
          subtitle="All-record backup: JSON retains every source and observation projection; CSV contains all source metadata. Attribution entries have a separate backup above."
        />
        <LedgerTools
          kind="medical-records"
          storageKey={KEYS.records}
          schema={medicalRecordSchema}
          stored={records.stored}
          onRestore={records.restore}
          disabled={!records.ready}
          summarize={(r) =>
            `${r.at || "Date unknown"} · ${r.provider || "Provider unknown"} · ${r.observations.length} observations`
          }
        />
        <p className="mt-4 text-micro text-stone-500">
          Method: {RECORD_METHOD}. Values and source reference ranges are
          transcribed fields; no diagnosis, normal/abnormal classification,
          genetic testing schedule or hospital ranking is inferred.{" "}
          <Link href="/reports" className="underline text-copper-700">
            Full personal report
          </Link>{" "}
          ·{" "}
          <Link href="/research#records" className="underline text-copper-700">
            Methods & references
          </Link>
        </p>
      </Card>
    </div>
  );
}
