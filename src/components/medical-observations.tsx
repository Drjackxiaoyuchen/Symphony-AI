import { quantityText, type MedicalRecord } from "@/lib/medical-records";

export function ObservationTable({ record }: { record: MedicalRecord }) {
  return (
    <div
      className="relative overflow-x-auto mt-4"
      tabIndex={0}
      role="region"
      aria-label={`${record.name} observations`}
    >
      <table className="w-full min-w-[650px] text-left text-caption">
        <caption className="sr-only">
          Source observations with original units and status. No normal/abnormal
          classification is inferred.
        </caption>
        <thead>
          <tr>
            {[
              "Observation",
              "Source value",
              "Source ranges",
              "Status / collection",
            ].map((h) => (
              <th
                key={h}
                className="py-3 pr-4 border-b border-cream-300 text-stone-500 font-medium"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {record.observations.map((o) => (
            <tr key={o.id} className="align-top border-b border-cream-200">
              <td className="py-3 pr-4">
                <p className="font-medium text-stone-800">{o.name}</p>
                {o.codes.map((c, i) => (
                  <p key={i} className="text-micro text-stone-500 break-all">
                    {c.system || "Code system not supplied"} · {c.code}
                  </p>
                ))}
              </td>
              <td className="py-3 pr-4">
                <p className="font-medium text-stone-800">
                  {o.quantity
                    ? quantityText(o.quantity)
                    : `Not reported · ${o.absentReason}`}
                </p>
                {o.quantity && (
                  <p className="text-micro text-stone-500 break-all">
                    {o.quantity.system || "Unit system not supplied"} ·{" "}
                    {o.quantity.code || "Unit code not supplied"}
                  </p>
                )}
              </td>
              <td className="py-3 pr-4">
                {o.ranges.length
                  ? o.ranges.map((r, i) => (
                      <p key={i}>
                        {r.text}
                        {r.low || r.high
                          ? ` ${r.low ? quantityText(r.low) : "No lower bound"} — ${r.high ? quantityText(r.high) : "No upper bound"}`
                          : ""}
                      </p>
                    ))
                  : "Not supplied"}
              </td>
              <td className="py-3">
                <p>{o.status}</p>
                <p className="text-micro text-stone-500 mt-1">
                  {o.at || "Collection time unknown"}
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
