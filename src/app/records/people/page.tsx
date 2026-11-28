"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Download, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import {
  Field,
  actionClass,
  primaryClass,
  fieldClass,
  messageOf,
} from "@/components/ui/ledger-tools";
import { ReferenceAudit } from "@/components/reference-audit";
import { ObservationTable } from "@/components/medical-observations";
import { useLedger } from "@/lib/use-ledger";
import { KEYS } from "@/lib/user-data";
import { downloadFile } from "@/lib/download";
import {
  familyProfileSchema,
  validateFamilyProfiles,
  type FamilyProfile,
} from "@/lib/family-history";
import { parseFhirReport, type MedicalRecord } from "@/lib/medical-records";
import {
  personNotebookKey,
  notebookIdentity,
  parsePersonNotebook,
  reviewNotebookOwner,
  notebookIsCurrent,
  appendNotebookSource,
  assertNotebookSnapshot,
  commitPersonNotebook,
  type PersonNotebook,
  type NotebookSnapshot,
} from "@/lib/person-medical";

function rawBackup(personId: string) {
  try {
    const raw = localStorage.getItem(personNotebookKey(personId));
    if (raw === null)
      throw new Error(
        "There is no saved notebook to recover for this profile ID.",
      );
    downloadFile(
      "symphony-person-notebook-recovery.json",
      raw,
      "application/json",
    );
    return "Raw notebook downloaded. It may contain identifiers; keep it private.";
  } catch (e) {
    return messageOf(e);
  }
}

export default function PersonRecordsPage() {
  const family = useLedger(
    KEYS.family,
    "family-profiles",
    familyProfileSchema,
    validateFamilyProfiles,
  );
  const [selected, setSelected] = useState(""),
    [notice, setNotice] = useState("");
  const person = family.entries.find((p) => p.id === selected);
  return (
    <div className="space-y-6">
      <Card>
        <p className="text-micro uppercase tracking-widest text-copper-700">
          Symphony AI / Medical records
        </p>
        <h2 className="font-serif text-[30px] sm:text-[36px] leading-tight mt-2">
          One person. One source notebook.
        </h2>
        <p className="text-body text-stone-600 mt-3 max-w-2xl">
          Choose a Family Hub profile, review its identity, then collect source
          reports in a separate notebook. Original units, missing results and
          reference links stay visible.
        </p>
        <div className="flex flex-wrap gap-2 mt-5">
          <Link href="/records" className={actionClass}>
            Source register
          </Link>
          <Link href="/family" className={actionClass}>
            Family Hub
          </Link>
        </div>
        <p className="text-micro text-stone-500 mt-4">
          Local, unencrypted browser storage. Profiles are dataset labels, not
          accounts or access control. New notebooks are excluded from the
          default personal report. Existing source-register records are not
          copied or moved.
        </p>
      </Card>
      <Card>
        <SectionTitle
          icon={BookOpen}
          title="Choose the notebook owner"
          subtitle="No profile is selected automatically."
        />
        <Field label="Family Hub profile">
          <select
            className={fieldClass}
            disabled={!family.ready || !!family.error}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setNotice("");
            }}
          >
            <option value="">Choose a person…</option>
            {selected && !person && (
              <option value={selected}>Selected profile unavailable</option>
            )}
            {family.entries.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.birthYear ?? "birth year unknown"}
              </option>
            ))}
          </select>
        </Field>
        {family.error && (
          <p role="alert" className="text-caption text-red-700 mt-3">
            {family.error}
          </p>
        )}
        {family.ready && !family.error && !family.entries.length && (
          <p className="text-caption text-stone-500 mt-3">
            Add a source-documented profile in Family Hub first. No demo
            profiles are inserted here.
          </p>
        )}
        {selected && !person && (
          <div className="mt-4">
            <p className="text-caption text-stone-600">
              The profile is unavailable. Its notebook has not been deleted.
              Restore the matching Family Hub profile to resume.
            </p>
            <button
              className={`${actionClass} mt-3`}
              onClick={() => setNotice(rawBackup(selected))}
            >
              Download raw recovery backup
            </button>
          </div>
        )}
        {notice && (
          <p role="status" className="text-caption mt-3">
            {notice}
          </p>
        )}
      </Card>
      {family.ready && !family.error && person && (
        <Notebook
          key={`${person.id}:${notebookIdentity(person)}`}
          person={person}
        />
      )}
      <p className="text-micro text-stone-500">
        Experimental source organization. No diagnoses, normality
        classifications, risk estimates or automated patient matching.{" "}
        <Link href="/research" className="underline">
          Methods and references
        </Link>
      </p>
    </div>
  );
}

