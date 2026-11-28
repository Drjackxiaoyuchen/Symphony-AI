"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Users, BookOpen, Download, Plus, GitBranch } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import {
  Field,
  LedgerTools,
  actionClass,
  primaryClass,
  fieldClass,
  messageOf,
} from "@/components/ui/ledger-tools";
import { KEYS } from "@/lib/user-data";
import { useLedger } from "@/lib/use-ledger";
import { parseLedger } from "@/lib/personal-ledgers";
import { downloadFile } from "@/lib/download";
import { toCsv } from "@/lib/tabular";
import {
  FAMILY_METHOD,
  checkFamilyDraft,
  FAMILY_LIMITS,
  PARENT_KINDS,
  ASSERTIONS,
  familyProfileSchema,
  familyHistorySchema,
  validateFamilyProfiles,
  reviewFamilyProfile,
  familyProfileReport,
  familyHistoryCsvRows,
  type FamilyProfile,
  type FamilyHistory,
} from "@/lib/family-history";
const blankProfile = () => ({
  id: "",
  name: "",
  isIndex: false,
  birthYear: "",
  lifeStatus: "unknown",
  deathYear: "",
  source: "",
  sourceUrl: "",
  notes: "",
  parents: [] as {
    personId: string;
    kind: string;
    source: string;
    sourceUrl: string;
  }[],
});
const blankHistory = () => ({
  id: "",
  condition: "",
  assertion: "unknown",
  assessedOn: "",
  onsetAgeYears: "",
  source: "",
  sourceUrl: "",
  notes: "",
});
export default function FamilyPage() {
  const [removedHistory, setRemovedHistory] = useState<{
    personId: string;
    record: FamilyHistory;
  } | null>(null);
  function currentVersion() {
    const raw = window.localStorage.getItem(KEYS.family);
    return raw;
  }
  const [historyOwner, setHistoryOwner] = useState<string | null>(null);
  const ledger = useLedger(
    KEYS.family,
    "family-profiles",
    familyProfileSchema,
    validateFamilyProfiles,
  );
  const [selectedId, setSelectedId] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [historyPage, setHistoryPage] = useState(0),
    [draft, setDraft] = useState(blankProfile),
    [historyDraft, setHistoryDraft] = useState(blankHistory),
    [base, setBase] = useState<string | null>(null),
    [hBase, setHBase] = useState<string | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [historyConfirmed, setHistoryConfirmed] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [removed, setRemoved] = useState<FamilyProfile | null>(null);
  const editor = useRef<HTMLDetailsElement>(null),
    historyEditor = useRef<HTMLDetailsElement>(null),
    feedback = useRef<HTMLDivElement>(null);
  const entries = ledger.error ? [] : ledger.entries;
  const selected =
    entries.find((p) => p.id === selectedId) ||
    entries.find((p) => p.isIndex) ||
    entries[0];
  const review = selected ? reviewFamilyProfile(selected) : null;
  const filtered = entries.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 12)),
    currentPage = Math.min(page, pages - 1),
    hPages = Math.max(1, Math.ceil((selected?.history.length || 0) / 20)),
    hPage = Math.min(historyPage, hPages - 1);
  function fail(e: unknown) {
    setError(messageOf(e));
    feedback.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function guard(
    expected: string | null,
    owner?: string | null,
    currentOwner?: string,
  ) {
    const raw = window.localStorage.getItem(KEYS.family);
    const current = raw
      ? parseLedger(JSON.parse(raw), "family-profiles", familyProfileSchema)
      : null;
    if (current) validateFamilyProfiles(current.entries);
    checkFamilyDraft(expected, raw, owner, currentOwner);
  }
  function choose(id: string) {
    setSelectedId(id);
    setHistoryOwner(id);
    setHistoryDraft(blankHistory());
    setHistoryConfirmed(false);
    setHBase(currentVersion());
    setHistoryPage(0);
    setError("");
  }
  function openProfile(p?: FamilyProfile) {
    setDraft(
      p
        ? {
            id: p.id,
            name: p.name,
            isIndex: p.isIndex,
            birthYear: p.birthYear === null ? "" : String(p.birthYear),
            lifeStatus: p.lifeStatus,
            deathYear: p.deathYear === null ? "" : String(p.deathYear),
            source: p.source,
            sourceUrl: p.sourceUrl,
            notes: p.notes,
            parents: p.parents.map((x) => ({ ...x })),
          }
        : blankProfile(),
    );
    setBase(currentVersion());
    setConfirmed(false);
    setError("");
    if (editor.current) {
      editor.current.open = true;
      editor.current.scrollIntoView({ behavior: "smooth" });
    }
  }
  function set(
    key: keyof ReturnType<typeof blankProfile>,
    value: string | boolean,
  ) {
    setDraft({ ...draft, [key]: value });
    setConfirmed(false);
  }
  function hSet(key: keyof ReturnType<typeof blankHistory>, value: string) {
    setHistoryDraft({ ...historyDraft, [key]: value });
    setHistoryConfirmed(false);
  }
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex justify-between gap-4">
          <div>
            <p className="text-micro uppercase tracking-widest text-copper-700">
              Symphony AI / Family Hub
            </p>
            <h2 className="font-serif text-[30px] mt-1">
              One person. A traceable history.
            </h2>
            <p className="text-body text-stone-600 max-w-2xl mt-2">
              Keep each person's reported history and relationship sources
              together. Unknown information stays visible, with no family risk
              score or assumed inheritance.
            </p>
          </div>
          <Users className="hidden sm:block shrink-0 text-copper" size={30} />
        </div>
        <div className="flex flex-wrap gap-2 mt-5">
          <button
            className={primaryClass}
            onClick={() => openProfile()}
            disabled={!ledger.ready || !!ledger.error}
          >
            <Plus size={14} />
            Add person
          </button>
          <a href="#person-history" className={actionClass}>
            Person & history
          </a>
          <a href="#family-boundaries" className={actionClass}>
            Method & boundaries
          </a>
        </div>
        <p className="text-caption text-stone-500 mt-4">
          Profiles own the histories entered here. Existing personal imports
          stay in their original stores. New medical sources can be explicitly
          reviewed in{" "}
          <Link href="/records/people" className="underline text-copper-700">
            separate person notebooks
          </Link>
          ; nothing is migrated automatically.
        </p>
      </Card>
      <div
        ref={feedback}
        role={error || ledger.error ? "alert" : "status"}
        className="space-y-2 text-caption text-stone-600"
      >
        {(error || ledger.error) && (
          <p className="rounded-xl border border-rose/30 bg-white p-4 text-rose-dark">
            {ledger.error || error}
          </p>
        )}
        {notice && <p>{notice}</p>}
        {removedHistory && (
          <div className="flex flex-wrap gap-3 items-center">
            <span>History record removed.</span>
            <button
              className={actionClass}
              onClick={() => {
                try {
                  const owner = entries.find(
                    (p) => p.id === removedHistory.personId,
                  );
                  if (!owner)
                    throw new Error(
                      "Restore the owning profile before restoring its history.",
                    );
                  ledger.save({
                    ...owner,
                    reviewedAt: new Date().toISOString(),
                    history: [...owner.history, removedHistory.record],
                  });
                  setRemovedHistory(null);
                } catch (e) {
                  fail(e);
                }
              }}
            >
              Undo history removal
            </button>
          </div>
        )}
        {removed && (
          <div className="flex flex-wrap gap-3 items-center">
            <span>Profile removed with its own history.</span>
            <button
              className={actionClass}
              onClick={() => {
                try {
                  ledger.save(removed);
                  setRemoved(null);
                } catch (e) {
                  fail(e);
                }
              }}
            >
              Undo profile removal
            </button>
          </div>
        )}
      </div>
      <Card>
        <details
          ref={editor}
          onToggle={(e) => {
            if (e.currentTarget.open && !draft.id) setBase(currentVersion());
          }}
        >
          <summary className="font-serif text-title cursor-pointer">
            {draft.id ? "Edit person & relationships" : "Add a person profile"}
          </summary>
          <p className="text-caption text-stone-500 mt-3">
            Use an alias if preferred. IDs identify people; matching names never
            merge them. Parent/caregiver links need an existing profile and a
            source. Missing parent links do not establish unrelated founders.
          </p>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              try {
                if (!confirmed)
                  throw new Error(
                    "Check the profile and relationship sources before saving.",
                  );
                guard(base);
                const id = draft.id || crypto.randomUUID(),
                  current = entries.find((p) => p.id === id);
                ledger.save(
                  familyProfileSchema.parse({
                    ...draft,
                    id,
                    birthYear:
                      draft.birthYear === "" ? null : Number(draft.birthYear),
                    deathYear:
                      draft.deathYear === "" ? null : Number(draft.deathYear),
                    reviewedAt: new Date().toISOString(),
                    history: current?.history || [],
                  }),
                );
                setBase(currentVersion());
                choose(id);
                setDraft(blankProfile());
                setConfirmed(false);
                setNotice(
                  "Person profile saved locally. Existing personal imports remain unassigned.",
                );
              } catch (e) {
                fail(e);
              }
            }}
          >
            <fieldset
              disabled={!ledger.ready || !!ledger.error}
              className="space-y-4 disabled:opacity-50"
            >
              <legend className="text-caption font-medium mb-3">
                01 / Person and source
              </legend>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Person label / alias">
                  <input
                    required
                    className={fieldClass}
                    value={draft.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>
                <Field label="Birth year (optional)">
                  <input
                    type="number"
                    min="1000"
                    max="9999"
                    step="1"
                    className={fieldClass}
                    value={draft.birthYear}
                    onChange={(e) => set("birthYear", e.target.value)}
                  />
                </Field>
                <Field label="Life status">
                  <select
                    className={fieldClass}
                    value={draft.lifeStatus}
                    onChange={(e) => set("lifeStatus", e.target.value)}
                  >
                    <option>unknown</option>
                    <option>living</option>
                    <option>deceased</option>
                  </select>
                </Field>
                <Field label="Death year (optional)">
                  <input
                    type="number"
                    min="1000"
                    max="9999"
                    step="1"
                    className={fieldClass}
                    value={draft.deathYear}
                    onChange={(e) => set("deathYear", e.target.value)}
                  />
                </Field>
                <Field label="Profile source">
                  <input
                    required
                    className={fieldClass}
                    value={draft.source}
                    onChange={(e) => set("source", e.target.value)}
                  />
                </Field>
                <Field label="Profile source URL (optional)">
                  <input
                    type="url"
                    className={fieldClass}
                    value={draft.sourceUrl}
                    onChange={(e) => set("sourceUrl", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Person notes">
                <textarea
                  className={fieldClass}
                  value={draft.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </Field>
              <label className="flex items-start gap-3 text-caption text-stone-600">
                <input
                  type="checkbox"
                  checked={draft.isIndex}
                  onChange={(e) => set("isIndex", e.target.checked)}
                  className="mt-1 rounded text-copper border-cream-300"
                />
                <span>
                  Index person for this Family Hub (optional; at most one). This
                  does not assign existing personal imports to them.
                </span>
              </label>
            </fieldset>
            <fieldset
              disabled={!ledger.ready || !!ledger.error}
              className="space-y-4 disabled:opacity-50"
            >
              <legend className="text-caption font-medium mb-3">
                02 / Entered parents & caregivers
              </legend>
              {draft.parents.map((p, index) => (
                <div
                  className="rounded-xl border border-cream-300 p-3 space-y-3"
                  key={index}
                >
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label={`Link ${index + 1} person`}>
                      <select
                        className={fieldClass}
                        required
                        value={p.personId}
                        onChange={(e) => {
                          setDraft({
                            ...draft,
                            parents: draft.parents.map((x, n) =>
                              n === index
                                ? { ...x, personId: e.target.value }
                                : x,
                            ),
                          });
                          setConfirmed(false);
                        }}
                      >
                        <option value="">Choose an existing person</option>
                        {entries
                          .filter((x) => x.id !== draft.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name} · {x.id.slice(-8)}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label={`Link ${index + 1} relationship`}>
                      <select
                        className={fieldClass}
                        value={p.kind}
                        onChange={(e) => {
                          setDraft({
                            ...draft,
                            parents: draft.parents.map((x, n) =>
                              n === index ? { ...x, kind: e.target.value } : x,
                            ),
                          });
                          setConfirmed(false);
                        }}
                      >
                        {PARENT_KINDS.map((k) => (
                          <option key={k}>{k}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label={`Link ${index + 1} source`}>
                      <input
                        className={fieldClass}
                        required
                        value={p.source}
                        onChange={(e) => {
                          setDraft({
                            ...draft,
                            parents: draft.parents.map((x, n) =>
                              n === index
                                ? { ...x, source: e.target.value }
                                : x,
                            ),
                          });
                          setConfirmed(false);
                        }}
                      />
                    </Field>
                    <Field label={`Link ${index + 1} source URL (optional)`}>
                      <input
                        type="url"
                        className={fieldClass}
                        value={p.sourceUrl}
                        onChange={(e) => {
                          setDraft({
                            ...draft,
                            parents: draft.parents.map((x, n) =>
                              n === index
                                ? { ...x, sourceUrl: e.target.value }
                                : x,
                            ),
                          });
                          setConfirmed(false);
                        }}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    className={actionClass}
                    onClick={() => {
                      setDraft({
                        ...draft,
                        parents: draft.parents.filter((_, n) => n !== index),
                      });
                      setConfirmed(false);
                    }}
                  >
                    Remove link {index + 1}
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={actionClass}
                disabled={draft.parents.length >= 20 || !entries.length}
                onClick={() => {
                  setDraft({
                    ...draft,
                    parents: [
                      ...draft.parents,
                      {
                        personId: "",
                        kind: "biological",
                        source: "",
                        sourceUrl: "",
                      },
                    ],
                  });
                  setConfirmed(false);
                }}
              >
                Add parent / caregiver link
              </button>
              <label className="flex items-start gap-3 text-caption text-stone-600">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-1 rounded text-copper border-cream-300"
                />
                <span>
                  I checked the person and relationship sources. An entered
                  biological link is reported information, not a genetic
                  parentage test.
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button className={primaryClass} type="submit">
                  Save person profile
                </button>
                <button
                  className={actionClass}
                  type="button"
                  onClick={() => {
                    setDraft(blankProfile());
                    setConfirmed(false);
                    setBase(currentVersion());
                  }}
                >
                  Clear profile form
                </button>
              </div>
            </fieldset>
          </form>
        </details>
      </Card>
      <section id="person-history" className="scroll-mt-6">
        <div className="grid lg:grid-cols-[1fr_2fr] gap-5">
          <Card>
            <SectionTitle
              icon={Users}
              title="People"
              subtitle="Select whose Family Hub record you are reviewing."
            />
            <Field label="Find a person">
              <input
                className={fieldClass}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </Field>
            <p className="text-micro text-stone-500 mt-2">
              Selecting a person clears the unsaved history form; saved
              histories stay with their owner.
            </p>
            {!ledger.ready ? (
              <p role="status">Loading profiles…</p>
            ) : !entries.length ? (
              <div className="mt-4 rounded-xl border border-dashed border-cream-400 bg-cream-100 p-4">
                <h3 className="font-serif text-title">
                  Start with a person, not a risk score
                </h3>
                <p className="text-caption text-stone-600 mt-2">
                  No family profiles saved. Add one source-backed person;
                  relatives and history can be added when known.
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {filtered
                  .slice(currentPage * 12, (currentPage + 1) * 12)
                  .map((p) => (
                    <li key={p.id}>
                      <button
                        className={`w-full text-left rounded-xl border p-3 break-words ${selected?.id === p.id ? "bg-copper-50 border-copper/30" : "bg-white border-cream-300"}`}
                        onClick={() => choose(p.id)}
                        aria-pressed={selected?.id === p.id}
                      >
                        <span className="font-serif text-title block">
                          {p.name}
                        </span>
                        <span className="text-caption text-stone-500">
                          {p.isIndex ? "Index person · " : ""}
                          {p.history.length} history records
                        </span>
                        <span className="text-micro text-stone-500 block font-mono">
                          {p.id.slice(-8)}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            {!!entries.length && !filtered.length && (
              <p className="text-caption text-stone-500 mt-3">
                No matching profiles.
              </p>
            )}
            {pages > 1 && (
              <nav
                aria-label="Person pages"
                className="flex flex-wrap gap-2 items-center mt-4"
              >
                <button
                  className={actionClass}
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous people
                </button>
                <span className="text-caption">
                  {currentPage + 1} / {pages}
                </span>
                <button
                  className={actionClass}
                  disabled={currentPage + 1 === pages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next people
                </button>
              </nav>
            )}
          </Card>
          <div className="space-y-5">
            {selected && review ? (
              <>
                <Card>
                  <div className="flex flex-wrap justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-micro uppercase tracking-widest text-copper-700">
                        Selected person {selected.isIndex ? "/ index" : ""}
                      </p>
                      <h3 className="font-serif text-[28px] mt-1 break-words">
                        {selected.name}
                      </h3>
                      <p className="text-caption text-stone-500 mt-1">
                        Born {selected.birthYear ?? "unknown year"} ·{" "}
                        {selected.lifeStatus}
                        {selected.deathYear
                          ? ` · died ${selected.deathYear}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap self-start gap-2">
                      <button
                        className={actionClass}
                        onClick={() => openProfile(selected)}
                      >
                        Edit selected person
                      </button>
                      <button
                        className={actionClass}
                        onClick={() => {
                          try {
                            setRemoved(ledger.remove(selected.id) || null);
                            setSelectedId("");
                            setHistoryDraft(blankHistory());
                            setHistoryOwner(null);
                            setNotice("");
                          } catch (e) {
                            fail(e);
                          }
                        }}
                      >
                        Remove selected person
                      </button>
                    </div>
                  </div>
                  <p className="text-caption text-stone-600 mt-3 break-words">
                    Source: {selected.source}
                    {selected.sourceUrl && (
                      <>
                        {" "}
                        ·{" "}
                        <a
                          className="underline text-copper-700"
                          href={selected.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open profile source
                        </a>
                      </>
                    )}
                  </p>
                  {selected.notes && (
                    <p className="text-caption text-stone-600 whitespace-pre-wrap break-words mt-2">
                      {selected.notes}
                    </p>
                  )}
                  <div className="grid sm:grid-cols-3 gap-3 mt-5">
                    {[
                      { label: "History records", n: review.totalRecords },
                      {
                        label: "With an assessment date",
                        n: review.datedRecords,
                      },
                      {
                        label: "Mixed source assertions",
                        n: review.conditionGroups.filter(
                          (g) => g.mixedAssertions,
                        ).length,
                      },
                    ].map((s) => (
                      <div
                        className="rounded-xl bg-cream-100 p-3"
                        key={s.label}
                      >
                        <p className="text-caption text-stone-500">{s.label}</p>
                        <p className="font-serif text-[26px]">{s.n}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-micro text-stone-500 mt-3">
                    Counts describe this person's entered records, not screening
                    coverage, disease prevalence or confirmed diagnoses. No
                    record does not mean no condition.
                  </p>
                </Card>
                <Card>
                  <SectionTitle
                    icon={GitBranch}
                    title="Entered connections"
                    subtitle="Parent/caregiver links are reported sources; they do not establish genetic relatedness."
                  />
                  <div className="space-y-3">
                    {selected.parents.length ? (
                      selected.parents.map((link) => {
                        const parent = entries.find(
                          (p) => p.id === link.personId,
                        )!;
                        return (
                          <div
                            className="rounded-xl border border-cream-300 p-3 break-words"
                            key={link.personId}
                          >
                            <button
                              className="font-medium text-caption text-copper-700 underline"
                              onClick={() => choose(parent.id)}
                            >
                              {parent.name}
                            </button>
                            <p className="text-caption text-stone-600">
                              {link.kind} parent / caregiver → {selected.name}
                            </p>
                            <p className="text-micro text-stone-500">
                              Source: {link.source}
                              {link.sourceUrl && (
                                <>
                                  {" "}
                                  ·{" "}
                                  <a
                                    className="underline"
                                    href={link.sourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Open link source
                                  </a>
                                </>
                              )}
                            </p>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-caption text-stone-500">
                        No parent/caregiver links recorded. This does not
                        establish unrelatedness.
                      </p>
                    )}
                    {entries
                      .filter((p) =>
                        p.parents.some((l) => l.personId === selected.id),
                      )
                      .map((child) => (
                        <div
                          className="rounded-xl bg-cream-100 p-3 text-caption break-words"
                          key={child.id}
                        >
                          <button
                            className="underline text-copper-700"
                            onClick={() => choose(child.id)}
                          >
                            {child.name}
                          </button>
                          <p>
                            Has an entered{" "}
                            {
                              child.parents.find(
                                (l) => l.personId === selected.id,
                              )!.kind
                            }{" "}
                            link to this person.
                          </p>
                        </div>
                      ))}
                  </div>
                </Card>
                <Card>
                  <SectionTitle
                    icon={BookOpen}
                    title="History & source assertions"
                    subtitle="Reported present, explicitly denied and unknown remain separate."
                  />
                  <details
                    ref={historyEditor}
                    onToggle={(e) => {
                      if (e.currentTarget.open && !historyDraft.id) {
                        setHBase(currentVersion());
                        setHistoryOwner(selected.id);
                      }
                    }}
                  >
                    <summary className="text-caption text-copper-700 cursor-pointer">
                      {historyDraft.id
                        ? "Edit this person's history record"
                        : "Add history for selected person"}
                    </summary>
                    <form
                      className="space-y-4 mt-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setError("");
                        try {
                          if (!historyConfirmed)
                            throw new Error(
                              "Check the selected person's history source before saving.",
                            );
                          guard(hBase, historyOwner, selected.id);
                          const record = familyHistorySchema.parse({
                            ...historyDraft,
                            id: historyDraft.id || crypto.randomUUID(),
                            assessedOn: historyDraft.assessedOn || null,
                            onsetAgeYears:
                              historyDraft.onsetAgeYears === ""
                                ? null
                                : Number(historyDraft.onsetAgeYears),
                            capturedAt: new Date().toISOString(),
                          });
                          ledger.save({
                            ...selected,
                            reviewedAt: new Date().toISOString(),
                            history: [
                              ...selected.history.filter(
                                (h) => h.id !== record.id,
                              ),
                              record,
                            ],
                          });
                          setHistoryDraft(blankHistory());
                          setHistoryConfirmed(false);
                          setHBase(currentVersion());
                          setHistoryOwner(selected.id);
                          setNotice(`History saved for ${selected.name}.`);
                        } catch (e) {
                          fail(e);
                        }
                      }}
                    >
                      <fieldset
                        disabled={!ledger.ready || !!ledger.error}
                        className="space-y-4 disabled:opacity-50"
                      >
                        <legend className="text-caption font-medium">
                          Owner: {selected.name} · {selected.id.slice(-8)}
                        </legend>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <Field label="Condition / finding exact source label">
                            <input
                              required
                              className={fieldClass}
                              value={historyDraft.condition}
                              onChange={(e) =>
                                hSet("condition", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Source assertion">
                            <select
                              className={fieldClass}
                              value={historyDraft.assertion}
                              onChange={(e) =>
                                hSet("assertion", e.target.value)
                              }
                            >
                              {ASSERTIONS.map((a) => (
                                <option key={a}>{a}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Assessment date (optional)">
                            <input
                              type="date"
                              className={fieldClass}
                              value={historyDraft.assessedOn}
                              onChange={(e) =>
                                hSet("assessedOn", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Reported onset age in years (optional)">
                            <input
                              type="number"
                              step="1"
                              min="0"
                              max="150"
                              className={fieldClass}
                              value={historyDraft.onsetAgeYears}
                              onChange={(e) =>
                                hSet("onsetAgeYears", e.target.value)
                              }
                            />
                          </Field>
                          <Field label="History source">
                            <input
                              required
                              className={fieldClass}
                              value={historyDraft.source}
                              onChange={(e) => hSet("source", e.target.value)}
                            />
                          </Field>
                          <Field label="History source URL (optional)">
                            <input
                              type="url"
                              className={fieldClass}
                              value={historyDraft.sourceUrl}
                              onChange={(e) =>
                                hSet("sourceUrl", e.target.value)
                              }
                            />
                          </Field>
                        </div>
                        <Field label="History notes">
                          <textarea
                            className={fieldClass}
                            value={historyDraft.notes}
                            onChange={(e) => hSet("notes", e.target.value)}
                          />
                        </Field>
                        <label className="flex items-start gap-3 text-caption text-stone-600">
                          <input
                            type="checkbox"
                            required
                            className="mt-1 rounded text-copper border-cream-300"
                            checked={historyConfirmed}
                            onChange={(e) =>
                              setHistoryConfirmed(e.target.checked)
                            }
                          />
                          <span>
                            I checked the source and selected person. A source
                            assertion is not an independently confirmed
                            diagnosis.
                          </span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button type="submit" className={primaryClass}>
                            Save person's history
                          </button>
                          <button
                            type="button"
                            className={actionClass}
                            onClick={() => {
                              setHistoryDraft(blankHistory());
                              setHistoryOwner(selected.id);
                              setHistoryConfirmed(false);
                              setHBase(currentVersion());
                            }}
                          >
                            Clear history form
                          </button>
                        </div>
                      </fieldset>
                    </form>
                  </details>
                  {review.conditionGroups
                    .filter((g) => g.mixedAssertions)
                    .map((g) => (
                      <p
                        key={g.key}
                        className="rounded-xl border border-copper/30 bg-copper-50 p-3 text-caption text-stone-600 mt-4 break-words"
                      >
                        Inspect source history for <strong>{g.label}</strong>:
                        both reported-present and explicitly-denied assertions
                        are saved. Dates and source meanings may differ; this is
                        not an adjudicated contradiction or diagnosis.
                        {g.unknownTiming &&
                          " At least one assessment date is unknown."}
                      </p>
                    ))}
                  {!selected.history.length ? (
                    <p className="rounded-xl bg-cream-100 p-4 mt-4 text-caption text-stone-600">
                      No history entered for this person. Their condition status
                      is unknown, not a negative finding.
                    </p>
                  ) : (
                    <ol className="mt-4 space-y-3">
                      {[...selected.history]
                        .sort(
                          (a, b) =>
                            b.capturedAt.localeCompare(a.capturedAt) ||
                            a.id.localeCompare(b.id),
                        )
                        .slice(hPage * 20, (hPage + 1) * 20)
                        .map((h) => (
                          <li
                            className="rounded-xl border border-cream-300 p-4 text-caption break-words"
                            key={h.id}
                          >
                            <h4 className="font-serif text-title">
                              {h.condition}
                            </h4>
                            <p className="font-medium text-stone-700 mt-1">
                              {h.assertion}
                            </p>
                            <p className="text-stone-500 mt-2">
                              Assessment: {h.assessedOn || "unknown"} · onset
                              age:{" "}
                              {h.onsetAgeYears === null
                                ? "unknown"
                                : `${h.onsetAgeYears} years`}
                            </p>
                            <p className="mt-2">
                              Source: {h.source}
                              {h.sourceUrl && (
                                <>
                                  {" "}
                                  ·{" "}
                                  <a
                                    href={h.sourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline text-copper-700"
                                  >
                                    Open history source
                                  </a>
                                </>
                              )}
                            </p>
                            {h.notes && (
                              <p className="whitespace-pre-wrap mt-2">
                                {h.notes}
                              </p>
                            )}
                            <p className="text-micro text-stone-500 mt-2">
                              Last captured / edited{" "}
                              {new Date(h.capturedAt).toLocaleString()}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-3">
                              <button
                                className={actionClass}
                                onClick={() => {
                                  setHistoryDraft({
                                    ...h,
                                    assessedOn: h.assessedOn || "",
                                    onsetAgeYears:
                                      h.onsetAgeYears === null
                                        ? ""
                                        : String(h.onsetAgeYears),
                                  });
                                  setHBase(currentVersion());
                                  setHistoryOwner(selected.id);
                                  setHistoryConfirmed(false);
                                  if (historyEditor.current) {
                                    historyEditor.current.open = true;
                                    historyEditor.current.scrollIntoView({
                                      behavior: "smooth",
                                    });
                                  }
                                }}
                              >
                                Edit history record
                              </button>
                              <button
                                className={actionClass}
                                onClick={() => {
                                  try {
                                    ledger.save({
                                      ...selected,
                                      reviewedAt: new Date().toISOString(),
                                      history: selected.history.filter(
                                        (x) => x.id !== h.id,
                                      ),
                                    });
                                    setRemovedHistory({
                                      personId: selected.id,
                                      record: h,
                                    });
                                    setNotice(
                                      "History record removed; undo is available.",
                                    );
                                  } catch (e) {
                                    fail(e);
                                  }
                                }}
                              >
                                Remove history record
                              </button>
                            </div>
                          </li>
                        ))}
                    </ol>
                  )}
                  {hPages > 1 && (
                    <nav
                      aria-label="History pages"
                      className="flex flex-wrap gap-2 items-center mt-4"
                    >
                      <button
                        className={actionClass}
                        disabled={hPage === 0}
                        onClick={() => setHistoryPage(hPage - 1)}
                      >
                        Previous history
                      </button>
                      <span className="text-caption">
                        {hPage + 1} / {hPages}
                      </span>
                      <button
                        className={actionClass}
                        disabled={hPage + 1 === hPages}
                        onClick={() => setHistoryPage(hPage + 1)}
                      >
                        Next history
                      </button>
                    </nav>
                  )}
                </Card>
                <Card>
                  <SectionTitle
                    icon={Download}
                    title="Export selected person"
                    subtitle="This person's history and entered link IDs; other profiles' names and histories are not expanded."
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={actionClass}
                      onClick={() => {
                        try {
                          downloadFile(
                            `symphony-family-person-${selected.id}.json`,
                            JSON.stringify(
                              familyProfileReport(entries, selected.id),
                              null,
                              2,
                            ),
                            "application/json",
                          );
                        } catch (e) {
                          fail(e);
                        }
                      }}
                    >
                      Export person's JSON report
                    </button>
                    <button
                      className={actionClass}
                      onClick={() =>
                        downloadFile(
                          `symphony-family-history-${selected.id}.csv`,
                          toCsv(familyHistoryCsvRows(selected)),
                          "text/csv",
                        )
                      }
                    >
                      Export person's history CSV
                    </button>
                  </div>
                  <p className="text-micro text-stone-500 mt-3">
                    Source text may name other people as entered. Review before
                    sharing. The main personal report contains Family Hub counts
                    only.
                  </p>
                </Card>
              </>
            ) : (
              <Card>
                <h3 className="font-serif text-title">
                  A source history for each person
                </h3>
                <p className="text-caption text-stone-600 mt-2">
                  Select or add a profile. This workspace does not insert
                  fictional relatives, conditions or recommendations.
                </p>
              </Card>
            )}
          </div>
        </div>
      </section>
      <Card className="relative">
        <SectionTitle
          icon={Download}
          title="Family workspace backup"
          subtitle="A full backup contains every Family Hub profile and history. It is separate from the selected-person report."
        />
        <LedgerTools
          kind="family-profiles"
          storageKey={KEYS.family}
          schema={familyProfileSchema}
          stored={ledger.stored}
          disabled={!ledger.ready}
          exportDisabled={!!ledger.error}
          summarize={(p) =>
            `${p.history.length} history records · ${p.parents.length} entered parent/caregiver links · ${p.source}`
          }
          onRestore={(value) => {
            ledger.restore(value);
            setSelectedId("");
            setHistoryDraft(blankHistory());
            setHistoryOwner(null);
            setRemoved(null);
            setRemovedHistory(null);
            setHistoryDraft(blankHistory());
            setHistoryOwner(null);
            setDraft(blankProfile());
            setNotice("Reviewed family workspace backup restored.");
          }}
        />
        <p className="text-micro text-stone-500 mt-3">
          Stored unencrypted in this browser, with no account separation or
          third-party upload. Use aliases where possible and keep
          originals/backups intentionally.
        </p>
      </Card>
      <section id="family-boundaries" className="scroll-mt-6">
        <Card>
          <SectionTitle
            icon={BookOpen}
            title="Method & boundaries"
            subtitle={FAMILY_METHOD}
          />
          <ul className="list-disc pl-5 space-y-2 text-caption text-stone-600">
            <li>
              Profile IDs own their histories. Names, relationships and matching
              labels never merge people. At most one optional index person is
              supported; this is a navigation choice, not an association to
              existing personal uploads.
            </li>
            <li>
              Parent/caregiver references must resolve; directed cycles,
              self-links, duplicates and more than two entered biological
              parents are blocked. Social/adoptive links remain distinct. Known
              biological-parent birth years must precede the child's year.
              Missing links do not imply unrelated founders.
            </li>
            <li>
              History summaries count source records within the selected person.
              Condition labels fold case/whitespace only. Opposing historical
              assertions are flagged for inspection, with no automatic clinical
              resolution. Missing dates and unknown assertions remain unknown.
            </li>
            <li>{FAMILY_LIMITS}</li>
          </ul>
          <div className="flex flex-wrap gap-4 text-caption mt-4">
            <a
              className="underline text-copper-700"
              href="https://hl7.org/fhir/R4/familymemberhistory-definitions.html"
              target="_blank"
              rel="noreferrer"
            >
              FHIR family-history semantics
            </a>
            <a className="underline text-copper-700" href="/reports">
              Personal report scope
            </a>
          </div>
        </Card>
      </section>
    </div>
  );
}
