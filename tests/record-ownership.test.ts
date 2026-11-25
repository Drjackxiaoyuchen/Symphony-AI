import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import {
  medicalRecordSchema,
  parseFhirReport,
  type MedicalRecord,
} from "../src/lib/medical-records";
import { familyProfileSchema } from "../src/lib/family-history";
import {
  prepareRecordAssignment,
  reviewRecordAssignments,
  personMedicalReport,
  unassignedMedicalRecords,
  recordAssignmentSchema,
  validateAssignmentSet,
  projectionDigest,
  canonicalProjection,
  personIdentityProjection,
  checkOwnershipDraft,
  assignmentCsvRows,
} from "../src/lib/record-ownership";
import { createReport } from "../src/lib/report";
import { parseLedger } from "../src/lib/personal-ledgers";
import { toCsv } from "../src/lib/tabular";
const at = "2026-11-24T01:00:00Z",
  family = JSON.parse(
    readFileSync("docs/examples/family-profiles-synthetic.json", "utf8"),
  );
const person = (id = "person-a") =>
  familyProfileSchema.parse({
    ...family.entries[0],
    id,
    name: `Synthetic ${id}`,
    isIndex: false,
    parents: [],
    history: [],
  });
const record = (id = "record-a"): MedicalRecord =>
  medicalRecordSchema.parse({
    id,
    name: `Synthetic ${id}`,
    kind: "Visit",
    at: null,
    provider: "Synthetic provider",
    sourceUrl: "",
    notes: "SYNTHETIC QA ONLY",
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
const bind = (r = record(), p = person()) =>
  prepareRecordAssignment(r, p, "Synthetic source attribution basis", at);
const wrap = (entries: any[], kind: string) => ({
  format: "symphony-ledger-v1" as const,
  kind,
  updatedAt: at,
  entries,
});
test("canonical projection hashes match an independent Node SHA-256 reference and ignore object insertion order", async () => {
  const value = { z: [0, null, "µg"], a: { c: true, b: "source" } },
    expected = '{"a":{"b":"source","c":true},"z":[0,null,"µg"]}';
  assert.equal(canonicalProjection(value), expected);
  assert.equal(
    await projectionDigest(value),
    createHash("sha256").update(expected, "utf8").digest("hex"),
  );
  assert.equal(
    await projectionDigest({ a: { b: "source", c: true }, z: [0, null, "µg"] }),
    await projectionDigest(value),
  );
  assert.notEqual(
    await projectionDigest([1, 2]),
    await projectionDigest([2, 1]),
  );
  assert.throws(() => canonicalProjection({ x: undefined }));
  assert.throws(() => canonicalProjection(NaN));
});
test("an empty attribution ledger never assigns or copies legacy medical records", async () => {
  const r = record(),
    p = person(),
    review = await reviewRecordAssignments([r], [p], []);
  assert.equal(review.unassignedRecords, 1);
  assert.equal(review.current, 0);
  assert.equal(review.held, 0);
  assert.deepEqual(unassignedMedicalRecords([r], []), [r]);
  assert.equal(
    (await personMedicalReport([r], [p], [], p.id)).records.length,
    0,
  );
});
test("two people and two independent records produce a hand-specified one-record export per person", async () => {
  const r = record(),
    s = record("record-b"),
    p = person(),
    q = person("person-b"),
    a = await bind(r, p),
    b = await bind(s, q),
    before = JSON.stringify([r, s, p, q]);
  const review = await reviewRecordAssignments([r, s], [p, q], [a, b]);
  assert.equal(review.current, 2);
  assert.equal(review.unassignedRecords, 0);
  assert.equal(review.held, 0);
  const out = await personMedicalReport([r, s], [p, q], [a, b], p.id, at);
  assert.deepEqual(
    out.records.map((x) => x.record.id),
    [r.id],
  );
  assert.equal(out.completeForSavedAssignments, true);
  assert.ok(!JSON.stringify(out).includes(s.name));
  assert.ok(!JSON.stringify(out).includes(q.name));
  assert.equal(JSON.stringify([r, s, p, q]), before);
});
test("any source-record change holds the link and cannot leak through a person export or default report", async () => {
  const r = record(),
    p = person(),
    a = await bind(r, p),
    changed = { ...r, provider: "Changed source" };
  const review = await reviewRecordAssignments([changed], [p], [a]);
  assert.equal(review.rows[0].status, "record changed");
  const out = await personMedicalReport([changed], [p], [a], p.id);
  assert.equal(out.records.length, 0);
  assert.equal(out.completeForSavedAssignments, false);
  assert.deepEqual(out.withheld, [
    { recordId: r.id, reason: "record changed" },
  ]);
  assert.equal(unassignedMedicalRecords([changed], [a]).length, 0);
});
test("identity-field changes are held; unrelated family history and relationship notes do not alter the identity projection", async () => {
  const r = record(),
    p = person(),
    a = await bind(r, p);
  assert.equal(
    (await reviewRecordAssignments([r], [{ ...p, name: "Changed alias" }], [a]))
      .rows[0].status,
    "profile changed",
  );
  const changed = {
    ...p,
    notes: "New profile note",
    history: family.entries[0].history,
  };
  assert.deepEqual(
    personIdentityProjection(changed),
    personIdentityProjection(p),
  );
  assert.equal((await reviewRecordAssignments([r], [changed], [a])).current, 1);
});
test("deleted records or profiles remain held; source records never fall back to unassigned automatically", async () => {
  const r = record(),
    p = person(),
    a = await bind(r, p);
  assert.equal(
    (await reviewRecordAssignments([], [p], [a])).rows[0].status,
    "record missing",
  );
  assert.equal(
    (await reviewRecordAssignments([r], [], [a])).rows[0].status,
    "profile missing",
  );
  assert.equal(unassignedMedicalRecords([r], [a]).length, 0);
  await assert.rejects(() => personMedicalReport([r], [], [a], p.id));
});
test("the same exact nonempty Patient reference cannot name different assigned people, even with stale links", async () => {
  const r = record(),
    s = record("other"),
    p = person(),
    q = person("q"),
    a = { ...(await bind(r, p)), sourceSubject: "urn:uuid:synthetic-patient" },
    b = { ...(await bind(s, q)), sourceSubject: "urn:uuid:synthetic-patient" };
  assert.throws(() => validateAssignmentSet([a, b]), /different people/);
  assert.doesNotThrow(() =>
    validateAssignmentSet([a, { ...b, personId: p.id }]),
  );
  assert.doesNotThrow(() =>
    validateAssignmentSet([
      { ...a, sourceSubject: "" },
      { ...b, sourceSubject: "" },
    ]),
  );
});
test("strict assignment backups reject malformed hashes, duplicate IDs, wrong methods and mismatched record IDs", async () => {
  const a = await bind();
  for (const patch of [
    { recordDigest: "weak" },
    { personDigest: "" },
    { id: "another" },
    { basis: " " },
    { method: "AI verified" },
    { extra: "ignored?" },
  ])
    assert.equal(
      recordAssignmentSchema.safeParse({ ...a, ...patch }).success,
      false,
    );
  assert.throws(() =>
    parseLedger(
      wrap([a, a], "record-ownership"),
      "record-ownership",
      recordAssignmentSchema,
    ),
  );
  assert.throws(() => validateAssignmentSet([a, a]));
  assert.throws(() =>
    parseLedger(
      wrap([a], "medical-records"),
      "record-ownership",
      recordAssignmentSchema,
    ),
  );
});
test("a preview is invalidated by any changed reviewed workspace snapshot", () => {
  assert.throws(() => checkOwnershipDraft("before", "after"), /Preview again/);
  assert.doesNotThrow(() => checkOwnershipDraft("same", "same"));
});
test("FHIR quantities, zero, comparison signs, missing values and original units survive current person export", async () => {
  const f = JSON.parse(
      readFileSync("docs/examples/medical-report-synthetic.fhir.json", "utf8"),
    ),
    r = parseFhirReport(f, {
      id: "fhir",
      filename: "synthetic.fhir.json",
      sha256: "a".repeat(64),
      importedAt: at,
    }),
    p = person(),
    a = await bind(r, p),
    out = await personMedicalReport([r], [p], [a], p.id, at);
  assert.deepEqual(out.records[0].record.observations, r.observations);
  assert.equal(out.records[0].record.observations[0].quantity!.value, 0);
  assert.equal(out.records[0].record.observations[1].quantity!.comparator, "<");
  assert.equal(out.records[0].record.observations[2].quantity, null);
  assert.equal(out.records[0].record.sourceSha256, "a".repeat(64));
});
test("the default report withholds attributed records including stale IDs, while preserving explicitly unassigned legacy sources", async () => {
  const r = record(),
    s = record("legacy"),
    p = person(),
    a = await bind(r, p),
    report = createReport(
      {
        cgm: null,
        genome: null,
        bloodwork: null,
        records: wrap(
          [{ ...r, notes: "Changed after attribution" }, s],
          "medical-records",
        ),
        assignments: wrap([a], "record-ownership"),
      },
      at,
    );
  assert.deepEqual(
    report.medicalRecords!.entries.map((x) => x.id),
    [s.id],
  );
  assert.equal(report.medicalRecordOwnership.withheldSourceRecords, 1);
  assert.ok(!JSON.stringify(report).includes(p.name));
  assert.ok(!JSON.stringify(report).includes(a.basis));
  assert.equal(
    createReport(
      {
        cgm: null,
        genome: null,
        bloodwork: null,
        records: wrap([r], "medical-records"),
      },
      at,
    ).medicalRecords!.entries.length,
    1,
  );
  assert.equal(unassignedMedicalRecords([r, s], []).length, 2);
  assert.match(
    toCsv(assignmentCsvRows([{ ...a, name: "=FORMULA" }])),
    /'=FORMULA/,
  );
});
test("duplicate source IDs cannot hide an ambiguous record behind a fingerprint cache", async () => {
  const a = await bind();
  await assert.rejects(
    () => reviewRecordAssignments([record(), record()], [person()], [a]),
    /IDs must be unique/,
  );
});
test("5,000 current links retain exact coverage with one cached person projection", async () => {
  const records = Array.from({ length: 5000 }, (_, i) => record(`r${i}`)),
    p = person(),
    assignments = await Promise.all(records.map((r) => bind(r, p))),
    start = performance.now(),
    review = await reviewRecordAssignments(records, [p], assignments);
  assert.equal(review.current, 5000);
  assert.equal(review.held, 0);
  assert.equal(review.unassignedRecords, 0);
  console.log(
    `Attribution 5,000-link reference: ${(performance.now() - start).toFixed(1)} ms (local descriptive timing, not identity accuracy).`,
  );
  assert.throws(
    () => validateAssignmentSet([...assignments, assignments[0]]),
    /5,000/,
  );
});
