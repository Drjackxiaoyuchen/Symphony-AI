import { z } from "zod";
export const FHIR_REFERENCE_METHOD = "symphony-fhir-references-v1";
const bounded = z.string().min(1).max(2000);
export const referenceAuditSchema = z
  .object({
    method: z.literal(FHIR_REFERENCE_METHOD),
    links: z
      .array(
        z
          .object({
            from: bounded,
            field: z.string().min(1).max(100),
            reference: bounded,
            target: bounded,
            mode: z.enum(["exact fullUrl", "relative to service base"]),
          })
          .strict(),
      )
      .max(2001),
  })
  .strict();
export type ReferenceAudit = z.infer<typeof referenceAuditSchema>;
type Resource = Record<string, unknown>;
const relative = /^([A-Z][A-Za-z]+)\/([A-Za-z0-9.-]{1,64})$/;
const rest = /^(https?:\/\/[^?#]+\/)([A-Z][A-Za-z]+)\/([A-Za-z0-9.-]{1,64})$/;
function supportedUri(value: string) {
  if (
    value.length > 2000 ||
    /[\s?#]/.test(value) ||
    value.includes("/_history/")
  )
    return false;
  if (/^urn:[a-z0-9][a-z0-9-]{0,31}:.+$/i.test(value)) return true;
  try {
    const u = new URL(value);
    // Reject path navigation rather than normalizing a declared identity into another base.
    const path = value.replace(/^https?:\/\/[^/]+/i, "");
    if (
      path
        .split("/")
        .some((segment) => [".", ".."].includes(decodeURIComponent(segment)))
    )
      return false;
    return (
      ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
    );
  } catch {
    return false;
  }
}
/** Bounded, entirely offline resolution. No global type/id aliases and no URL normalization. */
export function buildReferenceResolver(
  entries: { fullUrl: string; resource: Resource }[],
) {
  const index = new Map<string, Resource>(),
    identities = new Map<Resource, string>();
  for (const { fullUrl, resource } of entries) {
    if (!fullUrl) continue;
    if (!supportedUri(fullUrl))
      throw new Error(
        "Unsupported Bundle fullUrl: use an absolute HTTP(S) URL or URN without query, fragment, credentials or history version.",
      );
    const m = fullUrl.match(rest);
    if (
      m &&
      (m[2] !== resource.resourceType ||
        (resource.id !== undefined && m[3] !== resource.id))
    )
      throw new Error("Bundle fullUrl disagrees with resource type or ID.");
    if (index.has(fullUrl))
      throw new Error(`Ambiguous duplicate resource identity: ${fullUrl}`);
    index.set(fullUrl, resource);
    identities.set(resource, fullUrl);
  }
  const links: ReferenceAudit["links"] = [];
  function resolve(
    from: Resource,
    value: unknown,
    expectedType: "Patient" | "Observation",
    field: string,
  ) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`Missing literal ${expectedType} reference at ${field}.`);
    const ref = value as Record<string, unknown>,
      raw = ref.reference;
    if (typeof raw !== "string" || !raw || raw.length > 2000)
      throw new Error(
        `Use a literal ${expectedType} reference at ${field}; identifier-only matching is not supported.`,
      );
    let target = raw,
      mode: ReferenceAudit["links"][number]["mode"] = "exact fullUrl";
    const short = raw.match(relative);
    if (short) {
      const base = identities.get(from)?.match(rest);
      if (!base)
        throw new Error(
          `Relative reference ${raw} has no RESTful source fullUrl. Supply explicit absolute references/fullUrls; a service base will not be guessed.`,
        );
      target = base[1] + raw;
      mode = "relative to service base";
    } else if (!supportedUri(raw))
      throw new Error(
        `Unsupported literal reference at ${field}. Contained, conditional and version-specific references need a full FHIR processor.`,
      );
    const resource = index.get(target);
    if (!resource || resource.resourceType !== expectedType)
      throw new Error(
        `Unresolved ${expectedType} reference: ${raw} (target ${target}). No network request was made.`,
      );
    if (
      ref.type !== undefined &&
      ref.type !== expectedType &&
      ref.type !== `http://hl7.org/fhir/StructureDefinition/${expectedType}`
    )
      throw new Error(
        `Reference.type disagrees with resolved ${expectedType} at ${field}.`,
      );
    if (links.length >= 2001)
      throw new Error("Reference audit exceeds 2,001 links.");
    links.push({
      from: identities.get(from) || `${from.resourceType}/${from.id}`,
      field,
      reference: raw,
      target,
      mode,
    });
    return { resource, identity: target };
  }
  return {
    resolve,
    identity: (resource: Resource) => identities.get(resource),
    audit: () =>
      referenceAuditSchema.parse({ method: FHIR_REFERENCE_METHOD, links }),
  };
}
