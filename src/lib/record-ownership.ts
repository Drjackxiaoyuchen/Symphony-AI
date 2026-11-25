import { z } from "zod";
import {
  medicalRecordSchema,
  validateRecordSet,
  type MedicalRecord,
} from "./medical-records";
import {
  familyProfileSchema,
  validateFamilyProfiles,
  type FamilyProfile,
} from "./family-history";
export const OWNERSHIP_METHOD = "symphony-record-ownership-v1";
export const OWNERSHIP_LIMITS =
  "Explicit user attribution, not authenticated patient matching, consent, access control or clinical validation. Fingerprints detect changes in declared projections, not truth or source authenticity. Original medical/family records are not moved or rewritten. Existing personal imports outside Medical Records remain unassigned.";
const hash = z.string().regex(/^[a-f0-9]{64}$/),
  id = z.string().min(1).max(100),
  text = z.string().trim().min(1).max(300);
export const recordAssignmentSchema = z
  .object({
    id,
    recordId: id,
    personId: id,
    name: text,
    personName: text,
    recordDigest: hash,
    personDigest: hash,
    sourceSubject: z.string().max(2000),
    basis: z.string().trim().min(1).max(4000),
    reviewedAt: z.string().datetime({ offset: true }),
    method: z.literal(OWNERSHIP_METHOD),
  })
  .strict()
  .refine(
    (r) => r.id === r.recordId,
    "Assignment ID must equal its source record ID.",
  );
