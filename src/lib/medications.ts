import { z } from "zod";
import { sourceUrl } from "./personal-ledgers";
export const MEDICATION_METHOD = "symphony-medication-plan-v1";
export const MEDICATION_LIMITS =
  "Transcribed source plan only, not observed intake, systemic exposure or a recommended dose. Exact ingredient labels are not terminology-normalized; salts, aliases, brands, routes and release forms are not assumed equivalent. No drug interaction, contraindication or pharmacogenomic assessment is performed. No result means no evaluated coverage, not safety.";
export const ROUTES = [
  "oral",
  "topical",
  "inhaled",
  "injection",
  "eye",
  "ear",
  "nasal",
  "rectal",
  "transdermal",
  "other",
] as const;
export const DOSE_UNITS = [
  "tablet",
  "capsule",
  "mL",
  "drop",
  "puff",
  "patch",
  "application",
  "other unit",
] as const;
export const AMOUNT_UNITS = [
  "mcg",
  "mg",
  "g",
  "IU",
  "units",
  "mEq",
  "mmol",
] as const;
const text = z.string().trim().min(1).max(200);
export const medicationDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s;
  }, "Use a real calendar date.");
const positive = z.number().finite().positive().max(1e6);
export const medicationIngredientSchema = z
  .object({
    name: text,
    amount: positive.nullable(),
    unit: z.enum(AMOUNT_UNITS),
  })
  .strict();
export const medicationSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: text,
    route: z.enum(ROUTES),
    form: text,
    doseUnit: z.enum(DOSE_UNITS),
    unitsPerDose: positive.max(10000).nullable(),
    ingredients: z.array(medicationIngredientSchema).min(1).max(20),
    schedule: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("daily"),
          dosesPerDay: positive.int().max(100),
        })
        .strict(),
      z
        .object({
          kind: z.literal("as-needed"),
          maxDosesPerDay: positive.int().max(100).nullable(),
        })
        .strict(),
      z.object({ kind: z.literal("unresolved") }).strict(),
    ]),
    status: z.enum(["active plan", "on hold", "stopped"]),
    startOn: medicationDaySchema.nullable(),
    lastOn: medicationDaySchema.nullable(),
    source: text,
    sourceUrl,
    instructions: z.string().max(4000),
    notes: z.string().max(4000),
    reviewedAt: z.string().datetime({ offset: true }),
    origin: z.literal("manual source transcription"),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.startOn && r.lastOn && r.lastOn < r.startOn)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lastOn"],
        message: "Last planned day cannot precede first planned day.",
      });
    const names = r.ingredients.map((i) => ingredientIdentity(i.name));
    if (new Set(names).size !== names.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ingredients"],
        message:
          "Each exact ingredient label may appear only once per product; duplicate label quantities could be counted twice.",
      });
  });