function Notebook({ person }: { person: FamilyProfile }) {
  const [state, setState] = useState<{
    ready: boolean;
    raw: string | null;
    notebook: PersonNotebook | null;
    error: string;
  }>({ ready: false, raw: null, notebook: null, error: "" });
  const [basis, setBasis] = useState(""),
    [ownerAck, setOwnerAck] = useState(false),
    [input, setInput] = useState(""),
    [preview, setPreview] = useState<{
      record: MedicalRecord;
      snapshot: NotebookSnapshot;
    } | null>(null),
    [sourceAck, setSourceAck] = useState(false),
    [backupText, setBackupText] = useState(""),
    [restore, setRestore] = useState<{
      notebook: PersonNotebook;
      snapshot: NotebookSnapshot;
    } | null>(null),
    [restoreAck, setRestoreAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [removed, setRemoved] = useState<MedicalRecord | null>(null);
  const request = useRef(0),
    mounted = useRef(true);
  const [feedbackArea, setFeedbackArea] = useState("owner");
  const identity = notebookIdentity(person),
    key = personNotebookKey(person.id);
  useEffect(() => {
    mounted.current = true;
    let generation = 0;
    const load = async () => {
      const token = ++generation;
      request.current++;
      setPreview(null);
      setRestore(null);
      setSourceAck(false);
      setRestoreAck(false);
      setOwnerAck(false);
      setRemoved(null);
      setBusy(false);
      let raw: string | null = null;
      setState((s) => ({ ...s, ready: false }));
      try {
        raw = localStorage.getItem(key);
        const notebook =
          raw === null
            ? null
            : await parsePersonNotebook(JSON.parse(raw), person.id);
        if (mounted.current && token === generation)
          setState({ ready: true, raw, notebook, error: "" });
      } catch (e) {
        if (mounted.current && token === generation)
          setState({
            ready: true,
            raw,
            notebook: null,
            error: `Saved notebook could not be validated. Ordinary edits and exports are held; preserve a raw recovery backup. ${messageOf(e)}`,
          });
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === KEYS.family || event.key === null)
        void load();
    };
    void load();
    window.addEventListener("storage", onStorage);
    window.addEventListener("symphony:data", load);
    return () => {
      mounted.current = false;
      generation++;
      request.current++;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("symphony:data", load);
    };
  }, [key, person.id]);
  const notebook = state.notebook,
    current = !!notebook && notebookIsCurrent(notebook, person),
    disabled = busy || !state.ready,
    snapshot = (): NotebookSnapshot => ({ raw: state.raw, identity });
  function invalidate() {
    request.current++;
    setPreview(null);
    setRestore(null);
    setSourceAck(false);
    setRestoreAck(false);
    setError("");
    setNotice("");
    setBusy(false);
  }
  async function save(value: PersonNotebook, expected: NotebookSnapshot) {
    const next = await commitPersonNotebook(
      localStorage,
      person.id,
      expected,
      value,
      () => mounted.current,
    );
    if (!mounted.current) return;
    setState({
      ready: true,
      raw: JSON.stringify(next),
      notebook: next,
      error: "",
    });
    window.dispatchEvent(new Event("symphony:data"));
  }
  async function run(action: () => Promise<void>, area = "owner") {
    setFeedbackArea(area);
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await action();
    } catch (e) {
      if (mounted.current) setError(messageOf(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function previewSource() {
    invalidate();
    const token = ++request.current,
      expected = snapshot(),
      text = input;
    await run(async () => {
      if (!notebook || !current || state.error)
        throw new Error("Review the notebook owner before importing.");
      const bytes = new TextEncoder().encode(text);
      if (bytes.byteLength > 10 * 1024 * 1024)
        throw new Error("Use pasted JSON under 10 MiB.");
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const sha256 = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      const record = parseFhirReport(JSON.parse(text), {
        id: crypto.randomUUID(),
        filename: "pasted-fhir.json",
        sha256,
        importedAt: new Date().toISOString(),
      });
      record.warnings.push(
        "Source hash covers UTF-8 pasted text; it may differ from original file bytes. Keep the original source.",
      );
      await parsePersonNotebook(
        appendNotebookSource(notebook, record),
        person.id,
      );
      assertNotebookSnapshot(localStorage, person.id, expected);
      if (mounted.current && token === request.current)
        setPreview({ record, snapshot: expected });
    }, "source");
  }
  const feedback = (area: string) =>
    feedbackArea === area && (
      <>
        {error && (
          <p role="alert" className="text-caption text-red-700 mt-4">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-caption text-stone-600 mt-4">
            {notice}
          </p>
        )}
      </>
    );
  return (
    <>
      <Card accent>
        <SectionTitle
          icon={BookOpen}
          title={person.name}
          subtitle="Selected person notebook · separate source store"
          stackOnMobile
          action={
            <button
              className={actionClass}
              disabled={disabled || !current || !!state.error}
              onClick={() =>
                run(async () => {
                  const expected = snapshot();
                  assertNotebookSnapshot(localStorage, person.id, expected);
                  const checked = await parsePersonNotebook(
                    notebook,
                    person.id,
                  );
                  if (!mounted.current) return;
                  if (!notebookIsCurrent(checked, person))
                    throw new Error(
                      "Review the current identity before exporting.",
                    );
                  assertNotebookSnapshot(localStorage, person.id, expected);
                  downloadFile(
                    "symphony-person-notebook.json",
                    JSON.stringify(checked, null, 2),
                    "application/json",
                  );
                  setNotice(
                    "Selected notebook downloaded. This backup contains source identifiers; keep it private.",
                  );
                })
              }
            >
              <Download size={14} /> Download notebook
            </button>
          }
        />
        <div className="grid !grid-cols-3 gap-2">
          {[
            [state.error ? "—" : (notebook?.entries.length ?? 0), "Sources"],
            [
              state.error
                ? "—"
                : (notebook?.entries.reduce(
                    (n, r) => n + r.observations.length,
                    0,
                  ) ?? 0),
              "Observations",
            ],
            [
              state.error
                ? "Held"
                : !notebook
                  ? "New"
                  : current
                    ? "Current"
                    : "Held",
              "Identity review",
            ],
          ].map(([n, label]) => (
            <div
              key={label}
              className="rounded-xl border border-cream-300 bg-cream-100 p-3"
            >
              <p
                className={`font-serif ${label === "Identity review" ? "text-[16px] sm:text-[24px] whitespace-nowrap" : "text-[22px] sm:text-[28px]"}`}
              >
                {n}
              </p>
              <p className="text-micro text-stone-500">{label}</p>
            </div>
          ))}
        </div>
        {state.error && (
          <p role="alert" className="text-caption text-red-700 mt-4">
            {state.error}
          </p>
        )}
        {notebook && !current && (
          <p role="alert" className="text-caption text-amber-800 mt-4">
            The profile identity changed since review. Imports and ordinary
            exports are held. Check the saved identity and sources before
            explicitly renewing the review.
          </p>
        )}
        {notebook && (
          <details className="text-caption mt-4">
            <summary className="cursor-pointer text-copper-700">
              Saved identity review
            </summary>
            <dl className="space-y-2 mt-3 break-words">
              <div>
                <dt className="text-stone-500">Reviewed profile</dt>
                <dd>
                  {notebook.owner.identity.name} ·{" "}
                  {notebook.owner.identity.birthYear ?? "birth year unknown"} ·{" "}
                  {notebook.owner.identity.lifeStatus}
                </dd>
              </div>
              <div>
                <dt className="text-stone-500">Identity source</dt>
                <dd>{notebook.owner.identity.source}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Your basis</dt>
                <dd>{notebook.owner.basis}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Reviewed at</dt>
                <dd>{notebook.owner.reviewedAt}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Change fingerprint</dt>
                <dd className="break-all font-mono text-micro">
                  {notebook.owner.digest}
                </dd>
              </div>
            </dl>
          </details>
        )}
        {!state.error && state.ready && (
          <details open={!current} className="mt-5 text-caption">
            <summary className="cursor-pointer font-medium">
              {notebook
                ? "Renew the identity review"
                : "Open this person's notebook"}
            </summary>
            <p className="text-stone-500 mt-3">
              Current profile: {person.name} ·{" "}
              {person.birthYear ?? "birth year unknown"} · {person.lifeStatus}.
              Identity source: {person.source}. This is your declared
              attribution; a matching name or fingerprint does not verify a
              patient.
            </p>
            <div className="mt-3">
              <Field label="Identity review basis">
                <textarea
                  className={fieldClass}
                  maxLength={4000}
                  rows={3}
                  value={basis}
                  onChange={(e) => {
                    setBasis(e.target.value);
                    setOwnerAck(false);
                  }}
                  placeholder="How did you establish that these sources belong to this profile?"
                />
              </Field>
            </div>
            <label className="flex items-start gap-2 mt-3">
              <input
                className="mt-1"
                type="checkbox"
                checked={ownerAck}
                onChange={(e) => setOwnerAck(e.target.checked)}
              />
              I reviewed this profile and the attribution basis. Renewing a
              review preserves the existing sources; it does not verify their
              clinical identity.
            </label>
            <button
              className={`${primaryClass} mt-4`}
              disabled={disabled || !ownerAck || !basis.trim()}
              onClick={() =>
                run(async () => {
                  const expected = snapshot(),
                    next = await reviewNotebookOwner(person, basis, notebook);
                  if (!mounted.current) return;
                  await save(next, expected);
                  setOwnerAck(false);
                  setBasis("");
                  setNotice("Identity review saved for this notebook only.");
                })
              }
            >
              {notebook
                ? "Save renewed identity review"
                : "Create separate notebook"}
            </button>
          </details>
        )}
        {state.raw !== null && (
          <button
            className={`${actionClass} mt-5`}
            onClick={() => {
              setFeedbackArea("owner");
              setNotice(rawBackup(person.id));
            }}
          >
            Download raw recovery backup
          </button>
        )}
        {feedback("owner")}
      </Card>
      <Card>
        <SectionTitle
          icon={FileText}
          title="Review a source report"
          subtitle="One supported FHIR R4 report per Bundle. Nothing is uploaded."
        />
        <p className="text-caption text-stone-500 mb-4">
          Paste a local HL7® FHIR® R4 JSON Bundle. Check its Patient reference
          against the selected person yourself. One exact source Patient
          reference is allowed within each notebook; different source systems
          are held for future namespace review. The source hash covers the
          pasted UTF-8 text.
        </p>
        <Field label="FHIR Bundle JSON">
          <textarea
            className={`${fieldClass} font-mono text-micro`}
            rows={5}
            maxLength={10 * 1024 * 1024}
            value={input}
            disabled={!current || !!state.error || disabled}
            onChange={(e) => {
              invalidate();
              setInput(e.target.value);
            }}
            placeholder="Paste a single-report Bundle…"
          />
        </Field>
        <button
          className={`${actionClass} mt-3`}
          disabled={disabled || !current || !!state.error || !input.trim()}
          onClick={previewSource}
        >
          Preview source for {person.name}
        </button>
        {preview && (
          <div className="rounded-xl border border-copper/30 bg-cream-50 p-4 mt-4">
            <h3 className="font-serif text-[20px]">{preview.record.name}</h3>
            <p className="text-caption text-stone-500 mt-1">
              {preview.record.status} · {preview.record.observations.length}{" "}
              observations · {preview.record.at || "Clinical date unknown"}
            </p>
            <p className="text-caption mt-3 break-all">
              Source Patient: {preview.record.subject}
            </p>
            <p className="text-micro text-stone-500 mt-2 break-all">
              Pasted text SHA-256: {preview.record.sourceSha256}
            </p>
            <ObservationTable record={preview.record} />
            <ReferenceAudit record={preview.record} />
            <label className="flex items-start gap-2 text-caption mt-4">
              <input
                type="checkbox"
                className="mt-1"
                checked={sourceAck}
                onChange={(e) => setSourceAck(e.target.checked)}
              />
              I checked this source Patient against {person.name}, reviewed the
              values and want to save it only in this notebook.
            </label>
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                className={primaryClass}
                disabled={disabled || !sourceAck}
                onClick={() =>
                  run(async () => {
                    if (!notebook) return;
                    await save(
                      appendNotebookSource(notebook, preview.record),
                      preview.snapshot,
                    );
                    setInput("");
                    setPreview(null);
                    setSourceAck(false);
                    setNotice(
                      "Source saved only in the selected person's notebook.",
                    );
                  }, "source")
                }
              >
                Save reviewed source
              </button>
              <button
                className={actionClass}
                disabled={busy}
                onClick={invalidate}
              >
                Discard source preview
              </button>
            </div>
          </div>
        )}
        {feedback("source")}
      </Card>
      {notebook && !state.error && (
        <Card>
          <SectionTitle
            title="Notebook sources"
            subtitle="Saved source values are preserved. Missing measurements are not negative findings."
          />
          {!notebook.entries.length && (
            <p className="text-caption text-stone-500">
              No sources saved for this person. Other notebooks and the source
              register are separate.
            </p>
          )}
          {notebook.entries.map((record) => (
            <details key={record.id} className="border-t border-cream-300 py-4">
              <summary className="cursor-pointer font-serif text-[18px]">
                {record.name}{" "}
                <span className="font-sans text-micro text-stone-500">
                  · {record.at || "date unknown"}
                </span>
              </summary>
              <p className="text-caption text-stone-500 mt-3">
                {record.provider || "Provider not supplied"} · {record.status}
              </p>
              <p className="text-micro mt-2 break-all">
                Source Patient: {record.subject || "Not supplied"}
              </p>
              <p className="text-micro text-stone-500 mt-2 break-all">
                {record.sourceFile} · SHA-256 {record.sourceSha256}
              </p>
              <ObservationTable record={record} />
              <ReferenceAudit record={record} />
              {record.warnings.map((w, i) => (
                <p key={i} className="text-micro text-amber-800 mt-2">
                  {w}
                </p>
              ))}
              <button
                className={`${actionClass} mt-4`}
                disabled={disabled || !current}
                onClick={() =>
                  run(async () => {
                    const expected = snapshot();
                    await save(
                      {
                        ...notebook,
                        updatedAt: new Date().toISOString(),
                        entries: notebook.entries.filter(
                          (r) => r.id !== record.id,
                        ),
                      },
                      expected,
                    );
                    setRemoved(record);
                    setNotice(
                      "Source removed from this notebook. Undo is available until the next refresh.",
                    );
                  })
                }
              >
                Remove source
              </button>
            </details>
          ))}
          {removed && (
            <button
              className={actionClass}
              disabled={disabled || !current}
              onClick={() =>
                run(async () => {
                  await save(
                    appendNotebookSource(notebook, removed),
                    snapshot(),
                  );
                  setRemoved(null);
                  setNotice("Source restored in this notebook.");
                })
              }
            >
              Undo source removal
            </button>
          )}
        </Card>
      )}
      <Card>
        <SectionTitle
          title="Restore this notebook"
          subtitle="Review a Symphony AI person-notebook backup before replacing this person's store."
        />
        <p className="text-caption text-stone-500 mb-4">
          The original profile ID and reviewed identity must match.
          Source-register ledgers and other people's backups are rejected.
          Restore the matching Family Hub identity first if needed. This
          replacement never changes another notebook.
        </p>
        <Field label="Notebook backup JSON">
          <textarea
            className={`${fieldClass} font-mono text-micro`}
            rows={4}
            maxLength={30 * 1024 * 1024}
            value={backupText}
            disabled={disabled}
            onChange={(e) => {
              invalidate();
              setBackupText(e.target.value);
            }}
          />
        </Field>
        <button
          className={`${actionClass} mt-3`}
          disabled={disabled || !backupText.trim()}
          onClick={() => {
            invalidate();
            const token = ++request.current,
              expected = snapshot(),
              text = backupText;
            void run(async () => {
              if (new TextEncoder().encode(text).byteLength > 30 * 1024 * 1024)
                throw new Error("Use a backup under 30 MiB.");
              const next = await parsePersonNotebook(
                JSON.parse(text),
                person.id,
              );
              if (!notebookIsCurrent(next, person))
                throw new Error(
                  "Backup identity review differs from the current profile. Restore its matching Family Hub identity first.",
                );
              assertNotebookSnapshot(localStorage, person.id, expected);
              if (mounted.current && token === request.current)
                setRestore({ notebook: next, snapshot: expected });
            }, "restore");
          }}
        >
          Preview notebook backup
        </button>
        {restore && (
          <div className="rounded-xl border border-copper/30 bg-cream-50 p-4 mt-4">
            <p className="text-caption">
              Replace only {person.name}'s notebook:{" "}
              {state.error ? "unreadable" : (notebook?.entries.length ?? 0)}{" "}
              saved sources → {restore.notebook.entries.length} backup sources.
              Identity reviewed {restore.notebook.owner.reviewedAt}.
            </p>
            <label className="flex items-start gap-2 text-caption mt-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={restoreAck}
                onChange={(e) => setRestoreAck(e.target.checked)}
              />
              I reviewed the owner and source count and want to replace only
              this notebook.
            </label>
            <button
              className={`${primaryClass} mt-4`}
              disabled={disabled || !restoreAck}
              onClick={() =>
                run(async () => {
                  await save(restore.notebook, restore.snapshot);
                  setRestore(null);
                  setRestoreAck(false);
                  setBackupText("");
                  setNotice("Reviewed backup restored to this notebook only.");
                }, "restore")
              }
            >
              Replace selected notebook
            </button>
          </div>
        )}
        {feedback("restore")}
      </Card>
    </>
  );
}