export type RecordAssignment = z.infer<typeof recordAssignmentSchema>;
export function validateAssignmentSet(entries: RecordAssignment[]) {
  if (entries.length > 5000)
    throw new Error("Use at most 5,000 record assignments.");
  const ids = new Set<string>(),
    subjects = new Map<string, string>();
  for (const r of entries) {
    if (ids.has(r.recordId))
      throw new Error(
        "A source record can have only one current assignment entry.",
      );
    ids.add(r.recordId);
    if (r.sourceSubject) {
      const owner = subjects.get(r.sourceSubject);
      if (owner && owner !== r.personId)
        throw new Error(
          "The same exact source Patient reference cannot be assigned to different people. Review or revoke conflicting entries first; names are not used to resolve identity.",
        );
      subjects.set(r.sourceSubject, r.personId);
    }
  }
}
export function canonicalProjection(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(canonicalProjection).join(",")}]`;
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonicalProjection((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  throw new Error("Fingerprint inputs must be finite plain JSON projections.");
}
export async function projectionDigest(value: unknown) {
  const bytes = new TextEncoder().encode(canonicalProjection(value)),
    digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function personIdentityProjection(p: FamilyProfile) {
  return {
    id: p.id,
    name: p.name,
    birthYear: p.birthYear,
    lifeStatus: p.lifeStatus,
    deathYear: p.deathYear,
    source: p.source,
    sourceUrl: p.sourceUrl,
  };
}
export async function prepareRecordAssignment(
  record: MedicalRecord,
  person: FamilyProfile,
  basis: string,
  reviewedAt = new Date().toISOString(),
): Promise<RecordAssignment> {
  const r = medicalRecordSchema.parse(record),
    p = familyProfileSchema.parse(person);
  return recordAssignmentSchema.parse({
    id: r.id,
    recordId: r.id,
    personId: p.id,
    name: r.name,
    personName: p.name,
    recordDigest: await projectionDigest(r),
    personDigest: await projectionDigest(personIdentityProjection(p)),
    sourceSubject: r.subject,
    basis,
    reviewedAt,
    method: OWNERSHIP_METHOD,
  });
}
export type AssignmentStatus =
  | "current"
  | "record missing"
  | "profile missing"
  | "record changed"
  | "profile changed";
export async function reviewRecordAssignments(
  records: MedicalRecord[],
  profiles: FamilyProfile[],
  assignments: RecordAssignment[],
) {
  validateRecordSet(records);
  if (new Set(records.map((r) => r.id)).size !== records.length)
    throw new Error(
      "Source record IDs must be unique before attribution review.",
    );
  validateFamilyProfiles(profiles);
  validateAssignmentSet(assignments);
  const byRecord = new Map(records.map((r) => [r.id, r])),
    byPerson = new Map(profiles.map((p) => [p.id, p]));
  const recordHashes = new Map<string, Promise<string>>(),
    personHashes = new Map<string, Promise<string>>();
  const assignedIds = new Set(assignments.map((a) => a.recordId));
  const rows = await Promise.all(
    assignments.map(async (a) => {
      const r = byRecord.get(a.recordId),
        p = byPerson.get(a.personId);
      let status: AssignmentStatus = "current";
      if (!r) status = "record missing";
      else if (!p) status = "profile missing";
      else {
        if (!recordHashes.has(r.id))
          recordHashes.set(
            r.id,
            projectionDigest(medicalRecordSchema.parse(r)),
          );
        if (!personHashes.has(p.id))
          personHashes.set(p.id, projectionDigest(personIdentityProjection(p)));
        if (
          a.recordDigest !== (await recordHashes.get(r.id)) ||
          a.sourceSubject !== r.subject
        )
          status = "record changed";
        else if (a.personDigest !== (await personHashes.get(p.id)))
          status = "profile changed";
      }
      return { assignment: a, status };
    }),
  );
  return {
    method: OWNERSHIP_METHOD,
    totalRecords: records.length,
    unassignedRecords: records.filter((r) => !assignedIds.has(r.id)).length,
    current: rows.filter((r) => r.status === "current").length,
    held: rows.filter((r) => r.status !== "current").length,
    rows,
    limitations: OWNERSHIP_LIMITS,
  };
}
export function unassignedMedicalRecords(
  records: MedicalRecord[],
  assignments: RecordAssignment[],
) {
  validateAssignmentSet(assignments);
  const held = new Set(assignments.map((a) => a.recordId));
  return records.filter((r) => !held.has(r.id));
}
export function checkOwnershipDraft(expected: string, current: string) {
  if (expected !== current)
    throw new Error(
      "Source records, profiles or assignments changed during review. Preview again before confirming; nothing was reassigned.",
    );
}
export async function personMedicalReport(
  records: MedicalRecord[],
  profiles: FamilyProfile[],
  assignments: RecordAssignment[],
  personId: string,
  generatedAt = new Date().toISOString(),
) {
  const person = profiles.find((p) => p.id === personId);
  if (!person) throw new Error("Choose an existing person before export.");
  const review = await reviewRecordAssignments(records, profiles, assignments),
    own = review.rows.filter((r) => r.assignment.personId === personId),
    current = own.filter((r) => r.status === "current"),
    recordMap = new Map(records.map((r) => [r.id, r]));
  return {
    format: "symphony-person-medical-records-v1",
    product: "Symphony AI",
    generatedAt,
    method: OWNERSHIP_METHOD,
    person: personIdentityProjection(person),
    completeForSavedAssignments: own.every((r) => r.status === "current"),
    records: current.map((r) => ({
      record: recordMap.get(r.assignment.recordId)!,
      attribution: r.assignment,
    })),
    withheld: own
      .filter((r) => r.status !== "current")
      .map((r) => ({ recordId: r.assignment.recordId, reason: r.status })),
    scope:
      "Only current user-reviewed assignments for this selected profile. Stale/missing links are withheld. This is not a complete clinical record; other profiles and Family Hub histories are not expanded.",
    limitations: OWNERSHIP_LIMITS,
  };
}
export function assignmentCsvRows(entries: RecordAssignment[]): unknown[][] {
  return [
    [
      "record_id",
      "source_title_snapshot",
      "person_id",
      "person_label_snapshot",
      "record_projection_sha256",
      "person_identity_projection_sha256",
      "source_subject_reference",
      "attribution_basis",
      "reviewed_at",
      "method",
    ],
    ...entries.map((a) => [
      a.recordId,
      a.name,
      a.personId,
      a.personName,
      a.recordDigest,
      a.personDigest,
      a.sourceSubject,
      a.basis,
      a.reviewedAt,
      a.method,
    ]),
  ];
}
