import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  familyProfileSchema,
  type FamilyProfile,
} from "../src/lib/family-history";
import { parseFhirReport } from "../src/lib/medical-records";
import { canonicalProjection } from "../src/lib/record-ownership";
import { KEYS } from "../src/lib/user-data";
import {
  PERSON_MEDICAL_METHOD,
  personNotebookKey,
  notebookIdentity,
  parsePersonNotebook,
  reviewNotebookOwner,
  notebookIsCurrent,
  appendNotebookSource,
  assertNotebookSnapshot,
  commitPersonNotebook,
  type NotebookSnapshot,
} from "../src/lib/person-medical";
const at = "2026-11-28T01:00:00Z";
const fixture = readFileSync(
  "docs/examples/medical-report-synthetic.fhir.json",
  "utf8",
);
const family = JSON.parse(
  readFileSync("docs/examples/family-profiles-synthetic.json", "utf8"),
);
const person = (id = "person-a"): FamilyProfile =>
  familyProfileSchema.parse({
    ...family.entries[0],
    id,
    name: `Synthetic ${id}`,
    isIndex: false,
    parents: [],
    history: [],
  });
const source = (id = "same-source", patientId = "synthetic-person") => {
  const text = fixture.replaceAll("synthetic-person", patientId);
  return parseFhirReport(JSON.parse(text), {
    id,
    filename: "synthetic.fhir.json",
    sha256: createHash("sha256").update(text).digest("hex"),
    importedAt: at,
  });
};
function store(profiles = [person(), person("person-b")]) {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
  function setFamily(entries: FamilyProfile[]) {
    storage.setItem(
      KEYS.family,
      JSON.stringify({
        format: "symphony-ledger-v1",
        kind: "family-profiles",
        updatedAt: at,
        entries,
      }),
    );
  }
  setFamily(profiles);
  const snapshot = (p = profiles[0]): NotebookSnapshot => ({
    raw: storage.getItem(personNotebookKey(p.id)),
    identity: notebookIdentity(p),
  });
  return { storage, setFamily, snapshot, map };
}
test("person store keys are distinct for punctuation, escapes, Unicode and unpaired surrogates", () => {
  const ids = [
    "a",
    '"a"',
    "a/b",
    "a:b",
    "a%2Fb",
    "a\\b",
    "人",
    "\ud800",
    "\ufffd",
  ];
  assert.equal(new Set(ids.map(personNotebookKey)).size, ids.length);
  assert.throws(() => personNotebookKey(""));
  assert.throws(() => personNotebookKey("x".repeat(101)));
});
test("review fingerprint agrees with independent Node SHA-256; unknown fields and altered snapshots reject", async () => {
  const n = await reviewNotebookOwner(
    person(),
    "Synthetic source attribution",
    null,
    at,
  );
  assert.equal(n.format, PERSON_MEDICAL_METHOD);
  assert.equal(
    n.owner.digest,
    createHash("sha256")
      .update(canonicalProjection(n.owner.identity))
      .digest("hex"),
  );
  assert.deepEqual(
    await parsePersonNotebook(JSON.parse(JSON.stringify(n)), person().id),
    n,
  );
  await assert.rejects(parsePersonNotebook({ ...n, extra: true }, person().id));
  await assert.rejects(
    parsePersonNotebook(
      {
        ...n,
        owner: {
          ...n.owner,
          identity: { ...n.owner.identity, name: "Changed snapshot" },
        },
      },
      person().id,
    ),
    /fingerprint/,
  );
  await assert.rejects(reviewNotebookOwner(person(), " ", null, at));
});
test("two people can retain distinct Patient sources and identical local source IDs without touching legacy stores", async () => {
  const s = store(),
    a = person(),
    b = person("person-b");
  s.storage.setItem(KEYS.records, "preserve legacy source bytes");
  s.storage.setItem(KEYS.ownership, "preserve legacy attribution bytes");
  const an = appendNotebookSource(
    await reviewNotebookOwner(a, "Reviewed source A", null, at),
    source("same-source", "patient-a"),
    at,
  );
  const bn = appendNotebookSource(
    await reviewNotebookOwner(b, "Reviewed source B", null, at),
    source("same-source", "patient-b"),
    at,
  );
  await commitPersonNotebook(s.storage, a.id, s.snapshot(a), an);
  const aBytes = s.storage.getItem(personNotebookKey(a.id));
  await commitPersonNotebook(s.storage, b.id, s.snapshot(b), bn);
  assert.equal(s.storage.getItem(personNotebookKey(a.id)), aBytes);
  assert.equal(
    (await parsePersonNotebook(JSON.parse(aBytes!), a.id)).entries[0].subject,
    "https://synthetic.example/fhir/Patient/patient-a",
  );
  assert.equal(
    (
      await parsePersonNotebook(
        JSON.parse(s.storage.getItem(personNotebookKey(b.id))!),
        b.id,
      )
    ).entries[0].subject,
    "https://synthetic.example/fhir/Patient/patient-b",
  );
  assert.equal(s.storage.getItem(KEYS.records), "preserve legacy source bytes");
  assert.equal(
    s.storage.getItem(KEYS.ownership),
    "preserve legacy attribution bytes",
  );
});
test("wrong-owner, global ledger and mismatched reviewed identity backups cannot replace the selected store", async () => {
  const s = store(),
    a = person(),
    b = person("person-b");
  const aNotebook = await reviewNotebookOwner(a, "Reviewed A", null, at),
    bNotebook = await reviewNotebookOwner(b, "Reviewed B", null, at);
  await commitPersonNotebook(s.storage, b.id, s.snapshot(b), bNotebook);
  const before = s.storage.getItem(personNotebookKey(b.id));
  await assert.rejects(
    commitPersonNotebook(s.storage, b.id, s.snapshot(b), aNotebook),
    /different person/,
  );
  await assert.rejects(
    commitPersonNotebook(s.storage, b.id, s.snapshot(b), {
      format: "symphony-ledger-v1",
      kind: "medical-records",
      updatedAt: at,
      entries: [],
    }),
  );
  const changed = await reviewNotebookOwner(
    { ...b, birthYear: 1900 },
    "Other identity",
    null,
    at,
  );
  await assert.rejects(
    commitPersonNotebook(s.storage, b.id, s.snapshot(b), changed),
    /outdated/,
  );
  assert.equal(s.storage.getItem(personNotebookKey(b.id)), before);
});
test("different Patient references, duplicate sources and duplicate IDs are held within a notebook", async () => {
  const n = await reviewNotebookOwner(person(), "Reviewed patient", null, at),
    one = appendNotebookSource(n, source(), at);
  assert.throws(() => appendNotebookSource(one, source()), /already saved/);
  assert.throws(
    () => appendNotebookSource(one, source("other-id")),
    /already|duplicate/i,
  );
  assert.throws(
    () => appendNotebookSource(one, source("other-id", "other-patient")),
    /patient|subject/i,
  );
  await assert.rejects(
    parsePersonNotebook(
      { ...one, entries: [one.entries[0], one.entries[0]] },
      person().id,
    ),
    /unique/,
  );
});
test("cross-import unqualified or malformed Patient identities and absent/inconsistent audits cannot enter a person notebook", async () => {
  const n = await reviewNotebookOwner(person(), "Reviewed patient", null, at),
    r = source();
  await assert.rejects(
    parsePersonNotebook(
      { ...n, entries: [{ ...r, subject: "Patient/synthetic-person" }] },
      person().id,
    ),
    /absolute Patient fullUrl/,
  );
  const { referenceAudit, ...legacy } = r;
  await assert.rejects(
    parsePersonNotebook({ ...n, entries: [legacy] }, person().id),
    /captured reference audit/,
  );
  for (const subject of [
    "http://",
    "urn:",
    "https://user:password@example.org/fhir/Patient/x",
    "https://synthetic.example/fhir/Observation/x",
  ])
    await assert.rejects(
      parsePersonNotebook({ ...n, entries: [{ ...r, subject }] }, person().id),
    );
  await assert.rejects(
    parsePersonNotebook(
      {
        ...n,
        entries: [{ ...r, referenceAudit: { ...r.referenceAudit, links: [] } }],
      },
      person().id,
    ),
    /audit does not include/,
  );
});
test("identity edits hold writes and exports; non-identity histories do not; explicit same-owner renewal preserves sources", async () => {
  const p = person(),
    s = store(),
    n = appendNotebookSource(
      await reviewNotebookOwner(p, "Original identity review", null, at),
      source(),
      at,
    );
  await commitPersonNotebook(s.storage, p.id, s.snapshot(p), n);
  const previous = s.snapshot(p),
    changed = { ...p, name: "Changed synthetic name" };
  s.setFamily([changed, person("person-b")]);
  assert.equal(notebookIsCurrent(n, changed), false);
  assert.throws(
    () => assertNotebookSnapshot(s.storage, p.id, previous),
    /profile changed/,
  );
  await assert.rejects(
    commitPersonNotebook(s.storage, p.id, previous, n),
    /profile changed/,
  );
  const renewed = await reviewNotebookOwner(
    changed,
    "Rechecked existing sources against changed profile",
    n,
    at,
  );
  assert.deepEqual(renewed.entries, n.entries);
  await commitPersonNotebook(s.storage, p.id, s.snapshot(changed), renewed);
  const nonIdentity = {
    ...changed,
    notes: "New nonidentity context",
    reviewedAt: "2026-11-28T02:00:00Z",
  };
  s.setFamily([nonIdentity]);
  assert.equal(notebookIsCurrent(renewed, nonIdentity), true);
  assert.doesNotThrow(() =>
    assertNotebookSnapshot(s.storage, p.id, s.snapshot(changed)),
  );
});
test("missing profiles and unreadable Family Hub data never become an empty authorized notebook", async () => {
  const p = person(),
    s = store(),
    n = await reviewNotebookOwner(p, "Reviewed", null, at),
    expected = s.snapshot(p);
  s.setFamily([person("person-b")]);
  await assert.rejects(
    commitPersonNotebook(s.storage, p.id, expected, n),
    /missing/,
  );
  s.storage.setItem(KEYS.family, "{invalid");
  await assert.rejects(commitPersonNotebook(s.storage, p.id, expected, n));
  assert.equal(s.storage.getItem(personNotebookKey(p.id)), null);
});
test("stale source/restore/export snapshots and notebook-switch cancellation cannot overwrite changed bytes", async () => {
  const p = person(),
    s = store(),
    initial = s.snapshot(p),
    n = await reviewNotebookOwner(p, "Reviewed", null, at);
  await commitPersonNotebook(s.storage, p.id, initial, n);
  const saved = s.storage.getItem(personNotebookKey(p.id));
  await assert.rejects(
    commitPersonNotebook(
      s.storage,
      p.id,
      initial,
      appendNotebookSource(n, source()),
    ),
    /another view/,
  );
  assert.throws(
    () => assertNotebookSnapshot(s.storage, p.id, initial),
    /another view/,
  );
  let activeChecks = 0;
  await assert.rejects(
    commitPersonNotebook(
      s.storage,
      p.id,
      s.snapshot(p),
      n,
      () => ++activeChecks === 1,
    ),
    /selected notebook changed/,
  );
  assert.equal(s.storage.getItem(personNotebookKey(p.id)), saved);
});
test("round-trip preserves exact zero, comparator, absence, time, source hash and reference audit; reviewed repair changes only the selected key", async () => {
  const p = person(),
    s = store(),
    r = source(),
    n = appendNotebookSource(
      await reviewNotebookOwner(p, "Reviewed", null, at),
      r,
      at,
    );
  const path = personNotebookKey(p.id);
  s.storage.setItem(path, "{unreadable notebook");
  await commitPersonNotebook(
    s.storage,
    p.id,
    s.snapshot(p),
    JSON.parse(JSON.stringify(n)),
  );
  const restored = await parsePersonNotebook(
    JSON.parse(s.storage.getItem(path)!),
    p.id,
  );
  assert.deepEqual(restored.entries, [r]);
  assert.equal(restored.entries[0].observations[0].quantity?.value, 0);
  assert.equal(restored.entries[0].observations[1].quantity?.comparator, "<");
  assert.ok(restored.entries[0].observations[2].absentReason);
  assert.equal(restored.entries[0].at, "2026-11-18T09:30:00+08:00");
  assert.equal(s.storage.getItem(personNotebookKey("person-b")), null);
});
