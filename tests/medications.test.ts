import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  medicationSchema,
  reviewMedicationPlan,
  medicationReviewCsvRows,
  validateMedicationSet,
} from "../src/lib/medications";
import { parseLedger } from "../src/lib/personal-ledgers";
import { createReport } from "../src/lib/report";
import { toCsv } from "../src/lib/tabular";
const fixture = JSON.parse(
  readFileSync("docs/examples/medications-synthetic.json", "utf8"),
);
const ledger = () => parseLedger(fixture, "medications", medicationSchema);
const row = () => structuredClone(ledger().entries[0]);
const date = "2026-11-22";
test("hand-calculated fractional tablet and liquid plans preserve 42.5 mg scheduled and 60 mg optional PRN separately", () => {
  const r = reviewMedicationPlan(ledger().entries, date);
  assert.equal(r.includedRecords, 8);
  assert.equal(r.totals.length, 6);
  const alpha = r.totals.find(
    (t) =>
      t.ingredient === "Synthetic ingredient Alpha" &&
      t.route === "oral" &&
      t.unit === "mg",
  )!;
  assert.equal(alpha.scheduled, 42.5);
  assert.equal(alpha.prnCeiling, 60);
  assert.equal(alpha.scheduledComplete, true);
  assert.equal(alpha.repeatedLabel, true);
  assert.deepEqual(
    alpha.contributions.map((c) => c.amountPerDose),
    [12.5, 10, 20],
  );
  assert.equal(r.totals.find((t) => t.route === "topical")!.scheduled, 1);
  assert.equal(r.totals.find((t) => t.unit === "IU")!.scheduled, 1);
});
test("unknown PRN limits, complex schedules and missing strengths never become complete zero-exposure results", () => {
  const r = reviewMedicationPlan(ledger().entries, date);
  const beta = r.totals.find((t) => t.ingredient.endsWith("Beta"))!,
    gamma = r.totals.find((t) => t.ingredient.endsWith("Gamma"))!,
    delta = r.totals.find((t) => t.ingredient.endsWith("Delta"))!;
  assert.equal(beta.scheduled, 0);
  assert.equal(beta.prnCeiling, null);
  assert.equal(gamma.scheduled, 0);
  assert.equal(gamma.scheduledComplete, false);
  assert.equal(gamma.prnCeiling, null);
  assert.equal(delta.scheduledComplete, false);
  assert.equal(delta.contributions[0].amountPerDose, null);
  const a = row();
  a.unitsPerDose = null;
  const missingDose = reviewMedicationPlan([a], date).totals[0];
  assert.equal(missingDose.scheduledComplete, false);
  assert.equal(missingDose.contributions[0].amountPerDose, null);
});
test("date inclusion is explicit and inclusive; held, stopped and unknown-start sources stay out", () => {
  const a = row();
  for (const d of ["2026-11-01", "2026-11-30"])
    assert.equal(reviewMedicationPlan([a], d).includedRecords, 1);
  for (const d of ["2026-10-31", "2026-12-01"])
    assert.equal(reviewMedicationPlan([a], d).includedRecords, 0);
  assert.equal(
    reviewMedicationPlan([{ ...a, status: "stopped" }], "2026-11-01")
      .includedRecords,
    0,
  );
  assert.equal(
    reviewMedicationPlan([{ ...a, lastOn: null }], "2027-01-01")
      .includedRecords,
    1,
  );
  const reasons = reviewMedicationPlan(ledger().entries, date).eligibility;
  assert.equal(
    reasons.find((r) => r.id === "unknown-start")!.reason,
    "first planned day unknown",
  );
  assert.equal(reasons.find((r) => r.id === "hold")!.reason, "on hold");
});
test("mass conversions are dimensional; route, IU, units, mEq and mmol never merge", () => {
  const a = row();
  a.unitsPerDose = 1;
  const specs = [
    { amount: 0.5, unit: "g" },
    { amount: 500, unit: "mcg" },
    { amount: 1, unit: "mg" },
  ] as const;
  const rows = specs.map((i, n) => ({
    ...a,
    id: String(n),
    ingredients: [{ name: "Exact label", ...i }],
  }));
  assert.equal(reviewMedicationPlan(rows, date).totals[0].scheduled, 501.5);
  const separate = ["IU", "units", "mEq", "mmol"].map((unit, n) =>
    medicationSchema.parse({
      ...a,
      id: `u${n}`,
      ingredients: [{ name: "Exact label", amount: 1, unit }],
    }),
  );
  assert.equal(
    reviewMedicationPlan([...rows, ...separate], date).totals.length,
    5,
  );
  assert.equal(
    reviewMedicationPlan([a, { ...a, id: "route", route: "injection" }], date)
      .totals.length,
    2,
  );
});
test("label case/spacing may match; salts, brands, release labels and aliases are not inferred", () => {
  const a = row(),
    b = {
      ...a,
      id: "b",
      ingredients: [
        { ...a.ingredients[0], name: "  SYNTHETIC   ingredient ALPHA " },
      ],
    };
  assert.equal(reviewMedicationPlan([a, b], date).totals.length, 1);
  assert.equal(
    reviewMedicationPlan(
      [
        a,
        {
          ...b,
          ingredients: [
            { ...b.ingredients[0], name: "Synthetic ingredient Alpha salt" },
          ],
        },
      ],
      date,
    ).totals.length,
    2,
  );
  // Release forms remain explicit contributions; the arithmetic is not an equivalence claim.
  const r = reviewMedicationPlan([a, { ...b, form: "Different release" }], date)
    .totals[0];
  assert.equal(r.contributions[1].form, "Different release");
});
test("multi-ingredient products contribute once per label; duplicate ingredients within a product fail", () => {
  const a = row();
  a.ingredients.push({ name: "Second ingredient", amount: 10, unit: "mg" });
  assert.equal(reviewMedicationPlan([a], date).totals.length, 2);
  assert.equal(
    medicationSchema.safeParse({
      ...a,
      ingredients: [
        a.ingredients[0],
        { ...a.ingredients[0], name: "synthetic ingredient alpha" },
      ],
    }).success,
    false,
  );
});
test("invalid quantities, fractional administration counts, unsupported dimensions and schemas block saving", () => {
  const invalid = [
    { unitsPerDose: 0 },
    { unitsPerDose: -1 },
    { unitsPerDose: Infinity },
    { schedule: { kind: "daily", dosesPerDay: 0.5 } },
    { schedule: { kind: "as-needed", maxDosesPerDay: 1.5 } },
    { schedule: { kind: "weekly", dosesPerWeek: 1 } },
    { route: "guess" },
    { ingredients: [{ name: "A", amount: -2, unit: "mg" }] },
    { ingredients: [{ name: "A", amount: 2, unit: "%" }] },
    { sourceUrl: "javascript:alert(1)" },
    { source: "" },
    { extra: "silently dropped?" },
  ];
  for (const patch of invalid)
    assert.equal(
      medicationSchema.safeParse({ ...row(), ...patch }).success,
      false,
      JSON.stringify(patch),
    );
});
test("calendar errors and reversed date windows fail; absent start/strength remain null", () => {
  for (const day of ["2026-02-29", "2026-11-31", "22/11/2026"])
    assert.throws(() => reviewMedicationPlan([row()], day));
  assert.equal(
    medicationSchema.safeParse({ ...row(), lastOn: "2026-10-31" }).success,
    false,
  );
  assert.equal(
    medicationSchema.parse({ ...row(), startOn: "2024-02-29", lastOn: null })
      .startOn,
    "2024-02-29",
  );
  assert.equal(
    medicationSchema.parse({ ...row(), startOn: null }).startOn,
    null,
  );
});
test("reviewed backup contracts reject wrong module, invalid fields and duplicate record IDs", () => {
  assert.throws(() =>
    parseLedger(
      { ...fixture, kind: "supplements" },
      "medications",
      medicationSchema,
    ),
  );
  assert.throws(() =>
    parseLedger(
      { ...fixture, entries: [row(), row()] },
      "medications",
      medicationSchema,
    ),
  );
  assert.throws(() =>
    parseLedger(
      { ...fixture, entries: [{ ...row(), unitsPerDose: -1 }] },
      "medications",
      medicationSchema,
    ),
  );
});
test("partial known totals retain unresolved contributions and unknown optional limits", () => {
  const a = row(),
    b = { ...a, id: "b", ingredients: [{ ...a.ingredients[0], amount: null }] };
  const r = reviewMedicationPlan([a, b], date).totals[0];
  assert.equal(r.scheduled, 12.5);
  assert.equal(r.scheduledComplete, false);
  assert.equal(r.contributions.length, 2);
  const p = {
    ...a,
    id: "p",
    schedule: { kind: "as-needed" as const, maxDosesPerDay: null },
  };
  assert.equal(reviewMedicationPlan([a, p], date).totals[0].prnCeiling, null);
});
test("CSV and personal report retain review date, source quantities, missingness, exclusion and method", () => {
  const med = ledger(),
    r = createReport(
      { cgm: null, genome: null, bloodwork: null, medications: med },
      "2026-11-21T23:30:00-08:00",
    );
  assert.equal(r.medications!.dailyReview!.day, date);
  assert.equal(r.medications!.dailyReview!.includedRecords, 8);
  assert.equal(r.medications!.entries.length, 10);
  assert.equal(r.genome, null);
  assert.match(r.medications!.limitations, /not observed intake/);
  assert.equal(
    createReport({ cgm: null, genome: null, bloodwork: null }).medications,
    null,
  );
  const csv = toCsv(
    medicationReviewCsvRows(
      [
        {
          ...row(),
          ingredients: [{ name: "=FORMULA", amount: 2, unit: "mg" }],
        },
      ],
      date,
    ),
  );
  assert.match(csv, /'=FORMULA/);
  assert.match(csv, /symphony-medication-plan-v1/);
  assert.match(csv, /Synthetic QA label/);
});
test("5,000 source records reconcile to independent closed-form quantity totals", () => {
  const a = row(),
    rows = Array.from({ length: 5000 }, (_, n) => ({ ...a, id: `scale${n}` })),
    start = performance.now(),
    r = reviewMedicationPlan(rows, date);
  assert.equal(r.includedRecords, 5000);
  assert.equal(r.totals[0].scheduled, 62500);
  assert.equal(r.totals[0].contributions.length, 5000);
  console.log(
    `Medication 5,000-record reference: ${(performance.now() - start).toFixed(1)} ms (local descriptive timing).`,
  );
  assert.throws(() => validateMedicationSet([...rows, a]), /5,000/);
});
