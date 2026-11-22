"use client";
import { useMemo, useRef, useState } from "react";
import { Pill, Plus, BookOpen, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import {
  Field,
  LedgerTools,
  fieldClass,
  actionClass,
  primaryClass,
  messageOf,
} from "@/components/ui/ledger-tools";
import { KEYS } from "@/lib/user-data";
import { useLedger } from "@/lib/use-ledger";
import { downloadFile } from "@/lib/download";
import { toCsv, localDay } from "@/lib/tabular";
import {
  AMOUNT_UNITS,
  DOSE_UNITS,
  ROUTES,
  MEDICATION_METHOD,
  MEDICATION_LIMITS,
  medicationSchema,
  medicationDaySchema,
  validateMedicationSet,
  reviewMedicationPlan,
  medicationReviewCsvRows,
  type Medication,
} from "@/lib/medications";
const blank = () => ({
  id: "",
  name: "",
  route: "oral",
  form: "",
  doseUnit: "tablet",
  unitsPerDose: "",
  kind: "unresolved",
  frequency: "",
  status: "active plan",
  startOn: "",
  lastOn: "",
  source: "",
  sourceUrl: "",
  instructions: "",
  notes: "",
  ingredients: [{ name: "", amount: "", unit: "mg" }],
});
const display = (n: number) =>
  new Intl.NumberFormat(undefined, { maximumSignificantDigits: 8 }).format(n);
export default function MedicinePage() {
  const ledger = useLedger(
    KEYS.medications,
    "medications",
    medicationSchema,
    validateMedicationSet,
  );
  const [reviewPage, setReviewPage] = useState(0);
  const [draft, setDraft] = useState(blank),
    [day, setDay] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [removed, setRemoved] = useState<Medication | null>(null);
  const editor = useRef<HTMLDetailsElement>(null),
    feedback = useRef<HTMLDivElement>(null);
  const entries = ledger.error ? [] : ledger.entries;
  const review = useMemo(
    () =>
      day && medicationDaySchema.safeParse(day).success
        ? reviewMedicationPlan(entries, day)
        : null,
    [ledger.stored, ledger.error, day],
  );
  const filtered = entries.filter((r) =>
    `${r.name} ${r.route} ${r.source} ${r.ingredients.map((i) => i.name).join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 20)),
    currentPage = Math.min(page, pages - 1);
  const reviewPages = Math.max(1, Math.ceil((review?.totals.length || 0) / 20));
  const currentReviewPage = Math.min(reviewPage, reviewPages - 1);
  function set(key: keyof ReturnType<typeof blank>, value: string) {
    setDraft({ ...draft, [key]: value });
    setConfirmed(false);
  }
  function fail(e: unknown) {
    setError(messageOf(e));
    feedback.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function edit(r: Medication) {
    setDraft({
      id: r.id,
      name: r.name,
      route: r.route,
      form: r.form,
      doseUnit: r.doseUnit,
      unitsPerDose: r.unitsPerDose === null ? "" : String(r.unitsPerDose),
      kind: r.schedule.kind,
      frequency:
        r.schedule.kind === "daily"
          ? String(r.schedule.dosesPerDay)
          : r.schedule.kind === "as-needed" &&
              r.schedule.maxDosesPerDay !== null
            ? String(r.schedule.maxDosesPerDay)
            : "",
      status: r.status,
      startOn: r.startOn || "",
      lastOn: r.lastOn || "",
      source: r.source,
      sourceUrl: r.sourceUrl,
      instructions: r.instructions,
      notes: r.notes,
      ingredients: r.ingredients.map((i) => ({
        ...i,
        amount: i.amount === null ? "" : String(i.amount),
      })),
    });
    setConfirmed(false);
    if (editor.current) {
      editor.current.open = true;
      editor.current.scrollIntoView({ behavior: "smooth" });
    }
  }
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex justify-between gap-4">
          <div>
            <p className="text-micro uppercase tracking-widest text-copper-700">
              Symphony AI / Medicine Checker
            </p>
            <h2 className="font-serif text-[30px] mt-1">
              A clearer medication plan
            </h2>
            <p className="text-body text-stone-600 mt-2 max-w-2xl">
              Keep the label, strength and schedule together. Review
              source-listed ingredient quantities and repeated labels before
              taking the list to your clinician or pharmacist.
            </p>
          </div>
          <Pill className="hidden sm:block shrink-0 text-copper" size={30} />
        </div>
        <div className="flex flex-wrap gap-2 mt-5">
          <button
            className={primaryClass}
            onClick={() => {
              if (editor.current) {
                editor.current.open = true;
                editor.current.scrollIntoView({ behavior: "smooth" });
              }
            }}
          >
            <Plus size={14} />
            Add medication
          </button>
          <a href="#plan-review" className={actionClass}>
            Review a date
          </a>
          <a href="#medication-method" className={actionClass}>
            Method & coverage
          </a>
        </div>
        <p className="text-caption text-stone-500 mt-4">
          Your list starts empty. Saved source plans describe instructions, not
          confirmed intake. This version does not evaluate drug interactions,
          dose suitability or genome-based prescribing.
        </p>
      </Card>
      <div
        ref={feedback}
        role={error || ledger.error ? "alert" : "status"}
        className="text-caption text-stone-600 space-y-2"
      >
        {(ledger.error || error) && (
          <p className="rounded-xl border border-rose/30 bg-white p-4 text-rose-dark">
            {ledger.error || error}
          </p>
        )}
        {notice && <p>{notice}</p>}
        {removed && (
          <div className="flex items-center gap-3">
            <span>Record removed.</span>
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
              Undo removal
            </button>
          </div>
        )}
      </div>
      <Card>
        <details ref={editor} className="scroll-mt-6">
          <summary className="font-serif text-title cursor-pointer">
            {draft.id ? "Edit source record" : "Add a source record"}
          </summary>
          <p className="text-caption text-stone-500 mt-3">
            Copy quantities from a source you can review. A strength is per one
            tablet, capsule, mL or other selected unit. For example, 25 mg per 5
            mL is entered as 5 mg per mL. Leave an unknown amount blank;
            complex, weekly, tapering or mixed schedules remain unresolved.
          </p>
          <form
            className="mt-5 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              setNotice("");
              try {
                if (!confirmed)
                  throw new Error(
                    "Check the source transcription before saving.",
                  );
                const { kind, frequency, ...sourceDraft } = draft;
                ledger.save(
                  medicationSchema.parse({
                    ...sourceDraft,
                    id: draft.id || crypto.randomUUID(),
                    unitsPerDose:
                      draft.unitsPerDose.trim() === ""
                        ? null
                        : Number(draft.unitsPerDose),
                    ingredients: draft.ingredients.map((i) => ({
                      ...i,
                      amount: i.amount.trim() === "" ? null : Number(i.amount),
                    })),
                    schedule:
                      draft.kind === "daily"
                        ? {
                            kind: "daily",
                            dosesPerDay: Number(draft.frequency),
                          }
                        : draft.kind === "as-needed"
                          ? {
                              kind: "as-needed",
                              maxDosesPerDay:
                                draft.frequency.trim() === ""
                                  ? null
                                  : Number(draft.frequency),
                            }
                          : { kind: "unresolved" },
                    startOn: draft.startOn || null,
                    lastOn: draft.lastOn || null,
                    reviewedAt: new Date().toISOString(),
                    origin: "manual source transcription",
                  }),
                );
                setDraft(blank());
                setConfirmed(false);
                setNotice("Medication source record saved locally.");
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
                01 / Product & schedule
              </legend>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Product name">
                  <input
                    className={fieldClass}
                    required
                    value={draft.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>
                <Field label="Form / release description">
                  <input
                    className={fieldClass}
                    required
                    placeholder="e.g. immediate-release tablet"
                    value={draft.form}
                    onChange={(e) => set("form", e.target.value)}
                  />
                </Field>
                <Field label="Route">
                  <select
                    className={fieldClass}
                    value={draft.route}
                    onChange={(e) => set("route", e.target.value)}
                  >
                    {ROUTES.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="One label unit">
                  <select
                    className={fieldClass}
                    value={draft.doseUnit}
                    onChange={(e) => set("doseUnit", e.target.value)}
                  >
                    {DOSE_UNITS.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Label units per administration (blank if unknown)">
                  <input
                    className={fieldClass}
                    type="number"
                    min="0"
                    step="any"
                    value={draft.unitsPerDose}
                    onChange={(e) => set("unitsPerDose", e.target.value)}
                  />
                </Field>
                <Field label="Schedule type">
                  <select
                    className={fieldClass}
                    value={draft.kind}
                    onChange={(e) => {
                      setDraft({
                        ...draft,
                        kind: e.target.value,
                        frequency: "",
                      });
                      setConfirmed(false);
                    }}
                  >
                    <option value="unresolved">Unresolved / complex</option>
                    <option value="daily">Fixed daily</option>
                    <option value="as-needed">As needed (PRN)</option>
                  </select>
                </Field>
                {draft.kind !== "unresolved" && (
                  <Field
                    label={
                      draft.kind === "daily"
                        ? "Administrations per day"
                        : "Source maximum administrations per day (optional)"
                    }
                  >
                    <input
                      className={fieldClass}
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      required={draft.kind === "daily"}
                      value={draft.frequency}
                      onChange={(e) => set("frequency", e.target.value)}
                    />
                  </Field>
                )}
                <Field label="Current record status">
                  <select
                    className={fieldClass}
                    value={draft.status}
                    onChange={(e) => set("status", e.target.value)}
                  >
                    <option>active plan</option>
                    <option>on hold</option>
                    <option>stopped</option>
                  </select>
                </Field>
                <Field label="First planned day (blank if unknown)">
                  <input
                    type="date"
                    className={fieldClass}
                    value={draft.startOn}
                    onChange={(e) => set("startOn", e.target.value)}
                  />
                </Field>
                <Field label="Last planned day (inclusive, optional)">
                  <input
                    type="date"
                    className={fieldClass}
                    value={draft.lastOn}
                    onChange={(e) => set("lastOn", e.target.value)}
                  />
                </Field>
              </div>
            </fieldset>
            <fieldset
              disabled={!ledger.ready || !!ledger.error}
              className="space-y-4 disabled:opacity-50"
            >
              <legend className="text-caption font-medium mb-3">
                02 / Active ingredients per one {draft.doseUnit}
              </legend>
              {draft.ingredients.map((i, index) => (
                <div
                  key={index}
                  className="grid sm:grid-cols-[2fr_1fr_1fr_auto] gap-3 rounded-xl border border-cream-300 p-3"
                >
                  <Field
                    label={`Ingredient ${index + 1} exact label / chemical basis`}
                  >
                    <input
                      required
                      className={fieldClass}
                      value={i.name}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          ingredients: draft.ingredients.map((x, n) =>
                            n === index ? { ...x, name: e.target.value } : x,
                          ),
                        });
                        setConfirmed(false);
                      }}
                    />
                  </Field>
                  <Field
                    label={`Ingredient ${index + 1} amount (blank if unknown)`}
                  >
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className={fieldClass}
                      value={i.amount}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          ingredients: draft.ingredients.map((x, n) =>
                            n === index ? { ...x, amount: e.target.value } : x,
                          ),
                        });
                        setConfirmed(false);
                      }}
                    />
                  </Field>
                  <Field label={`Ingredient ${index + 1} unit`}>
                    <select
                      className={fieldClass}
                      value={i.unit}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          ingredients: draft.ingredients.map((x, n) =>
                            n === index ? { ...x, unit: e.target.value } : x,
                          ),
                        });
                        setConfirmed(false);
                      }}
                    >
                      {AMOUNT_UNITS.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </Field>
                  <button
                    type="button"
                    className={`${actionClass} self-end`}
                    disabled={draft.ingredients.length === 1}
                    onClick={() => {
                      setDraft({
                        ...draft,
                        ingredients: draft.ingredients.filter(
                          (_, n) => n !== index,
                        ),
                      });
                      setConfirmed(false);
                    }}
                  >
                    Remove ingredient {index + 1}
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={actionClass}
                disabled={draft.ingredients.length >= 20}
                onClick={() => {
                  setDraft({
                    ...draft,
                    ingredients: [
                      ...draft.ingredients,
                      { name: "", amount: "", unit: "mg" },
                    ],
                  });
                  setConfirmed(false);
                }}
              >
                Add ingredient
              </button>
            </fieldset>
            <fieldset
              disabled={!ledger.ready || !!ledger.error}
              className="space-y-4 disabled:opacity-50"
            >
              <legend className="text-caption font-medium mb-3">
                03 / Traceable instructions
              </legend>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Source label / document">
                  <input
                    required
                    className={fieldClass}
                    value={draft.source}
                    onChange={(e) => set("source", e.target.value)}
                  />
                </Field>
                <Field label="Source URL (optional)">
                  <input
                    className={fieldClass}
                    type="url"
                    value={draft.sourceUrl}
                    onChange={(e) => set("sourceUrl", e.target.value)}
                  />
                </Field>
                <Field label="Original instructions">
                  <textarea
                    className={fieldClass}
                    value={draft.instructions}
                    onChange={(e) => set("instructions", e.target.value)}
                  />
                </Field>
                <Field label="Review notes">
                  <textarea
                    className={fieldClass}
                    value={draft.notes}
                    onChange={(e) => set("notes", e.target.value)}
                  />
                </Field>
              </div>
              <label className="flex items-start gap-3 text-caption text-stone-600">
                <input
                  type="checkbox"
                  required
                  className="mt-1 rounded text-copper border-cream-300"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  I checked the strength denominator, route, schedule and dates
                  against my source. Unknown fields remain unknown; this is not
                  clinical approval.
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={primaryClass}>
                  Save medication record
                </button>
                <button
                  type="button"
                  className={actionClass}
                  onClick={() => {
                    setDraft(blank());
                    setConfirmed(false);
                    setError("");
                  }}
                >
                  Clear form
                </button>
              </div>
            </fieldset>
          </form>
        </details>
      </Card>
      <section id="plan-review" className="scroll-mt-6">
        <Card>
          <SectionTitle
            icon={Pill}
            title="Ingredient plan review"
            subtitle="A calculation from the listed source plan, with missing information kept visible."
          />
          <div className="flex flex-wrap items-end gap-3 mb-5">
            <Field label="Review calendar date">
              <input
                type="date"
                className={fieldClass}
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                  setError("");
                }}
              />
            </Field>
            <button
              className={actionClass}
              onClick={() => setDay(localDay(new Date()))}
            >
              Use today
            </button>
          </div>
          {!review ? (
            <p className="text-caption text-stone-500">
              Choose a date to review this source plan. No schedule or date is
              inferred from free text.
            </p>
          ) : (
            <>
              <div className="grid sm:grid-cols-3 gap-4 mb-5">
                {[
                  { label: "Records included", value: review.includedRecords },
                  {
                    label: "Records outside review",
                    value: review.eligibility.length - review.includedRecords,
                  },
                  {
                    label: "Ingredient / route / unit rows",
                    value: review.totals.length,
                  },
                ].map((s) => (
                  <div className="rounded-xl bg-cream-100 p-4" key={s.label}>
                    <p className="text-caption text-stone-500">{s.label}</p>
                    <p className="font-serif text-[28px] mt-1">{s.value}</p>
                  </div>
                ))}
              </div>
              <p className="text-caption text-stone-500 mb-4">
                Only current active-plan records with a known first day and an
                overlapping date are included. Last day is inclusive. This is a
                review of the current list on a chosen date, not a
                reconstruction of past use.
              </p>
              {!review.totals.length ? (
                <p className="text-caption text-stone-600">
                  No ingredient quantities can be reviewed for this date.
                  Inspect source records and exclusion reasons below; this does
                  not establish that you take no medication.
                </p>
              ) : (
                <div className="space-y-3">
                  {review.totals
                    .slice(currentReviewPage * 20, (currentReviewPage + 1) * 20)
                    .map((r) => (
                      <article
                        className="rounded-xl border border-cream-300 p-4 break-words"
                        key={JSON.stringify([r.identity, r.route, r.unit])}
                      >
                        <div className="flex flex-wrap justify-between gap-3">
                          <div>
                            <h3 className="font-serif text-title">
                              {r.ingredient}
                            </h3>
                            <p className="text-caption text-stone-500">
                              {r.route} · {r.contributions.length} source
                              product
                              {r.contributions.length === 1 ? "" : "s"}
                            </p>
                          </div>
                          {r.repeatedLabel && (
                            <p className="text-caption text-copper-700">
                              Repeated exact ingredient label · inspect sources
                            </p>
                          )}
                        </div>
                        <dl className="grid sm:grid-cols-2 gap-4 mt-4">
                          <div>
                            <dt className="text-micro uppercase text-stone-500">
                              Known scheduled plan / day
                            </dt>
                            <dd className="text-body font-medium mt-1">
                              {display(r.scheduled)} {r.unit}
                              {!r.scheduledComplete && " · incomplete"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-micro uppercase text-stone-500">
                              Optional PRN ceiling / day
                            </dt>
                            <dd className="text-body font-medium mt-1">
                              {r.prnCeiling === null
                                ? "Unknown — source fields incomplete"
                                : `${display(r.prnCeiling)} ${r.unit}`}
                            </dd>
                          </div>
                        </dl>
                        {!r.scheduledComplete && (
                          <p className="text-caption text-stone-600 mt-3">
                            The known scheduled subtotal excludes unresolved
                            schedules or missing quantities. Zero here does not
                            mean no exposure.
                          </p>
                        )}
                        <details className="mt-4">
                          <summary className="text-caption text-copper-700 cursor-pointer">
                            Inspect arithmetic & source contributions
                          </summary>
                          <ul className="mt-3 space-y-3 text-caption text-stone-600">
                            {r.contributions.map((c) => (
                              <li
                                className="border-l-2 border-cream-300 pl-3"
                                key={c.recordId}
                              >
                                <p className="font-medium">
                                  {c.product} · {c.form}
                                </p>
                                <p>
                                  {c.labelAmount ?? "Unknown"} {c.labelUnit} /{" "}
                                  {c.doseUnit} × {c.unitsPerDose ?? "unknown"}{" "}
                                  {c.doseUnit} / administration ={" "}
                                  {c.amountPerDose === null
                                    ? "unknown"
                                    : display(c.amountPerDose)}{" "}
                                  {r.unit} / administration.
                                </p>
                                <p>
                                  {c.schedule.kind === "daily"
                                    ? c.amountPerDose === null
                                      ? "Scheduled quantity unresolved; no numeric contribution."
                                      : `${c.schedule.dosesPerDay} administrations/day → ${display(c.scheduled)} ${r.unit} known scheduled.`
                                    : c.schedule.kind === "as-needed"
                                      ? `Optional use only. Source ceiling: ${c.schedule.maxDosesPerDay ?? "unknown"} administrations/day.`
                                      : "Unresolved schedule; excluded from scheduled amount."}
                                </p>
                                <p>
                                  Source: {c.source} · checked{" "}
                                  {new Date(c.reviewedAt).toLocaleString()}
                                </p>
                                {c.sourceUrl && (
                                  <a
                                    href={c.sourceUrl}
                                    className="underline text-copper-700"
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Open source
                                  </a>
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </article>
                    ))}
                </div>
              )}
              {reviewPages > 1 && (
                <nav
                  aria-label="Ingredient review pages"
                  className="flex flex-wrap gap-3 items-center mt-4"
                >
                  <button
                    className={actionClass}
                    disabled={currentReviewPage === 0}
                    onClick={() => setReviewPage(currentReviewPage - 1)}
                  >
                    Previous ingredients
                  </button>
                  <span className="text-caption">
                    Page {currentReviewPage + 1} of {reviewPages}
                  </span>
                  <button
                    className={actionClass}
                    disabled={currentReviewPage + 1 === reviewPages}
                    onClick={() => setReviewPage(currentReviewPage + 1)}
                  >
                    Next ingredients
                  </button>
                </nav>
              )}
              <details className="mt-5">
                <summary className="text-caption text-copper-700 cursor-pointer">
                  Inspect all inclusion / exclusion reasons
                </summary>
                <ul className="mt-3 space-y-2 text-caption text-stone-600">
                  {review.eligibility.map((r) => (
                    <li className="break-words" key={r.id}>
                      {r.name} · {r.reason}
                    </li>
                  ))}
                </ul>
              </details>
              <p className="text-micro text-stone-500 mt-4">
                PRN ceilings are optional source-listed amounts, not safe limits
                or recommendations. Ingredient repetition is a label match, not
                a confirmed duplicate therapy or interaction. Different
                units/routes stay separate.
              </p>
            </>
          )}
        </Card>
      </section>
      <Card>
        <SectionTitle
          icon={BookOpen}
          title="Your source records"
          subtitle="Source quantities and instructions remain available independently of calculated totals."
        />
        <Field label="Search medications">
          <input
            className={fieldClass}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </Field>
        {!ledger.ready ? (
          <p role="status">Loading saved records…</p>
        ) : !entries.length ? (
          <div className="mt-4 rounded-xl border border-dashed border-cream-400 bg-cream-100 p-5">
            <h3 className="font-serif text-title">
              Start with one label you can trace
            </h3>
            <p className="text-caption text-stone-600 mt-2">
              No medication records saved. Add a source record or review a JSON
              backup. No illustrative prescriptions or genome-based
              recommendations are added.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {filtered
              .slice(currentPage * 20, (currentPage + 1) * 20)
              .map((r) => (
                <article
                  className="rounded-xl border border-cream-300 p-4 break-words"
                  key={r.id}
                >
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <h3 className="font-serif text-title">{r.name}</h3>
                      <p className="text-caption text-stone-500">
                        {r.form} · {r.route} · {r.status}
                      </p>
                    </div>
                    <div className="flex gap-2 self-start">
                      <button className={actionClass} onClick={() => edit(r)}>
                        Edit {r.name}
                      </button>
                      <button
                        className={actionClass}
                        onClick={() => {
                          try {
                            setRemoved(ledger.remove(r.id) || null);
                            setNotice("");
                          } catch (e) {
                            fail(e);
                          }
                        }}
                      >
                        Remove {r.name}
                      </button>
                    </div>
                  </div>
                  <p className="text-caption text-stone-600 mt-3">
                    {r.ingredients
                      .map(
                        (i) =>
                          `${i.name}: ${i.amount ?? "unknown"} ${i.unit} per ${r.doseUnit}`,
                      )
                      .join(" · ")}
                  </p>
                  <p className="text-caption text-stone-500 mt-2">
                    {r.startOn || "First day unknown"} →{" "}
                    {r.lastOn || "No last day recorded"} ·{" "}
                    {r.schedule.kind === "daily"
                      ? `${r.schedule.dosesPerDay}/day`
                      : r.schedule.kind === "as-needed"
                        ? "As needed"
                        : "Unresolved schedule"}
                  </p>
                  <p className="text-caption mt-2">
                    Source: {r.source}
                    {r.sourceUrl && (
                      <>
                        {" "}
                        ·{" "}
                        <a
                          className="underline text-copper-700"
                          href={r.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open source
                        </a>
                      </>
                    )}
                  </p>
                  {(r.instructions || r.notes) && (
                    <details className="mt-3 text-caption text-stone-600">
                      <summary className="cursor-pointer text-copper-700">
                        Original instructions & notes
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap">
                        {r.instructions ||
                          "No source instruction text recorded."}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap">{r.notes}</p>
                      <p className="text-micro mt-2">
                        Source transcription checked{" "}
                        {new Date(r.reviewedAt).toLocaleString()}; not clinical
                        validation.
                      </p>
                    </details>
                  )}
                </article>
              ))}
            {!filtered.length && (
              <p className="text-caption text-stone-500">
                No source records match your search.
              </p>
            )}
            {pages > 1 && (
              <nav
                aria-label="Medication record pages"
                className="flex flex-wrap items-center gap-3"
              >
                <button
                  className={actionClass}
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous records
                </button>
                <span className="text-caption">
                  Page {currentPage + 1} of {pages}
                </span>
                <button
                  className={actionClass}
                  disabled={currentPage + 1 === pages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next records
                </button>
              </nav>
            )}
          </div>
        )}
      </Card>
      <Card className="relative">
        <SectionTitle
          icon={Download}
          title="Portable source plan"
          subtitle="JSON preserves all source records; review CSV contains dated ingredient quantities and provenance."
        />
        <button
          className={`${actionClass} mb-3`}
          disabled={!day || !ledger.ready || !!ledger.error}
          onClick={() => {
            try {
              downloadFile(
                `symphony-medication-review-${day}.csv`,
                toCsv(medicationReviewCsvRows(entries, day)),
                "text/csv",
              );
            } catch (e) {
              fail(e);
            }
          }}
        >
          Export dated review CSV
        </button>
        <LedgerTools
          kind="medications"
          storageKey={KEYS.medications}
          schema={medicationSchema}
          stored={ledger.error ? null : ledger.stored}
          disabled={!ledger.ready}
          summarize={(r) =>
            `${r.route} · ${r.schedule.kind} · ${r.ingredients.length} ingredients · ${r.source}`
          }
          onRestore={(v) => {
            ledger.restore(v);
            setRemoved(null);
            setNotice("Reviewed medication backup restored.");
          }}
        />
        <p className="text-micro text-stone-500 mt-3">
          Stored unencrypted in this browser. Keep original labels and export
          backups intentionally; this is not a clinical record vault.
        </p>
      </Card>
      <section id="medication-method" className="scroll-mt-6">
        <Card>
          <SectionTitle
            icon={BookOpen}
            title="Method & coverage"
            subtitle={MEDICATION_METHOD}
          />
          <ul className="list-disc pl-5 space-y-2 text-caption text-stone-600">
            <li>
              Known scheduled amount = ingredient strength per label unit ×
              label units per administration × administrations per day. Missing
              quantities/schedules stay unresolved. As-needed ceilings are
              separate; no weekly average, split schedule, infusion, taper or
              free-text parsing is attempted.
            </li>
            <li>
              Only mg, mcg and g share a mass dimension (1 g = 1,000 mg; 1 mcg =
              0.001 mg). IU, units, mEq and mmol remain separate. No salt/base,
              potency, concentration-percent or bioavailability conversion is
              applied.
            </li>
            <li>
              Ingredient matching folds label case and repeated whitespace only,
              within the same route. It does not resolve brand names, synonyms,
              RxNorm identifiers, salts or release forms. Repeated labels
              require source review; unmatched labels are not evidence of
              different therapy.
            </li>
            <li>{MEDICATION_LIMITS}</li>
            <li>
              Only this module's records are reviewed. Supplements, raw genotype
              uploads, family records and illustrative pharmacogenomic views are
              not inputs. No clinical guideline or interaction database coverage
              is installed.
            </li>
          </ul>
          <div className="flex flex-wrap gap-4 mt-4 text-caption">
            <a
              className="underline text-copper-700"
              href="https://hl7.org/fhir/R4/medicationstatement.html"
              target="_blank"
              rel="noreferrer"
            >
              Source record semantics
            </a>
            <a
              className="underline text-copper-700"
              href="https://hl7.org/fhir/R4/dosage-definitions.html"
              target="_blank"
              rel="noreferrer"
            >
              Dosage & as-needed semantics
            </a>
            <a className="underline text-copper-700" href="/reports">
              Personal report
            </a>
          </div>
        </Card>
      </section>
    </div>
  );
}
