import { z } from "zod";
import {
  familyProfileSchema,
  validateFamilyProfiles,
  type FamilyProfile,
} from "./family-history";
import {
  medicalRecordSchema,
  validateRecordSet,
  type MedicalRecord,
} from "./medical-records";
import {
  canonicalProjection,
  personIdentityProjection,
  projectionDigest,
} from "./record-ownership";
import { parseLedger } from "./personal-ledgers";
import { buildReferenceResolver } from "./fhir-references";
import { KEYS } from "./user-data";

export const PERSON_MEDICAL_METHOD = "symphony-person-medical-v1";
const identitySchema = familyProfileSchema
  .innerType()
  .pick({
    id: true,
    name: true,
    birthYear: true,
    lifeStatus: true,
    deathYear: true,
    source: true,
    sourceUrl: true,
  })
  .strict();
export const personNotebookSchema = z
  .object({
    format: z.literal(PERSON_MEDICAL_METHOD),
    owner: z
      .object({
        identity: identitySchema,
        digest: z.string().regex(/^[a-f0-9]{64}$/),
        basis: z.string().trim().min(1).max(4000),
        reviewedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    updatedAt: z.string().datetime({ offset: true }),
    entries: z.array(medicalRecordSchema).max(5000),
  })
  .strict();
export type PersonNotebook = z.infer<typeof personNotebookSchema>;
export type NotebookStorage = Pick<Storage, "getItem" | "setItem">;
export type NotebookSnapshot = { raw: string | null; identity: string };

export function personNotebookKey(personId: string) {
  // JSON escaping is injective over JS strings, including lone surrogates.
  // IDs never enter URLs or filenames. This key is a scope, not a secret.
  z.string().min(1).max(100).parse(personId);
  return `symphony:person-medical:v1:${JSON.stringify(personId)}`;
}
export function notebookIdentity(person: FamilyProfile) {
  return canonicalProjection(
    personIdentityProjection(familyProfileSchema.parse(person)),
  );
}
export function currentNotebookPerson(
  storage: NotebookStorage,
  personId: string,
) {
  const raw = storage.getItem(KEYS.family);
  if (!raw)
    throw new Error(
      "The Family Hub profile is missing. Restore it before continuing.",
    );
  const family = parseLedger(
    JSON.parse(raw),
    "family-profiles",
    familyProfileSchema,
  );
  validateFamilyProfiles(family.entries);
  const person = family.entries.find((p) => p.id === personId);
  if (!person)
    throw new Error(
      "The Family Hub profile is missing. Restore it before continuing.",
    );
  return person;
}
export async function parsePersonNotebook(
  value: unknown,
  personId: string,
): Promise<PersonNotebook> {
  const notebook = personNotebookSchema.parse(value);
  if (notebook.owner.identity.id !== personId)
    throw new Error(
      "This backup belongs to a different person. Select its original profile; ownership cannot be rebound during restoration.",
    );
  if (
    notebook.owner.digest !== (await projectionDigest(notebook.owner.identity))
  )
    throw new Error(
      "The saved identity fingerprint does not match its review snapshot.",
    );
  const ids = new Set(notebook.entries.map((r) => r.id));
  if (ids.size !== notebook.entries.length)
    throw new Error("Notebook source IDs must be unique.");
  validateRecordSet(notebook.entries);
  for (const record of notebook.entries) {
    if (record.origin !== "FHIR R4 subset") continue;
    if (!/^(https?:\/\/|urn:)/i.test(record.subject) || !record.referenceAudit)
      throw new Error(
        "Person notebooks require a declared absolute Patient fullUrl and captured reference audit. Re-import the original Bundle; short Patient IDs alone are not cross-import identity.",
      );
    // Apply the same offline URI/type rules to restored projections as imports.
    buildReferenceResolver([
      { fullUrl: record.subject, resource: { resourceType: "Patient" } },
    ]);
    if (
      !record.referenceAudit.links.some(
        (link) => link.field === "subject" && link.target === record.subject,
      )
    )
      throw new Error(
        "The captured reference audit does not include this source Patient identity.",
      );
  }
  return notebook;
}
export async function reviewNotebookOwner(
  person: FamilyProfile,
  basis: string,
  existing: PersonNotebook | null = null,
  at = new Date().toISOString(),
): Promise<PersonNotebook> {
  const identity = personIdentityProjection(familyProfileSchema.parse(person));
  if (existing) await parsePersonNotebook(existing, person.id);
  return parsePersonNotebook(
    {
      format: PERSON_MEDICAL_METHOD,
      owner: {
        identity,
        digest: await projectionDigest(identity),
        basis,
        reviewedAt: at,
      },
      updatedAt: at,
      entries: existing?.entries || [],
    },
    person.id,
  );
}
export function notebookIsCurrent(
  notebook: PersonNotebook,
  person: FamilyProfile,
) {
  return (
    canonicalProjection(notebook.owner.identity) === notebookIdentity(person)
  );
}
export function appendNotebookSource(
  notebook: PersonNotebook,
  source: MedicalRecord,
  at = new Date().toISOString(),
) {
  if (notebook.entries.some((r) => r.id === source.id))
    throw new Error("This source ID is already saved.");
  const next = personNotebookSchema.parse({
    ...notebook,
    updatedAt: at,
    entries: [...notebook.entries, source],
  });
  validateRecordSet(next.entries);
  return next;
}
export function assertNotebookSnapshot(
  storage: NotebookStorage,
  personId: string,
  expected: NotebookSnapshot,
) {
  if (
    notebookIdentity(currentNotebookPerson(storage, personId)) !==
    expected.identity
  )
    throw new Error(
      "The selected profile changed. Review the current identity before continuing.",
    );
  if (storage.getItem(personNotebookKey(personId)) !== expected.raw)
    throw new Error(
      "This notebook changed in another view. Reload and review it again before saving or exporting.",
    );
}
export async function commitPersonNotebook(
  storage: NotebookStorage,
  personId: string,
  expected: NotebookSnapshot,
  value: unknown,
  isActive: () => boolean = () => true,
) {
  if (!isActive())
    throw new Error(
      "The selected notebook changed. Review it again before saving.",
    );
  assertNotebookSnapshot(storage, personId, expected);
  const next = await parsePersonNotebook(value, personId);
  if (canonicalProjection(next.owner.identity) !== expected.identity)
    throw new Error(
      "The backup's identity review is outdated. Restore the matching Family Hub identity first; the backup is not reassigned automatically.",
    );
  // Check again after hashing. localStorage has no atomic compare-and-swap;
  // this prevents stale-view writes, not simultaneous cross-tab transactions.
  if (!isActive())
    throw new Error(
      "The selected notebook changed. Review it again before saving.",
    );
  assertNotebookSnapshot(storage, personId, expected);
  storage.setItem(personNotebookKey(personId), JSON.stringify(next));
  return next;
}
