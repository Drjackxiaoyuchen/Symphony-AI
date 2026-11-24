"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Link2, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import {
  Field,
  LedgerTools,
  actionClass,
  primaryClass,
  fieldClass,
  messageOf,
} from "@/components/ui/ledger-tools";
import { useLedger } from "@/lib/use-ledger";
import { KEYS } from "@/lib/user-data";
import { medicalRecordSchema, validateRecordSet } from "@/lib/medical-records";
import {
  familyProfileSchema,
  validateFamilyProfiles,
} from "@/lib/family-history";
import { downloadFile } from "@/lib/download";
import { toCsv } from "@/lib/tabular";
import { parseLedger } from "@/lib/personal-ledgers";
import {
  OWNERSHIP_METHOD,
  OWNERSHIP_LIMITS,
  recordAssignmentSchema,
  validateAssignmentSet,
  prepareRecordAssignment,
  reviewRecordAssignments,
  checkOwnershipDraft,
  personMedicalReport,
  assignmentCsvRows,
  type RecordAssignment,
} from "@/lib/record-ownership";
function snapshot() {
  return JSON.stringify(
    [KEYS.records, KEYS.family, KEYS.ownership].map((k) =>
      window.localStorage.getItem(k),
    ),
  );
}
export default function RecordOwnership() {
  const records = useLedger(
      KEYS.records,
      "medical-records",
      medicalRecordSchema,
      validateRecordSet,
    ),
    profiles = useLedger(
      KEYS.family,
      "family-profiles",
      familyProfileSchema,
      validateFamilyProfiles,
    ),
    owners = useLedger(
      KEYS.ownership,
      "record-ownership",
      recordAssignmentSchema,
      validateAssignmentSet,
    );
  const [recordId, setRecordId] = useState(""),
    [personId, setPersonId] = useState(""),
    [basis, setBasis] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<{
      assignment: RecordAssignment;
      snapshot: string;
    } | null>(null),
    [audit, setAudit] = useState<Awaited<
      ReturnType<typeof reviewRecordAssignments>
    > | null>(null),
    [error, setError] = useState(""),
    [auditError, setAuditError] = useState(""),
    [notice, setNotice] = useState(""),
    [removed, setRemoved] = useState<RecordAssignment | null>(null),
    [page, setPage] = useState(0);
  const ready = records.ready && profiles.ready && owners.ready,
    storageError = records.error || profiles.error || owners.error;
  useEffect(() => {
    let active = true;
    setAudit(null);
    setAuditError("");
    if (ready && !storageError)
      reviewRecordAssignments(records.entries, profiles.entries, owners.entries)
        .then((r) => {
          if (active) setAudit(r);
        })
        .catch((e) => {
          if (active) setAuditError(messageOf(e));
        });
    return () => {
      active = false;
    };
  }, [records.stored, profiles.stored, owners.stored, ready, storageError]);
  const disabled = !ready || !!storageError || !!auditError || !audit || busy,
    source = records.entries.find((r) => r.id === recordId),
    target = profiles.entries.find((p) => p.id === personId),
    byRecord = new Map(audit?.rows.map((r) => [r.assignment.recordId, r]));
  const list = [
    ...records.entries.map((r) => ({
      recordId: r.id,
      name: r.name,
      entry: byRecord.get(r.id),
    })),
    ...(audit?.rows
      .filter((r) => r.status === "record missing")
      .map((r) => ({
        recordId: r.assignment.recordId,
        name: r.assignment.name,
        entry: r,
      })) || []),
  ];
  const pages = Math.max(1, Math.ceil(list.length / 20)),
    currentPage = Math.min(page, pages - 1);
  function resetPreview() {
    setPreview(null);
    setConfirmed(false);
    setError("");
    setNotice("");
  }
  return (
    <section id="record-ownership" className="scroll-mt-6">
      <Card className="relative">
        <SectionTitle
          icon={Users}
          title="Review who a record belongs to"
          subtitle="Explicit source attribution to a Family Hub person. Legacy records stay unassigned until you confirm."
        />
        <div className="grid sm:grid-cols-3 gap-3 mb-5">
          {[
            { label: "Unassigned source records", n: audit?.unassignedRecords },
            { label: "Current reviewed links", n: audit?.current },
            { label: "Links held for re-review", n: audit?.held },
          ].map((x) => (
            <div
              key={x.label}
              className="rounded-xl border border-cream-300 bg-cream-100 p-3"
            >
              <p className="text-micro text-stone-500">{x.label}</p>
              <p className="font-serif text-[26px] mt-1">{x.n ?? "…"}</p>
            </div>
          ))}
        </div>
        <p className="text-caption text-stone-600 mb-4">
          This creates a separate attribution entry. It does not move or edit
          the source record, verify patient identity, or match people by name.
          Every record with an attribution entry is withheld from the default
          personal report, including stale links. Person-specific exports below
          include current links only.
        </p>
        {(error || storageError || auditError) && (
          <p
            role="alert"
            className="text-caption text-rose-dark rounded-xl border border-rose/30 p-3 mb-4"
          >
            {storageError || auditError || error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-caption text-sage-dark mb-4">
            {notice}
          </p>
        )}
        {!profiles.entries.length && ready && !storageError && (
          <p className="text-caption text-stone-600 rounded-xl bg-cream-100 p-4 mb-4">
            Add a source-backed person in{" "}
            <Link href="/family" className="underline text-copper-700">
              Family Hub
            </Link>{" "}
            before assigning a record. No person is created or selected
            automatically.
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Source record for attribution">
            <select
              className={fieldClass}
              value={recordId}
              disabled={disabled}
              onChange={(e) => {
                setRecordId(e.target.value);
                resetPreview();
              }}
            >
              <option value="">Choose a source record</option>
              {records.entries.map((r) => (
                <option value={r.id} key={r.id}>
                  {r.name} · {r.id.slice(-8)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Person for attribution / export">
            <select
              className={fieldClass}
              value={personId}
              disabled={disabled}
              onChange={(e) => {
                setPersonId(e.target.value);
                resetPreview();
              }}
            >
              <option value="">Choose a Family Hub person</option>
              {profiles.entries.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name} · {p.id.slice(-8)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {source && target && (
          <div className="grid sm:grid-cols-2 gap-3 mt-4 text-caption">
            <div className="rounded-xl bg-cream-100 p-4 break-words">
              <p className="text-micro uppercase text-stone-500">
                Source context
              </p>
              <p className="font-medium mt-1">{source.name}</p>
              <p>
                {source.origin} · {source.provider || "Provider not supplied"} ·{" "}
                {source.at || "Collection date unknown"}
              </p>
              <p className="break-all mt-2">
                Source subject:{" "}
                {source.subject || "Not recorded — identity is not established"}
              </p>
              <p className="text-micro text-stone-500 mt-2">
                {source.observations.length} linked observations · original
                source units/statuses retained
              </p>
            </div>
            <div className="rounded-xl bg-cream-100 p-4 break-words">
              <p className="text-micro uppercase text-stone-500">
                Chosen person
              </p>
              <p className="font-medium mt-1">{target.name}</p>
              <p>
                Born {target.birthYear ?? "unknown year"} · {target.lifeStatus}
              </p>
              <p>Profile source: {target.source}</p>
              <p className="font-mono text-micro break-all mt-2">
                ID {target.id}
              </p>
            </div>
          </div>
        )}
        <div className="mt-4">
          <Field label="Evidence / reason for this attribution">
            <textarea
              className={fieldClass}
              value={basis}
              disabled={disabled}
              onChange={(e) => {
                setBasis(e.target.value);
                resetPreview();
              }}
              placeholder="Describe the source evidence you checked; names alone are not verified identity."
            />
          </Field>
        </div>
        <button
          className={`${actionClass} mt-3`}
          disabled={disabled || !source || !target || !basis.trim()}
          onClick={async () => {
            setError("");
            setNotice("");
            setBusy(true);
            setPreview(null);
            try {
              if (!source || !target)
                throw new Error("Choose a source record and person.");
              const before = snapshot(),
                a = await prepareRecordAssignment(source, target, basis);
              validateAssignmentSet([
                ...owners.entries.filter((x) => x.recordId !== a.recordId),
                a,
              ]);
              checkOwnershipDraft(before, snapshot());
              setPreview({ assignment: a, snapshot: before });
              setConfirmed(false);
            } catch (e) {
              setError(messageOf(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Link2 size={14} />
          Preview attribution
        </button>
        {preview && (
          <div className="rounded-xl border border-copper/30 bg-copper-50 p-4 mt-4 space-y-3 text-caption break-words">
            <p className="font-medium">
              Review: {preview.assignment.name} →{" "}
              {preview.assignment.personName}
            </p>
            <p>
              Previous attribution:{" "}
              {owners.entries.find(
                (a) => a.recordId === preview.assignment.recordId,
              )?.personName || "Unassigned"}
              . Confirmation replaces the current attribution entry for this
              record; it does not rewrite the source Patient reference.
            </p>
            <p>Attribution basis: {preview.assignment.basis}</p>
            <details>
              <summary className="cursor-pointer text-copper-700">
                Fingerprints & review scope
              </summary>
              <p className="font-mono text-micro break-all mt-2">
                Record projection SHA-256: {preview.assignment.recordDigest}
              </p>
              <p className="font-mono text-micro break-all mt-2">
                Person identity projection SHA-256:{" "}
                {preview.assignment.personDigest}
              </p>
              <p className="mt-2">
                Any source record change or change to the chosen identity fields
                holds this link for re-review. A hash is not authentication or a
                patient match.
              </p>
            </details>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 rounded text-copper border-cream-300"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                I checked the original source subject against this person and
                reviewed the attribution basis. This is my attribution, not a
                verified patient-identity result.
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                className={primaryClass}
                disabled={disabled || !confirmed}
                onClick={() => {
                  try {
                    checkOwnershipDraft(preview.snapshot, snapshot());
                    owners.save({
                      ...preview.assignment,
                      reviewedAt: new Date().toISOString(),
                    });
                    setPreview(null);
                    setConfirmed(false);
                    setNotice(
                      "Reviewed attribution saved. Source medical and family records were not moved or edited.",
                    );
                  } catch (e) {
                    setError(messageOf(e));
                  }
                }}
              >
                Confirm reviewed attribution
              </button>
              <button
                className={actionClass}
                onClick={() => {
                  setPreview(null);
                  setConfirmed(false);
                }}
              >
                Cancel attribution preview
              </button>
            </div>
          </div>
        )}
        {removed && (
          <div
            role="status"
            className="mt-4 text-caption flex flex-wrap gap-3 items-center"
          >
            <span>
              Attribution revoked; the original record remains in its source
              workspace.
            </span>
            <button
              className={actionClass}
              disabled={disabled}
              onClick={() => {
                try {
                  const raw = window.localStorage.getItem(KEYS.ownership);
                  const current = raw
                    ? parseLedger(
                        JSON.parse(raw),
                        "record-ownership",
                        recordAssignmentSchema,
                      ).entries
                    : [];
                  if (current.some((a) => a.recordId === removed.recordId))
                    throw new Error(
                      "A new attribution already exists. Review it rather than overwriting it with undo.",
                    );
                  owners.save(removed);
                  setRemoved(null);
                } catch (e) {
                  setError(messageOf(e));
                }
              }}
            >
              Undo attribution revocation
            </button>
          </div>
        )}
        <details className="mt-5">
          <summary className="cursor-pointer text-caption text-copper-700">
            Inspect current and held attribution entries
          </summary>
          <p className="text-caption text-stone-500 mt-3">
            Revoking an attribution returns that source record to the
            unattributed default workspace report. Review exports before
            sharing.
          </p>
          <ul className="space-y-3 mt-4">
            {list.slice(currentPage * 20, (currentPage + 1) * 20).map((r) => (
              <li
                className="rounded-xl border border-cream-300 p-3 text-caption break-words"
                key={r.recordId}
              >
                <p className="font-medium">{r.name}</p>
                <p className="mt-1">
                  {r.entry
                    ? `${r.entry.assignment.personName} · ${r.entry.status === "current" ? "Current user-reviewed attribution" : r.entry.status + " — held from person export"}`
                    : "Unassigned — remains in legacy workspace"}
                </p>
                {r.entry && (
                  <>
                    <p className="text-micro text-stone-500 mt-2">
                      Reviewed{" "}
                      {new Date(r.entry.assignment.reviewedAt).toLocaleString()}{" "}
                      · {r.entry.assignment.basis}
                    </p>
                    <button
                      className={`${actionClass} mt-3`}
                      disabled={disabled}
                      onClick={() => {
                        try {
                          const raw = window.localStorage.getItem(
                            KEYS.ownership,
                          );
                          const current = raw
                            ? parseLedger(
                                JSON.parse(raw),
                                "record-ownership",
                                recordAssignmentSchema,
                              ).entries.find((a) => a.recordId === r.recordId)
                            : null;
                          if (
                            JSON.stringify(current) !==
                            JSON.stringify(r.entry?.assignment)
                          )
                            throw new Error(
                              "This attribution changed in another view. Review the current entry before revoking it.",
                            );
                          setRemoved(owners.remove(r.recordId) || null);
                          setPreview(null);
                          setNotice("");
                        } catch (e) {
                          setError(messageOf(e));
                        }
                      }}
                    >
                      Revoke attribution for {r.name}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {!list.length && (
            <p className="text-caption text-stone-500 mt-3">
              No source records or attribution entries are saved.
            </p>
          )}
          {pages > 1 && (
            <nav
              aria-label="Attribution pages"
              className="flex flex-wrap gap-2 items-center mt-4"
            >
              <button
                className={actionClass}
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous attributions
              </button>
              <span className="text-caption">
                {currentPage + 1} / {pages}
              </span>
              <button
                className={actionClass}
                disabled={currentPage + 1 === pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next attributions
              </button>
            </nav>
          )}
        </details>
        <div className="mt-5 pt-4 border-t border-cream-300">
          <h3 className="font-serif text-title">
            Export chosen person's medical records
          </h3>
          <p className="text-caption text-stone-600 mt-2">
            Only current reviewed links for the person selected above are
            included. Stale or missing links are listed as withheld; other
            people's records and Family Hub histories are excluded.
          </p>
          <button
            className={`${actionClass} mt-3`}
            disabled={disabled || !target}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                if (!target) throw new Error("Choose a person.");
                const before = snapshot(),
                  report = await personMedicalReport(
                    records.entries,
                    profiles.entries,
                    owners.entries,
                    target.id,
                  );
                checkOwnershipDraft(before, snapshot());
                downloadFile(
                  `symphony-person-medical-records-${target.id}.json`,
                  JSON.stringify(report, null, 2),
                  "application/json",
                );
              } catch (e) {
                setError(messageOf(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Download size={14} />
            Export person's medical JSON
          </button>
        </div>
        <details className="mt-5">
          <summary className="cursor-pointer text-caption text-copper-700">
            Attribution backup & method
          </summary>
          <div className="mt-4 space-y-3">
            <p className="text-caption text-stone-600">
              Attribution backups are separate from source-record and Family Hub
              backups. Restoration never assigns a new fingerprint
              automatically: changed or missing sources are held for review. All
              exact non-empty source Patient references must point to a single
              person within this assignment workspace; this does not prove the
              reference is globally unique.
            </p>
            <LedgerTools
              kind="record-ownership"
              storageKey={KEYS.ownership}
              schema={recordAssignmentSchema}
              stored={owners.stored}
              disabled={!owners.ready}
              exportDisabled={!!owners.error}
              summarize={(a) => `${a.name} → ${a.personName} · ${a.reviewedAt}`}
              onRestore={(v) => {
                owners.restore(v);
                setPreview(null);
                setRemoved(null);
                setNotice(
                  "Reviewed attribution backup restored; source/profile compatibility is being checked.",
                );
              }}
            />
            <button
              className={actionClass}
              disabled={disabled}
              onClick={() =>
                downloadFile(
                  "symphony-record-attributions.csv",
                  toCsv(assignmentCsvRows(owners.entries)),
                  "text/csv",
                )
              }
            >
              Export attribution index CSV
            </button>
            <p className="text-micro text-stone-500">
              {OWNERSHIP_METHOD} · {OWNERSHIP_LIMITS} Storage is unencrypted; a
              raw backup may contain private source identifiers.
            </p>
          </div>
        </details>
      </Card>
    </section>
  );
}
