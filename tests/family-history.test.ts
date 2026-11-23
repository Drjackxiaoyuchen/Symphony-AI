import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  checkFamilyDraft,
  familyProfileSchema,
  familyHistorySchema,
  validateFamilyProfiles,
  reviewFamilyProfile,
  familyProfileReport,
  familyHistoryCsvRows,
  familyWorkspaceSummary,
  type FamilyProfile,
} from "../src/lib/family-history";
import { parseLedger } from "../src/lib/personal-ledgers";
import { createReport } from "../src/lib/report";
import { toCsv } from "../src/lib/tabular";
const fixture = JSON.parse(
  readFileSync("docs/examples/family-profiles-synthetic.json", "utf8"),
);
const ledger = () =>
  parseLedger(fixture, "family-profiles", familyProfileSchema);
const profile = () => structuredClone(ledger().entries[1]);
const parent = (
  personId: string,
  kind: "biological" | "guardian" = "biological",
) => ({ personId, kind, source: "Synthetic source", sourceUrl: "" });
test("hand-specified family fixture retains six profiles and per-person source counts without pooling", () => {
  const l = ledger();
  validateFamilyProfiles(l.entries);
  assert.equal(l.entries.length, 6);
  assert.equal(familyWorkspaceSummary(l)!.historyRecords, 6);
  const r = reviewFamilyProfile(l.entries[1]);
  assert.equal(r.totalRecords, 3);
  assert.equal(r.datedRecords, 2);
  assert.equal(r.reportedPresent, 1);
  assert.equal(r.explicitDenials, 1);
  assert.equal(r.unknownAssertions, 1);
  assert.equal(r.conditionGroups.length, 2);
  assert.equal(r.conditionGroups.filter((g) => g.mixedAssertions).length, 1);
  assert.equal(
    reviewFamilyProfile(l.entries[0]).conditionGroups.find(
      (g) => g.key === "example finding alpha",
    )!.mixedAssertions,
    false,
  );
});
test("an empty profile is unknown coverage; missing assertions/dates are not negative findings", () => {
  const p = { ...profile(), history: [] };
  const r = reviewFamilyProfile(p);
  assert.equal(r.totalRecords, 0);
  assert.equal(r.explicitDenials, 0);
  assert.equal(r.conditionGroups.length, 0);
  assert.equal(
    familyHistorySchema.parse(profile().history[2]).assessedOn,
    null,
  );
  assert.equal(
    familyHistorySchema.parse(profile().history[2]).assertion,
    "unknown",
  );
});
test("stable IDs identify people; matching aliases and condition labels never merge owners", () => {
  const a = profile(),
    b = { ...profile(), id: "other-person", history: [] };
  assert.doesNotThrow(() => validateFamilyProfiles([a, b]));
  assert.equal(familyProfileReport([a, b], b.id).person.history.length, 0);
  const p = {
    ...a,
    history: [
      a.history[0],
      { ...a.history[1], condition: "Example finding Alpha syndrome" },
    ],
  };
  assert.equal(reviewFamilyProfile(p).conditionGroups.length, 2);
});
test("dangling parent references block restoration or deletion rather than dropping links", () => {
  const l = ledger();
  assert.throws(
    () => validateFamilyProfiles(l.entries.filter((p) => p.id !== "person-a")),
    /unresolved/,
  );
  const p = { ...profile(), parents: [parent("missing")] };
  assert.throws(() => validateFamilyProfiles([p]), /unresolved/);
});
test("directed ancestry/caregiver cycles are blocked; self-links and duplicate links fail schema", () => {
  const a = { ...profile(), id: "a", birthYear: null, parents: [parent("b")] },
    b = {
      ...profile(),
      id: "b",
      birthYear: null,
      parents: [parent("a", "guardian")],
    };
  assert.throws(() => validateFamilyProfiles([a, b]), /directed cycle/);
  assert.equal(
    familyProfileSchema.safeParse({ ...a, parents: [parent("a")] }).success,
    false,
  );
  assert.equal(
    familyProfileSchema.safeParse({
      ...a,
      parents: [parent("b"), parent("b", "guardian")],
    }).success,
    false,
  );
});
test("two biological parents, explicit social links and missing parentage remain distinct", () => {
  const a = profile();
  assert.equal(
    familyProfileSchema.safeParse({
      ...a,
      parents: [parent("b"), parent("c"), parent("d")],
    }).success,
    false,
  );
  assert.equal(
    familyProfileSchema.safeParse({
      ...a,
      parents: [parent("b"), parent("c"), parent("d", "guardian")],
    }).success,
    true,
  );
  const p = { ...a, id: "parent", birthYear: 2000, history: [] },
    child = {
      ...a,
      id: "child",
      birthYear: 1990,
      history: [],
      parents: [parent("parent", "guardian")],
    };
  assert.doesNotThrow(() => validateFamilyProfiles([p, child]));
  assert.throws(
    () =>
      validateFamilyProfiles([p, { ...child, parents: [parent("parent")] }]),
    /earlier birth year/,
  );
});
test("common ancestry and an undirected pedigree loop are valid when the directed graph is acyclic", () => {
  const a = {
      ...profile(),
      id: "a",
      birthYear: null,
      history: [],
      parents: [],
    },
    b = { ...a, id: "b", parents: [parent("a")] },
    c = { ...a, id: "c", parents: [parent("a")] },
    d = { ...a, id: "d", parents: [parent("b"), parent("c")] };
  assert.doesNotThrow(() => validateFamilyProfiles([d, c, b, a]));
});
test("index-person uniqueness and backup identity contracts apply before replacement", () => {
  const l = ledger();
  assert.throws(
    () =>
      validateFamilyProfiles([
        ...l.entries,
        { ...profile(), id: "second-index", isIndex: true },
      ]),
    /at most one index/,
  );
  assert.throws(() =>
    parseLedger(
      { ...fixture, entries: [profile(), profile()] },
      "family-profiles",
      familyProfileSchema,
    ),
  );
  assert.throws(() =>
    parseLedger(
      { ...fixture, kind: "medications" },
      "family-profiles",
      familyProfileSchema,
    ),
  );
});
test("onset age zero survives, unknown stays null and coarse source chronology is gated", () => {
  const h = ledger().entries[0].history[1];
  assert.equal(familyHistorySchema.parse(h).onsetAgeYears, 0);
  assert.equal(
    familyHistorySchema.parse(profile().history[2]).onsetAgeYears,
    null,
  );
  assert.equal(
    familyHistorySchema.safeParse({ ...h, assertion: "explicitly denied" })
      .success,
    false,
  );
  assert.equal(
    familyProfileSchema.safeParse({
      ...profile(),
      history: [{ ...h, assessedOn: "1950-01-01" }],
    }).success,
    false,
  );
  assert.equal(
    familyProfileSchema.safeParse({
      ...profile(),
      history: [{ ...h, onsetAgeYears: 100 }],
    }).success,
    false,
  );
  assert.equal(
    familyProfileSchema.safeParse({
      ...profile(),
      lifeStatus: "living",
      deathYear: 2020,
    }).success,
    false,
  );
  assert.equal(
    familyProfileSchema.safeParse({ ...profile(), birthYear: 2999 }).success,
    false,
  );
});
test("calendar, capture and strict schema validation block impossible or unsupported inputs", () => {
  const h = profile().history[0];
  for (const s of ["2026-02-29", "2026-11-31", "2026-11-24"])
    assert.equal(
      familyHistorySchema.safeParse({ ...h, assessedOn: s }).success,
      false,
    );
  assert.equal(
    familyHistorySchema.parse({ ...h, assessedOn: "2024-02-29" }).assessedOn,
    "2024-02-29",
  );
  assert.equal(
    familyHistorySchema.safeParse({ ...h, sourceUrl: "javascript:alert(1)" })
      .success,
    false,
  );
  assert.equal(
    familyProfileSchema.safeParse({ ...profile(), geneticRisk: 99 }).success,
    false,
  );
});
test("selected-person export never expands other profiles or their private histories", () => {
  const l = ledger();
  l.entries[1].name = "EXCLUDED_PERSON_SENTINEL";
  l.entries[1].history[0].notes = "EXCLUDED_HISTORY_SENTINEL";
  const r = familyProfileReport(
      l.entries,
      "person-index",
      "2026-11-23T01:00:00Z",
    ),
    json = JSON.stringify(r);
  assert.equal(r.person.id, "person-index");
  assert.equal(r.person.history.length, 2);
  assert.ok(!json.includes("EXCLUDED_PERSON_SENTINEL"));
  assert.ok(!json.includes("EXCLUDED_HISTORY_SENTINEL"));
  assert.equal(r.person.parents.length, 3);
  assert.throws(
    () => familyProfileReport(l.entries, "missing"),
    /existing person/,
  );
});
test("the main personal report includes counts only, and selected CSV preserves source nulls and formula safety", () => {
  const l = ledger(),
    r = createReport({ cgm: null, genome: null, bloodwork: null, family: l });
  assert.equal(r.familyWorkspace!.profiles, 6);
  assert.equal(r.familyWorkspace!.profileContentsIncluded, false);
  assert.ok(!JSON.stringify(r).includes("Example Parent A"));
  assert.ok(!JSON.stringify(r).includes("Example finding Alpha"));
  assert.equal(r.genome, null);
  assert.equal(
    createReport({ cgm: null, genome: null, bloodwork: null }).familyWorkspace,
    null,
  );
  const p = profile();
  p.history[0].condition = "=FORMULA";
  assert.match(toCsv(familyHistoryCsvRows(p)), /'=FORMULA/);
  assert.equal(familyHistoryCsvRows(p)[3][4], null);
  assert.match(JSON.stringify(r.familyWorkspace), /excluded/);
});
test("200 profiles and 10,000 source records retain exact counts under bounded linear validation", () => {
  const a = profile(),
    h = a.history[0],
    profiles: FamilyProfile[] = Array.from({ length: 200 }, (_, i) => ({
      ...a,
      id: `p${i}`,
      birthYear: null,
      parents: i ? [parent(`p${i - 1}`, "guardian")] : [],
      history: Array.from({ length: 50 }, (_, j) => ({ ...h, id: `h${j}` })),
    }));
  const start = performance.now();
  validateFamilyProfiles(profiles);
  const summary = familyWorkspaceSummary({
    format: "symphony-ledger-v1",
    kind: "family-profiles",
    updatedAt: "2026-11-23T01:00:00Z",
    entries: profiles,
  });
  assert.equal(summary!.historyRecords, 10000);
  assert.equal(summary!.profiles, 200);
  console.log(
    `Family 200-profile / 10,000-history reference: ${(performance.now() - start).toFixed(1)} ms (local descriptive timing).`,
  );
  assert.throws(
    () => validateFamilyProfiles([...profiles, { ...a, id: "over" }]),
    /200/,
  );
  assert.throws(
    () =>
      validateFamilyProfiles([
        {
          ...profiles[0],
          history: [...profiles[0].history, { ...h, id: "extra" }],
        },
        ...profiles.slice(1),
      ]),
    /10,000/,
  );
});

test("stale snapshots and a changed selected person cannot reassign a draft history", () => {
  assert.throws(
    () => checkFamilyDraft("old", "new", "person-a", "person-a"),
    /changed while/,
  );
  assert.throws(
    () => checkFamilyDraft("same", "same", "person-a", "person-b"),
    /no record was reassigned/,
  );
  assert.doesNotThrow(() => checkFamilyDraft(null, null));
  assert.doesNotThrow(() =>
    checkFamilyDraft("same", "same", "person-a", "person-a"),
  );
});
