import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildReferenceResolver,
  FHIR_REFERENCE_METHOD,
} from "../src/lib/fhir-references";
import {
  medicalRecordSchema,
  parseFhirReport,
  medicalRecordsCsvRows,
} from "../src/lib/medical-records";
import {
  projectionDigest,
  prepareRecordAssignment,
  reviewRecordAssignments,
} from "../src/lib/record-ownership";
const fixture = () =>
  JSON.parse(
    readFileSync("docs/examples/medical-report-synthetic.fhir.json", "utf8"),
  );
const source = {
  id: "audit-source",
  filename: "synthetic.fhir.json",
  sha256: "a".repeat(64),
  importedAt: "2026-11-26T01:00:00Z",
};
const a = "https://a.example/fhir/",
  b = "https://b.example/fhir/";
const patient = { resourceType: "Patient", id: "same" },
  report = { resourceType: "DiagnosticReport", id: "report" };
const resolver = () =>
  buildReferenceResolver([
    { fullUrl: a + "Patient/same", resource: patient },
    { fullUrl: b + "Patient/same", resource: { ...patient } },
    { fullUrl: a + "DiagnosticReport/report", resource: report },
  ]);
test("relative Patient/id resolves against source service base, never a global ID shortcut", () => {
  const r = resolver();
  assert.equal(
    r.resolve(report, { reference: "Patient/same" }, "Patient", "subject")
      .resource,
    patient,
  );
  assert.deepEqual(r.audit().links, [
    {
      from: a + "DiagnosticReport/report",
      field: "subject",
      reference: "Patient/same",
      target: a + "Patient/same",
      mode: "relative to service base",
    },
  ]);
});
test("a lookalike ID on another server cannot satisfy a missing same-base reference", () => {
  const r = buildReferenceResolver([
    { fullUrl: a + "DiagnosticReport/report", resource: report },
    { fullUrl: b + "Patient/same", resource: patient },
  ]);
  assert.throws(
    () =>
      r.resolve(report, { reference: "Patient/same" }, "Patient", "subject"),
    /Unresolved Patient/,
  );
});
test("absolute and URN references require exact in-Bundle identities without fetching", () => {
  const r = resolver();
  assert.equal(
    r.resolve(report, { reference: b + "Patient/same" }, "Patient", "subject")
      .identity,
    b + "Patient/same",
  );
  assert.throws(
    () =>
      r.resolve(
        report,
        { reference: "https://missing.example/Patient/same" },
        "Patient",
        "subject",
      ),
    /No network request/,
  );
  const urn = "urn:uuid:11111111-1111-4111-8111-111111111111";
  const u = buildReferenceResolver([{ fullUrl: urn, resource: patient }]);
  assert.equal(
    u.resolve(report, { reference: urn }, "Patient", "subject").identity,
    urn,
  );
});
test("relative references under absent, URN or opaque source fullUrls are blocked rather than assigned a guessed base", () => {
  for (const fullUrl of ["", "urn:uuid:report", "https://a.example/opaque"]) {
    const r = buildReferenceResolver([
      { fullUrl, resource: report },
      { fullUrl: a + "Patient/same", resource: patient },
    ]);
    assert.throws(
      () =>
        r.resolve(report, { reference: "Patient/same" }, "Patient", "subject"),
      /base will not be guessed/,
    );
  }
});
test("duplicate fullUrls and RESTful type or ID contradictions block identity indexing", () => {
  assert.throws(
    () =>
      buildReferenceResolver([
        { fullUrl: a + "Patient/same", resource: patient },
        { fullUrl: a + "Patient/same", resource: { ...patient } },
      ]),
    /duplicate/,
  );
  for (const fullUrl of [a + "Patient/other", a + "Observation/same"])
    assert.throws(
      () => buildReferenceResolver([{ fullUrl, resource: patient }]),
      /disagrees/,
    );
});
test("contained, conditional, history, query, fragment and credentialed references are explicitly unsupported", () => {
  const r = resolver();
  for (const reference of [
    "#same",
    "Patient?identifier=x",
    "Patient/same/_history/1",
    a + "Patient/same#fragment",
    "https://user:pass@a.example/fhir/Patient/same",
  ])
    assert.throws(() => r.resolve(report, { reference }, "Patient", "subject"));
  for (const fullUrl of [
    a + "Patient/same/_history/1",
    a + "Patient/same?q=x",
    "javascript:alert(1)",
    a + "Patient/..",
    a + "Patient/%2e%2e",
  ])
    assert.throws(() =>
      buildReferenceResolver([{ fullUrl, resource: patient }]),
    );
});
test("Reference.type must agree with the resolved resource, and identifier-only matching is unavailable", () => {
  const r = resolver();
  for (const type of [
    "Patient",
    "http://hl7.org/fhir/StructureDefinition/Patient",
  ])
    assert.equal(
      r.resolve(
        report,
        { reference: "Patient/same", type },
        "Patient",
        "subject",
      ).resource,
      patient,
    );
  assert.throws(
    () =>
      r.resolve(
        report,
        { reference: "Patient/same", type: "Observation" },
        "Patient",
        "subject",
      ),
    /Reference.type/,
  );
  assert.throws(
    () =>
      r.resolve(
        report,
        { identifier: { system: "https://a.example/mrn", value: "same" } },
        "Patient",
        "subject",
      ),
    /identifier-only/,
  );
  assert.throws(
    () =>
      r.resolve(
        report,
        { reference: "Patient/same" },
        "Observation",
        "result[0]",
      ),
    /Unresolved Observation/,
  );
});
test("projection audit has a hand-specified link denominator and preserves source quantities, dates and absence", () => {
  const f = fixture(),
    r = parseFhirReport(f, source);
  assert.equal(r.referenceAudit?.method, FHIR_REFERENCE_METHOD);
  assert.equal(r.referenceAudit?.links.length, 7);
  assert.deepEqual(
    r.referenceAudit?.links.map((l) => l.field),
    [
      "subject",
      "result[0]",
      "subject",
      "result[1]",
      "subject",
      "result[2]",
      "subject",
    ],
  );
  assert.equal(r.observations[0].quantity?.value, 0);
  assert.equal(r.observations[1].quantity?.comparator, "<");
  assert.equal(r.observations[2].quantity, null);
  assert.equal(r.at, "2026-11-18T09:30:00+08:00");
  const rows = medicalRecordsCsvRows([r]);
  assert.equal(rows[1][16], FHIR_REFERENCE_METHOD);
  assert.equal(JSON.parse(rows[1][17] as string).length, 7);
});
test("missing Patient resources no longer produce a partially resolved projection", () => {
  const f = fixture();
  f.entry.shift();
  assert.throws(() => parseFhirReport(f, source), /Unresolved Patient/);
  const noId = fixture();
  delete noId.entry[0].resource.id;
  assert.throws(() => parseFhirReport(noId, source), /stable logical ID/);
});
test("legacy backup parsing neither adds audit fields nor invalidates existing attribution fingerprints", async () => {
  const r = parseFhirReport(fixture(), source);
  delete r.referenceAudit;
  const old = JSON.parse(JSON.stringify(r));
  const parsed = medicalRecordSchema.parse(old);
  assert.equal(Object.hasOwn(parsed, "referenceAudit"), false);
  assert.equal(await projectionDigest(parsed), await projectionDigest(old));
  const p = JSON.parse(
    readFileSync("docs/examples/family-profiles-synthetic.json", "utf8"),
  ).entries[0];
  p.parents = [];
  p.history = [];
  const assignment = await prepareRecordAssignment(
    old,
    p,
    "Synthetic legacy check",
    source.importedAt,
  );
  assert.equal(
    (await reviewRecordAssignments([parsed], [p], [assignment])).current,
    1,
  );
  assert.equal(
    medicalRecordSchema.safeParse({
      ...r,
      origin: "manual",
      observations: [],
      referenceAudit: { method: FHIR_REFERENCE_METHOD, links: [] },
    }).success,
    false,
  );
});
test("1,000-observation supported limit has exactly 2,001 audited links, with no loss of values", () => {
  const f = fixture(),
    template = f.entry[2];
  f.entry = f.entry.slice(0, 2);
  const d = f.entry[1].resource;
  d.result = [];
  for (let i = 0; i < 1000; i++) {
    const e = structuredClone(template);
    e.resource.id = "o" + i;
    e.fullUrl = "https://synthetic.example/fhir/Observation/o" + i;
    e.resource.valueQuantity.value = i;
    f.entry.push(e);
    d.result.push({ reference: "Observation/o" + i });
  }
  const r = parseFhirReport(f, source);
  assert.equal(r.referenceAudit?.links.length, 2001);
  assert.equal(r.observations.length, 1000);
  assert.equal(r.observations[999].quantity?.value, 999);
});

test("URN Bundle identities resolve only through exact fullUrl references", () => {
  const f = fixture();
  const ids = new Map<string, string>();
  f.entry.forEach((e: any, i: number) => {
    const old = e.resource.resourceType + "/" + e.resource.id;
    const urn = `urn:uuid:00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    ids.set(old, urn);
    e.fullUrl = urn;
  });
  for (const e of f.entry) {
    const r = e.resource;
    if (r.subject) r.subject.reference = ids.get(r.subject.reference);
    if (r.result)
      r.result.forEach((x: any) => (x.reference = ids.get(x.reference)));
  }
  const r = parseFhirReport(f, source);
  assert.equal(r.subject, f.entry[0].fullUrl);
  assert.equal(r.referenceAudit?.links.length, 7);
  assert.ok(r.referenceAudit?.links.every((l) => l.mode === "exact fullUrl"));
});
