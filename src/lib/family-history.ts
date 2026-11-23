import { z } from "zod";
import { sourceUrl, type Ledger } from "./personal-ledgers";
export const FAMILY_METHOD = "symphony-family-history-v1";
export const FAMILY_LIMITS =
  "Manual source history and entered relationships only. Missing records are not negative findings. No genetic relatedness, inheritance, penetrance, disease risk, screening completeness or treatment advice is inferred. Profiles separate Family Hub histories; existing personal imports/ledgers are unassigned and are not migrated or analyzed here. Browser storage is unencrypted and is not access control.";
const text = z.string().trim().min(1).max(200),
  id = z.string().min(1).max(100);
const instant = z.string().datetime({ offset: true });
export const familyDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s;
  }, "Use a real calendar date.");
export const PARENT_KINDS = [
  "biological",
  "adoptive",
  "step",
  "guardian",
] as const;
export const ASSERTIONS = [
  "reported present",
  "explicitly denied",
  "unknown",
] as const;
export const familyHistorySchema = z
  .object({
    id,
    condition: text,
    assertion: z.enum(ASSERTIONS),
    assessedOn: familyDaySchema.nullable(),
    onsetAgeYears: z.number().int().min(0).max(150).nullable(),
    source: text,
    sourceUrl,
    notes: z.string().max(4000),
    capturedAt: instant,
  })
  .strict()
  .superRefine((r, c) => {
    if (r.assertion !== "reported present" && r.onsetAgeYears !== null)
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["onsetAgeYears"],
        message: "Onset age applies only to a reported-present condition.",
      });
    if (
      r.assessedOn &&
      Number.isFinite(Date.parse(r.capturedAt)) &&
      r.assessedOn > new Date(r.capturedAt).toISOString().slice(0, 10)
    )
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assessedOn"],
        message: "Assessment date cannot follow capture date (UTC).",
      });
  });
export const familyProfileSchema = z
  .object({
    id,
    name: text,
    isIndex: z.boolean(),
    birthYear: z.number().int().min(1000).max(9999).nullable(),
    lifeStatus: z.enum(["unknown", "living", "deceased"]),
    deathYear: z.number().int().min(1000).max(9999).nullable(),
    source: text,
    sourceUrl,
    notes: z.string().max(4000),
    reviewedAt: instant,
    parents: z
      .array(
        z
          .object({
            personId: id,
            kind: z.enum(PARENT_KINDS),
            source: text,
            sourceUrl,
          })
          .strict(),
      )
      .max(20),
    history: z.array(familyHistorySchema).max(1000),
  })
  .strict()
  .superRefine((r, c) => {
    const year = new Date(r.reviewedAt).getUTCFullYear();
    if (
      (r.birthYear !== null && r.birthYear > year) ||
      (r.deathYear !== null && r.deathYear > year)
    )
      c.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Birth/death year cannot follow the source-check year (UTC).",
      });
    if (
      r.deathYear !== null &&
      (r.lifeStatus !== "deceased" ||
        (r.birthYear !== null && r.deathYear < r.birthYear))
    )
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deathYear"],
        message:
          "Death year needs deceased status and cannot precede birth year.",
      });
    if (
      new Set(r.parents.map((p) => p.personId)).size !== r.parents.length ||
      r.parents.some((p) => p.personId === r.id)
    )
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parents"],
        message:
          "Parent/caregiver links must be distinct and cannot refer to this person.",
      });
    if (r.parents.filter((p) => p.kind === "biological").length > 2)
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parents"],
        message: "This model supports at most two entered biological parents.",
      });
    if (new Set(r.history.map((h) => h.id)).size !== r.history.length)
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["history"],
        message: "History record IDs must be unique within a profile.",
      });
    for (const h of r.history) {
      if (
        r.birthYear !== null &&
        h.assessedOn &&
        Number(h.assessedOn.slice(0, 4)) < r.birthYear
      )
        c.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["history", h.id],
          message: "Assessment year precedes the entered birth year.",
        });
      const finalYear = h.assessedOn
        ? Number(h.assessedOn.slice(0, 4))
        : r.deathYear;
      if (
        r.birthYear !== null &&
        finalYear !== null &&
        h.onsetAgeYears !== null &&
        h.onsetAgeYears >
          Math.min(finalYear, r.deathYear ?? finalYear) - r.birthYear
      )
        c.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["history", h.id],
          message:
            "Reported onset age exceeds the entered year context. Review the source fields.",
        });
    }
  });