export type Medication = z.infer<typeof medicationSchema>;
export function ingredientIdentity(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
export function validateMedicationSet(entries: Medication[]) {
  if (entries.length > 5000)
    throw new Error("Use at most 5,000 medication records.");
}
export function medicationEligibility(r: Medication, day: string) {
  if (r.status !== "active plan") return r.status;
  if (!r.startOn) return "first planned day unknown";
  if (day < r.startOn) return "before first planned day";
  if (r.lastOn && day > r.lastOn) return "after last planned day";
  return "included";
}
export function reviewMedicationPlan(entries: Medication[], day: string) {
  medicationDaySchema.parse(day);
  validateMedicationSet(entries);
  type Contribution = {
    recordId: string;
    product: string;
    form: string;
    labelAmount: number | null;
    labelUnit: string;
    doseUnit: string;
    unitsPerDose: number | null;
    amountPerDose: number | null;
    scheduled: number;
    prnCeiling: number | null;
    schedule: Medication["schedule"];
    source: string;
    sourceUrl: string;
    reviewedAt: string;
  };
  type Total = {
    ingredient: string;
    identity: string;
    route: string;
    unit: string;
    scheduled: number;
    scheduledComplete: boolean;
    prnCeiling: number | null;
    contributions: Contribution[];
    repeatedLabel: boolean;
  };
  const totals = new Map<string, Total>(),
    identities = new Map<string, Set<string>>();
  const eligibility = entries.map((r) => ({
    id: r.id,
    name: r.name,
    reason: medicationEligibility(r, day),
  }));
  const included = entries.filter(
    (r) => medicationEligibility(r, day) === "included",
  );
  for (const r of included)
    for (const i of r.ingredients) {
      const identity = ingredientIdentity(i.name),
        baseKey = `${identity}|${r.route}`,
        unit = ["mcg", "mg", "g"].includes(i.unit) ? "mg" : i.unit;
      const amount =
        i.amount === null || r.unitsPerDose === null
          ? null
          : i.amount *
            (i.unit === "g" ? 1000 : i.unit === "mcg" ? 0.001 : 1) *
            r.unitsPerDose;
      const scheduled =
        r.schedule.kind === "daily"
          ? amount === null
            ? 0
            : amount * r.schedule.dosesPerDay
          : 0;
      const prnCeiling =
        r.schedule.kind === "unresolved"
          ? null
          : r.schedule.kind === "as-needed"
            ? r.schedule.maxDosesPerDay === null || amount === null
              ? null
              : amount * r.schedule.maxDosesPerDay
            : 0;
      const key = JSON.stringify([identity, r.route, unit]);
      const row = totals.get(key) || {
        ingredient: i.name,
        identity,
        route: r.route,
        unit,
        scheduled: 0,
        scheduledComplete: true,
        prnCeiling: 0,
        contributions: [],
        repeatedLabel: false,
      };
      row.scheduled += scheduled;
      row.scheduledComplete &&=
        r.schedule.kind !== "unresolved" &&
        !(r.schedule.kind === "daily" && amount === null);
      row.prnCeiling =
        row.prnCeiling === null || prnCeiling === null
          ? null
          : row.prnCeiling + prnCeiling;
      row.contributions.push({
        recordId: r.id,
        product: r.name,
        form: r.form,
        labelAmount: i.amount,
        labelUnit: i.unit,
        doseUnit: r.doseUnit,
        unitsPerDose: r.unitsPerDose,
        amountPerDose: amount,
        scheduled,
        prnCeiling,
        schedule: r.schedule,
        source: r.source,
        sourceUrl: r.sourceUrl,
        reviewedAt: r.reviewedAt,
      });
      totals.set(key, row);
      const ids = identities.get(baseKey) || new Set<string>();
      ids.add(r.id);
      identities.set(baseKey, ids);
    }
  for (const row of totals.values())
    row.repeatedLabel =
      (identities.get(`${row.identity}|${row.route}`)?.size || 0) > 1;
  return {
    method: MEDICATION_METHOD,
    day,
    dateConvention:
      "Calendar date supplied by the user; first/last planned days inclusive. Current record status applies even when inspecting a past date; not historical medication reconciliation.",
    includedRecords: included.length,
    eligibility,
    totals: [...totals.values()].sort((a, b) =>
      JSON.stringify([a.identity, a.route, a.unit]).localeCompare(
        JSON.stringify([b.identity, b.route, b.unit]),
      ),
    ),
    limitations: MEDICATION_LIMITS,
  };
}
export function medicationReviewCsvRows(
  entries: Medication[],
  day: string,
): unknown[][] {
  const review = reviewMedicationPlan(entries, day);
  return [
    [
      "review_day",
      "ingredient_label",
      "route",
      "normalized_unit",
      "known_scheduled_amount_per_day",
      "scheduled_complete",
      "optional_prn_ceiling_per_day",
      "repeated_exact_label",
      "source_record_ids",
      "source_products",
      "source_details_json",
      "method",
      "limitations",
    ],
    ...review.totals.map((r) => [
      day,
      r.ingredient,
      r.route,
      r.unit,
      r.scheduled,
      r.scheduledComplete,
      r.prnCeiling,
      r.repeatedLabel,
      r.contributions.map((c) => c.recordId).join(";"),
      r.contributions.map((c) => c.product).join(";"),
      JSON.stringify(r.contributions),
      MEDICATION_METHOD,
      MEDICATION_LIMITS,
    ]),
  ];
}
