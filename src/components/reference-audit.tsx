import type { MedicalRecord } from "@/lib/medical-records";
export function ReferenceAudit({ record }: { record: MedicalRecord }) {
  if (record.origin !== "FHIR R4 subset") return null;
  if (!record.referenceAudit)
    return (
      <p className="text-caption text-stone-500 mt-3">
        Legacy projection: a reference-resolution audit was not captured.
        Re-import the original source to apply the current checks; saved facts
        and attributions are retained.
      </p>
    );
  return (
    <details className="mt-4 rounded-xl border border-cream-300 p-4">
      <summary className="cursor-pointer text-caption font-medium text-copper-700">
        Reference identity audit · {record.referenceAudit.links.length} resolved
        links
      </summary>
      <p className="text-caption text-stone-600 mt-3">
        Each target resolves inside this Bundle. Relative references use the
        referring resource's service base; matching short IDs across servers
        never establish identity. This checks declared links, not patient
        identity or source authenticity.
      </p>
      <p className="font-mono text-micro text-stone-500 mt-2 break-all">
        {record.referenceAudit.method}
      </p>
      <div
        className="overflow-auto max-h-96 mt-3"
        tabIndex={0}
        role="region"
        aria-label="Reference audit table"
      >
        <table className="w-full min-w-[720px] text-caption text-left">
          <caption className="sr-only">
            Original references, source context and resolved in-Bundle targets
          </caption>
          <thead className="sticky top-0 bg-white">
            <tr>
              {[
                "Source / field",
                "Original reference",
                "Resolved target",
                "Resolution",
              ].map((h) => (
                <th
                  className="p-2 border-b border-cream-300 font-medium text-stone-600"
                  key={h}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {record.referenceAudit.links.map((link, i) => (
              <tr key={i} className="align-top border-b border-cream-200">
                <td className="p-2 break-all max-w-[220px]">
                  {link.from}
                  <p className="text-stone-500 mt-1">{link.field}</p>
                </td>
                <td className="p-2 break-all max-w-[220px]">
                  {link.reference}
                </td>
                <td className="p-2 break-all max-w-[220px]">{link.target}</td>
                <td className="p-2">{link.mode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