export type FamilyProfile = z.infer<typeof familyProfileSchema>;
export type FamilyHistory = z.infer<typeof familyHistorySchema>;
export const conditionKey = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, " ");
export function validateFamilyProfiles(profiles: FamilyProfile[]) {
  if (profiles.length > 200)
    throw new Error("Use at most 200 Family Hub profiles.");
  if (new Set(profiles.map((p) => p.id)).size !== profiles.length)
    throw new Error("Profile IDs must be unique.");
  if (profiles.filter((p) => p.isIndex).length > 1)
    throw new Error(
      "Choose at most one index person. Unmark the existing index before changing it.",
    );
  if (profiles.reduce((n, p) => n + p.history.length, 0) > 10000)
    throw new Error(
      "Use at most 10,000 family-history records across profiles.",
    );
  const people = new Map(profiles.map((p) => [p.id, p])),
    children = new Map<string, string[]>(),
    indegree = new Map(profiles.map((p) => [p.id, p.parents.length]));
  for (const child of profiles)
    for (const link of child.parents) {
      const parent = people.get(link.personId);
      if (!parent)
        throw new Error(
          `Parent/caregiver reference ${link.personId} is unresolved. Remove dependent links before deleting a profile.`,
        );
      if (
        link.kind === "biological" &&
        parent.birthYear !== null &&
        child.birthYear !== null &&
        parent.birthYear >= child.birthYear
      )
        throw new Error(
          "An entered biological parent must have an earlier birth year when both years are known.",
        );
      const rows = children.get(parent.id) || [];
      rows.push(child.id);
      children.set(parent.id, rows);
    }
  const queue = profiles.filter((p) => p.parents.length === 0).map((p) => p.id);
  let visited = 0;
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i];
    visited++;
    for (const child of children.get(key) || []) {
      const next = indegree.get(child)! - 1;
      indegree.set(child, next);
      if (next === 0) queue.push(child);
    }
  }
  if (visited !== profiles.length)
    throw new Error(
      "Entered parent/caregiver links contain a directed cycle. Review the relationships; no automatic repair was applied.",
    );
}
export function reviewFamilyProfile(profile: FamilyProfile) {
  const groups = new Map<string, FamilyHistory[]>();
  for (const h of profile.history) {
    const key = conditionKey(h.condition),
      rows = groups.get(key) || [];
    rows.push(h);
    groups.set(key, rows);
  }
  const conditionGroups = [...groups]
    .map(([key, rows]) => ({
      key,
      label: rows[0].condition,
      recordIds: rows.map((r) => r.id),
      mixedAssertions:
        rows.some((r) => r.assertion === "reported present") &&
        rows.some((r) => r.assertion === "explicitly denied"),
      unknownTiming: rows.some((r) => r.assessedOn === null),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return {
    method: FAMILY_METHOD,
    personId: profile.id,
    totalRecords: profile.history.length,
    datedRecords: profile.history.filter((h) => h.assessedOn !== null).length,
    reportedPresent: profile.history.filter(
      (h) => h.assertion === "reported present",
    ).length,
    explicitDenials: profile.history.filter(
      (h) => h.assertion === "explicitly denied",
    ).length,
    unknownAssertions: profile.history.filter((h) => h.assertion === "unknown")
      .length,
    conditionGroups,
    limitations: FAMILY_LIMITS,
  };
}
export function familyProfileReport(
  profiles: FamilyProfile[],
  personId: string,
  generatedAt = new Date().toISOString(),
) {
  validateFamilyProfiles(profiles);
  const person = profiles.find((p) => p.id === personId);
  if (!person) throw new Error("Select an existing person before export.");
  // Export this person's explicit record only: other people's names/histories are not expanded through relationship IDs.
  return {
    format: "symphony-family-person-report-v1",
    product: "Symphony AI",
    generatedAt,
    method: FAMILY_METHOD,
    person,
    review: reviewFamilyProfile(person),
    scope:
      "Selected Family Hub profile only. Parent/caregiver IDs and source text remain as entered; no other profile is expanded. Existing personal imports and other ledgers are excluded.",
    limitations: FAMILY_LIMITS,
  };
}
export function familyHistoryCsvRows(person: FamilyProfile): unknown[][] {
  return [
    [
      "profile_id",
      "profile_label",
      "condition_label",
      "assertion",
      "assessed_on",
      "reported_onset_age_years",
      "source",
      "source_url",
      "captured_at",
      "notes",
      "method",
    ],
    ...person.history.map((h) => [
      person.id,
      person.name,
      h.condition,
      h.assertion,
      h.assessedOn,
      h.onsetAgeYears,
      h.source,
      h.sourceUrl,
      h.capturedAt,
      h.notes,
      FAMILY_METHOD,
    ]),
  ];
}
export function familyWorkspaceSummary(
  ledger: Ledger<FamilyProfile> | null | undefined,
) {
  if (!ledger) return null;
  validateFamilyProfiles(ledger.entries);
  return {
    method: FAMILY_METHOD,
    profiles: ledger.entries.length,
    historyRecords: ledger.entries.reduce((n, p) => n + p.history.length, 0),
    profileContentsIncluded: false,
    scope:
      "Family profile identities, relationship details and histories are excluded from this personal report. Export a selected person's report separately in Family Hub.",
    limitations: FAMILY_LIMITS,
  };
}

export function checkFamilyDraft(
  expected: string | null,
  current: string | null,
  draftOwner?: string | null,
  currentOwner?: string,
) {
  if (draftOwner !== undefined && draftOwner !== currentOwner)
    throw new Error(
      "Selected person changed. Reopen the history form for the current person; no record was reassigned.",
    );
  if (expected !== current)
    throw new Error(
      "Family records changed while this form was open. Reopen the form against the current saved data before saving; your draft has been retained.",
    );
}
