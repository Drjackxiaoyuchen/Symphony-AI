// Reviewed public references. These are design/method references, not live integrations.
export const RESEARCH_DATE = "2026-11-28";
export type ResearchSource = {
  id: string;
  title: string;
  kind: "Repository" | "Paper" | "Documentation" | "Model card" | "Company";
  url: string;
  learning: string;
  boundary: string;
  reviewedAt?: string; // Original sources: 2026-11-16; newer reviews override this.
};
export const RESEARCH_SOURCES: ResearchSource[] = [
  {
    id: "fhir-patient-compartments",
    title: "FHIR R4 patient-associated resource compartments",
    kind: "Documentation",
    url: "https://hl7.org/fhir/R4/compartmentdefinition.html",
    reviewedAt: "2026-11-28",
    learning:
      "Make the selected patient-associated scope explicit before source reads, validation and export.",
    boundary:
      "R4 4.0.1 scope and membership inspected; CC0 specification, terminology terms separate. Our local notebooks do not implement FHIR compartments, Patient.link or access control. No specification text or terminology copied.",
  },
  {
    id: "medplum-scoped-repository",
    title: "Medplum explicit repository scopes",
    kind: "Repository",
    url: "https://github.com/medplum/medplum/blob/1f2c185cb97e93b4f1decbf19a19ea41ab39e8d0/packages/server/src/fhir/accesspolicy.ts",
    reviewedAt: "2026-11-28",
    learning:
      "Pass an explicit scope to data operations rather than assume that a global repository is scoped.",
    boundary:
      "Pinned getRepoForProject/getRepoForProjects/buildAccessPolicy and Apache-2.0 LICENSE.txt inspected. No Medplum code/service copied, run or benchmarked. Owner-keyed localStorage separates datasets but does not reproduce server authorization.",
  },
  {
    id: "fhir-reference-resolution",
    title: "FHIR R4 Bundle reference resolution",
    kind: "Documentation",
    url: "https://hl7.org/fhir/R4/bundle.html#references",
    reviewedAt: "2026-11-26",
    learning:
      "Resolve relative type/id references against the referring resource's RESTful fullUrl base; require exact in-Bundle targets and consistent declared types.",
    boundary:
      "R4 4.0.1, CC0 specification; references.html and Bundle resolution rules reviewed. Our offline subset rejects unsupported references and never fetches external URLs. A resolved link does not authenticate patient identity or provide general FHIR conformance.",
  },
  {
    id: "synthea-reference-output",
    title: "Synthea source-linked synthetic FHIR output",
    kind: "Repository",
    url: "https://github.com/synthetichealth/synthea/tree/0857400eacbbecc5a67c7d05740efa227d22db39",
    reviewedAt: "2026-11-26",
    learning:
      "Keep synthetic fixtures distinct from patient evidence and link generated resources through explicit fullUrl references.",
    boundary:
      "Pinned README, Apache-2.0 LICENSE and FhirR4.java reference construction reviewed. No code, generated patient corpus or model was copied or run. Our small fixtures and reference-case results are local contract validation, not a reproduction of Synthea or clinical realism.",
  },

  {
    id: "fhir-provenance",
    title: "FHIR R4 Provenance: source and attribution boundaries",
    kind: "Documentation",
    url: "https://hl7.org/fhir/R4/provenance.html",
    reviewedAt: "2026-11-25",
    learning:
      "Keep the original subject/source separate from the activity and basis that attribute a record to a local person.",
    boundary:
      "R4 4.0.1 documentation (CC0), accessed 2026-11-24 and rechecked 2026-11-25. Our versioned local attribution is not a conformant FHIR Provenance resource, authenticated identity, consent or an immutable audit log. No specification text or code copied.",
  },
  {
    id: "medplum-match",
    title: "Medplum Patient $match: ambiguity and disclosure gates",
    kind: "Documentation",
    url: "https://www.medplum.com/docs/api/fhir/operations/patient-match",
    reviewedAt: "2026-11-25",
    learning:
      "Candidate ranking and permission to disclose are different decisions; ambiguous identity must not silently become an accepted link.",
    boundary:
      "Live documentation accessed 2026-11-24 and rechecked 2026-11-25 references a draft matching guide. Repository/license inspected at 1f2c185cb97e93b4f1decbf19a19ea41ab39e8d0, Apache-2.0; documentation not pinned to that commit. No matching service/code integrated. Symphony uses explicit review, not matching scores or access control.",
  },
  {
    id: "patient-linkage-preprint",
    title: "Language models for patient record linkage: evaluation limits",
    kind: "Paper",
    url: "https://arxiv.org/abs/2504.15261v1",
    reviewedAt: "2026-11-25",
    learning:
      "Evaluate identity errors and candidate-retrieval loss separately on domain-specific labeled records before adopting automation.",
    boundary:
      "Preprint v1, 2025-04-21, paper CC BY-NC-ND 4.0; methods, evaluation and discussion reviewed. Cancer-registry labels used probabilistic linkage plus manual review; blocking and matching were separate experiments. Data are private PHI. No model/data copied, inference run or published accuracy reproduced locally.",
  },

  {
    id: "pedigreejs",
    title: "pedigreejs relationship validation",
    kind: "Repository",
    url: "https://github.com/CCGE-BOADICEA/pedigreejs/tree/daa9faa61634b4f57279c7478cc918ee3fe0274c",
    reviewedAt: "2026-11-23",
    learning:
      "Validate entered person identities and relationship structure before rendering or using a pedigree.",
    boundary:
      "GPL-3.0 source reviewed as a design/method reference; no code copied. Symphony uses its own typed graph validation and does not implement standard pedigree notation, parentage testing or a CanRisk model.",
  },
  {
    id: "family-extraction",
    title:
      "Family-history extraction: deep learning and heuristics (JMIR 2020)",
    kind: "Paper",
    url: "https://medinform.jmir.org/2020/12/e22898",
    reviewedAt: "2026-11-23",
    learning:
      "Correct family-member attribution, negation and observation relations are distinct from recognizing a disease term.",
    boundary:
      "Published n2c2 entity/relation extraction study. Our manual entry and synthetic graph/source validation do not reproduce its extraction benchmark or establish clinical validity; no corpus/model installed.",
  },
  {
    id: "medplum-medications",
    title: "Medplum medication order boundary and validation",
    kind: "Repository",
    url: "https://github.com/medplum/medplum/blob/88af41c092baed5ad35dfa603df17353d3e33e48/packages/react-hooks/src/useMedicationOrder/useMedicationOrder.ts",
    reviewedAt: "2026-11-22",
    learning:
      "Keep source records, typed validation and prescribing/provider operations as distinct boundaries, with explicit failures for unexpected data contracts.",
    boundary:
      "Apache-2.0 source inspected at 88af41c092baed5ad35dfa603df17353d3e33e48. Design reference only; no code copied, EHR connected, medication ordered or vendor service installed.",
  },
  {
    id: "fhir-medication",
    title: "HL7 FHIR R4 MedicationStatement and Dosage",
    kind: "Documentation",
    url: "https://hl7.org/fhir/R4/medicationstatement.html",
    reviewedAt: "2026-11-22",
    learning:
      "Keep reported medication information separate from administration, retaining original dosage instructions, as-needed status, dates and source.",
    boundary:
      "Design/data semantics only; Symphony is not a FHIR medication importer, prescribing system or clinical interaction checker.",
  },
  {
    id: "medextractor-screen",
    title:
      "MedExtractor extraction model and medication-regimen research screening",
    kind: "Model card",
    url: "https://huggingface.co/lion-ai/medextractor-nano",
    reviewedAt: "2026-11-22",
    learning:
      "Field extraction performance and source uncertainty must be evaluated separately from quantity arithmetic or medication safety.",
    boundary:
      "Revision 502b731aeafe44ae802f87134c7b969d0d7acb9f identifies itself as MedExtractor Liquid. Model card restricts use to non-commercial/research and reports synthetic clinical validation only. Deferred: no weights/code executed or terms accepted; arXiv:1912.04961v3 was separately screened, not reproduced.",
  },
  {
    id: "clinvar-prototypes",
    title: "NCBI ClinVar public prototypes",
    kind: "Repository",
    url: "https://github.com/ncbi/clinvar",
    reviewedAt: "2026-11-21",
    learning:
      "Keep functional evidence, germline classification and somatic assertions separate; prototypes are not a production data contract.",
    boundary:
      "Reviewed at 2935a3a4e7fa359be4f69863d78f616a7136e37c. No root license was located; no code or data copied. Production identifier/review semantics follow NCBI documentation instead.",
  },
  {
    id: "dnabert2-screen",
    title: "DNABERT-2 model, implementation and ICLR 2024 paper",
    kind: "Model card",
    url: "https://huggingface.co/zhihan1996/DNABERT-2-117M",
    reviewedAt: "2026-11-21",
    learning:
      "Separate sequence embeddings and GUE task benchmarks from condition-specific clinical evidence; require endpoint-matched evaluation before integrating a genome model.",
    boundary:
      "Apache-2.0 model/code; paper arXiv:2306.15006v2, accepted ICLR 2024. Card and methods/evaluations reviewed; weights not downloaded, benchmark not reproduced, model not installed. GUE results do not validate personal pathogenicity or clinical risk.",
  },
  {
    id: "fhir-report",
    title: "HL7 FHIR R4 DiagnosticReport and Observation",
    kind: "Documentation",
    url: "https://hl7.org/fhir/R4/diagnosticreport.html",
    reviewedAt: "2026-11-20",
    learning:
      "Keep report context, referenced observations, statuses, exact units, date precision and subject identity separate.",
    boundary:
      "Symphony implements a narrow validated projection, not a general FHIR validator, clinical decision system or EHR connector.",
  },
  {
    id: "omh",
    title: "Open mHealth schemas",
    kind: "Repository",
    url: "https://github.com/openmhealth/schemas",
    learning:
      "Keep timestamps, units and acquisition metadata with every observation.",
    boundary:
      "The repository directs sleep/activity schemas to IEEE 1752.1; no device connector is installed.",
  },
  {
    id: "nightscout",
    title: "Nightscout",
    kind: "Repository",
    url: "https://github.com/nightscout/cgm-remote-monitor",
    learning: "Keep glucose traces, events and data age visible together.",
    boundary:
      "Symphony imports files; it does not connect to Nightscout or deliver live alarms.",
  },
  {
    id: "iglu",
    title: "iglu AGP documentation",
    kind: "Documentation",
    url: "https://irinagain.github.io/iglu/reference/agp.html",
    learning:
      "Pair time-of-day profiles with variability and data availability.",
    boundary:
      "Our hourly percentiles are exploratory, without iglu interpolation or clinical equivalence.",
  },
  {
    id: "cgm-consensus",
    title: "International Consensus on Time in Range (2019)",
    kind: "Paper",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6973648/",
    learning:
      "Display collection duration, active coverage, variability and explicit glucose ranges.",
    boundary:
      "The 3.9–10.0 mmol/L range is a diabetes reporting convention; individual goals depend on clinical context.",
  },
  {
    id: "cgm-missingness",
    reviewedAt: "2026-11-19",
    title: "Yu et al. — TIR with incompletely observed trajectories (arXiv v1)",
    kind: "Paper",
    url: "https://arxiv.org/abs/2410.03091v1",
    learning:
      "Define the full time window and show the effect of missingness before interpreting observed-only TIR.",
    boundary:
      "Preprint about population-level inpatient inference. Our individual-record missing-duration bounds are a separate algebraic sensitivity analysis; its IPW estimator is not implemented.",
  },
  {
    id: "iglu-lasagna",
    reviewedAt: "2026-11-19",
    title: "iglu day-by-time plots",
    kind: "Documentation",
    url: "https://irinagain.github.io/iglu/articles/lasagna_plots.html",
    learning:
      "Use calendar-day rows and time-of-day columns to reveal missing intervals and sampling structure.",
    boundary:
      "Design reference only; no GPL source copied. Our tiles show duration-based hourly coverage or summaries without iglu's interpolation.",
  },
  {
    id: "snps",
    title: "apriha/snps",
    kind: "Repository",
    url: "https://github.com/apriha/snps",
    learning:
      "Treat vendor parsing, genome build and allele orientation as explicit stages.",
    boundary:
      "Our raw-file matching is not a build/strand-harmonized clinical annotation pipeline.",
  },
  {
    id: "clinvar",
    reviewedAt: "2026-11-21",
    title: "ClinVar documentation",
    kind: "Documentation",
    url: "https://www.ncbi.nlm.nih.gov/clinvar/docs/",
    learning:
      "Keep accession, review status, condition and conflicting submissions with an interpretation.",
    boundary:
      "Demo variant interpretations have not been refreshed from ClinVar.",
  },
  {
    id: "ods",
    title: "NIH dietary supplement fact sheets",
    kind: "Documentation",
    url: "https://ods.od.nih.gov/factsheets/list-all/",
    learning:
      "Tie ingredient evidence and interaction context to a named reference.",
    boundary: "A SNP alone does not establish a supplement need or dose.",
  },
  {
    id: "off",
    title: "Open Food Facts",
    kind: "Repository",
    url: "https://github.com/openfoodfacts/openfoodfacts-server",
    learning:
      "Preserve serving size, per-100g values, product identity and source.",
    boundary:
      "Nutrition entries do not predict a person's post-meal glucose; data licensing is separate from server licensing.",
  },
  {
    id: "wger",
    title: "wger workout manager",
    kind: "Repository",
    url: "https://github.com/wger-project/wger",
    learning:
      "Separate exercise definitions, planned sessions and actual set/rep/weight logs.",
    boundary:
      "AGPL-3.0-or-later project; design reference only, no code or exercise media copied.",
  },
  {
    id: "medplum",
    reviewedAt: "2026-11-20",
    title: "Medplum results and review",
    kind: "Documentation",
    url: "https://www.medplum.com/docs/labs-imaging/results-and-review",
    learning:
      "Model reports as linked observations with collection time, units and reference intervals.",
    boundary:
      "Our local CSV schema is not a validated FHIR export or EHR connection.",
  },
  {
    id: "fhir-family",
    reviewedAt: "2026-11-23",
    title: "FHIR FamilyMemberHistory",
    kind: "Documentation",
    url: "https://hl7.org/fhir/R4/familymemberhistory-definitions.html",
    learning:
      "Record family relationship, condition, age context and provenance per relative.",
    boundary: "One person's upload never supplies evidence about a relative.",
  },
  {
    id: "phenotips",
    title: "PhenoTips pedigree and phenotype model",
    kind: "Repository",
    url: "https://github.com/phenotips/phenotips",
    learning:
      "Keep pedigree relationships and phenotype observations distinct from genetic interpretation.",
    boundary:
      "The open XWiki repository is no longer maintained; historical design reference, not an integration candidate.",
  },
  {
    id: "gprofiler",
    title: "g:Profiler 2023 methods update",
    kind: "Paper",
    url: "https://academic.oup.com/nar/article/51/W1/W207/7152869",
    learning:
      "Report the tested background, database release and multiple-testing method alongside overlaps.",
    boundary:
      "A curated SNP panel cannot establish unbiased genome-wide pathway enrichment.",
  },
  {
    id: "gwas",
    title: "GWAS Catalog data format",
    kind: "Documentation",
    url: "https://www.ebi.ac.uk/gwas/docs/summary-statistics-format/",
    learning:
      "Retain study ID, effect allele, effect size, genome build and study population.",
    boundary:
      "Association effects are population estimates, not personal disease probabilities.",
  },
  {
    id: "pgsc",
    title: "PGS Catalog Calculator",
    kind: "Repository",
    url: "https://github.com/PGScatalog/pgsc_calc",
    learning:
      "Match alleles and weights, expose matching QC, then use an appropriate ancestry reference for normalization.",
    boundary:
      "No personal PRS is computed here; demo distributions lack validated scoring files and a reference cohort.",
  },
  {
    id: "pharmcat",
    title: "PharmCAT",
    kind: "Repository",
    url: "https://github.com/PharmGKB/PharmCAT",
    learning:
      "Keep variant calls, haplotypes/diplotypes, phenotypes and guideline evidence as separate stages.",
    boundary:
      "A single consumer SNP cannot establish a complete star-allele or metabolizer profile.",
  },
  {
    id: "cpic",
    title: "CPIC guidelines",
    kind: "Documentation",
    url: "https://cpicpgx.org/guidelines/",
    learning:
      "Attach a specific gene–drug guideline and evidence version to any PGx statement.",
    boundary:
      "Drug and dosing decisions require an appropriate clinical assessment.",
  },
  {
    id: "medgemma",
    reviewedAt: "2026-11-20",
    title: "MedGemma 1.5 4B model card",
    kind: "Model card",
    url: "https://huggingface.co/google/medgemma-1.5-4b-it",
    learning:
      "Evaluate document extraction against reviewed values before considering a local model.",
    boundary:
      "Not installed or run. The model card requires use-case validation; a model answer is not a verified observation.",
  },
  {
    id: "function",
    title: "Function Medical Intelligence announcement",
    kind: "Company",
    url: "https://www.functionhealth.com/article/function-announcement",
    learning:
      "Use a longitudinal record with source context across labs, records and wearables.",
    boundary:
      "Public product positioning and company-reported funding; proprietary analysis methods were not disclosed.",
  },
  {
    id: "dsld",
    title: "NIH Dietary Supplement Label Database API",
    kind: "Documentation",
    url: "https://dsldapi.od.nih.gov/",
    learning:
      "Separate product label identity, servings and ingredient amounts from efficacy claims.",
    boundary:
      "Label data is a source for recorded contents; no live label lookup or efficacy scoring is installed.",
  },
  {
    id: "vitamin-d",
    title: "NIH Vitamin D fact sheet",
    kind: "Documentation",
    url: "https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/",
    learning:
      "Vitamin D has a specific conversion of 40 IU to 1 mcg; IU is not a generic mass unit.",
    boundary:
      "The app uses this conversion only for active vitamin D label amounts, without assigning a recommended dose.",
  },
  {
    id: "usda-fdc",
    title: "USDA FoodData Central API guide",
    kind: "Documentation",
    url: "https://fdc.nal.usda.gov/api-guide/",
    learning:
      "Keep food identity, nutrient units and a reference record with the portion calculation.",
    boundary:
      "Users enter reviewed per-100g values; there is no automatic database lookup or assumed volume-to-mass conversion.",
  },
  {
    id: "meal-variability",
    title:
      "Predicting Postprandial Glycemic Responses With Limited Data (2025)",
    kind: "Paper",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11883769/",
    learning:
      "Keep meal timing, personal observations and within-person variability visible in glucose analysis.",
    boundary:
      "Our fixed-window observed summaries and quality gates are an exploratory implementation, not a reproduction of the paper's predictive model.",
  },
];

export type SectionGuide = {
  path: string;
  title: string;
  group: "Overview" | "Daily health" | "Genetics" | "Clinical & family";
  mode:
    | "demo"
    | "cgm"
    | "genome"
    | "bloodwork"
    | "import"
    | "dashboard"
    | "supplements"
    | "meals"
    | "workouts"
    | "family"
    | "medications"
    | "evidence"
    | "records";
  // Medical records are a local register, independent from the illustrative clinical pages.
  inputs: string;
  pipeline: [string, string, string];
  output: string;
  current: string;
  next: string;
  sources: string[];
};
export const SECTION_GUIDES: SectionGuide[] = [
  {
    path: "/dashboard",
    title: "Dashboard",
    group: "Overview",
    mode: "dashboard",
    inputs: "Dated observations from each connected domain",
    pipeline: [
      "Identify the source",
      "Separate measured and illustrative metrics",
      "Summarize available signals",
    ],
    output: "Domain summaries with data dates and completeness",
    current:
      "Personal overview of imported measurements and saved meals, products and completed sessions. Missing records stay missing; there is no composite health score.",
    next: "Add explicit daily observations and device-specific adapters, retaining coverage and timestamps.",
    sources: ["omh", "function"],
  },
  {
    path: "/genomics",
    title: "Genomics",
    group: "Genetics",
    mode: "genome",
    inputs: "23andMe-style or AncestryDNA raw text",
    pipeline: [
      "Validate allele calls",
      "Match a small rsID panel",
      "Show calls separately from interpretation",
    ],
    output: "Imported rsID/gene/genotype table; original demo explorer below",
    current:
      "Imported matches are visible. Build, strand, phasing and clinical significance are not resolved.",
    next: "Add build/strand metadata and versioned ClinVar accession-level annotations.",
    sources: ["snps", "clinvar"],
  },
  {
    path: "/glucose",
    title: "Glucose & Diet",
    group: "Daily health",
    mode: "cgm",
    inputs: "Timestamped CGM CSV / Excel with declared units",
    pipeline: [
      "Validate and normalize readings",
      "Measure coverage and duration-weighted ranges",
      "Audit hourly support, missing-time bounds and daily traces",
    ],
    output:
      "Date-selectable trace, interactive hourly coverage audit, missing-duration TIR bounds, exploratory hourly profile and CSV/JSON reports",
    current:
      "Local duration-weighted metrics, missing-calendar-day/hour audit including DST, algebraic TIR sensitivity bounds and reproducible hourly exports. Personal meal summaries retain observation quality gates.",
    next: "Add user-confirmed sensor cadence and report time zone, then reference-validation against an independent CGM package. Medical Records, Genome Tracker, Medicine Checker and Family Hub now have local source workflows; remaining clinical interpretations stay unimplemented.",
    sources: [
      "nightscout",
      "iglu",
      "cgm-consensus",
      "iglu-lasagna",
      "cgm-missingness",
      "meal-variability",
    ],
  },
  {
    path: "/supplements",
    title: "Supplements",
    group: "Daily health",
    mode: "supplements",
    inputs: "Ingredient, product, dose, schedule and medication context",
    pipeline: [
      "Normalize ingredient names",
      "Link an evidence source",
      "Review interactions and duplication",
    ],
    output: "Ingredient ledger with evidence and review status",
    current:
      "Persistent product and ingredient ledger with label sources, pause/resume, compatible-unit totals, overlap review, undo removal and reviewed JSON restore.",
    next: "Add versioned label lookups and ingredient-form resolution; medication interactions require a separately validated source.",
    sources: ["dsld", "vitamin-d", "ods"],
  },
  {
    path: "/diet",
    title: "Diet & Nutrition",
    group: "Daily health",
    mode: "meals",
    inputs: "Food identity, portion mass and nutrient source",
    pipeline: [
      "Resolve a food record",
      "Scale nutrients to the portion",
      "Aggregate recorded meals by day",
    ],
    output: "Dated meal diary with serving-based macro totals",
    current:
      "Persistent portion-based meal diary with nutrient sources, planned/eaten separation, dated totals, CSV/JSON outputs and quality-gated observed CGM context.",
    next: "Add reviewed food-database lookups and reusable food templates; evaluate extraction against field-level reference values.",
    sources: ["off", "wger", "usda-fdc", "meal-variability"],
  },
  {
    path: "/fitness",
    title: "Fitness",
    group: "Daily health",
    mode: "workouts",
    inputs: "Exercise definitions and completed sessions",
    pipeline: [
      "Separate plan and completion",
      "Record sets, reps and load",
      "Summarize comparable sessions",
    ],
    output: "Session history, volume trend and exercise details",
    current:
      "Persistent planned/completed sessions, editable exercise sets, kg/lb normalization, bodyweight separation, dated activity summaries and portable exports.",
    next: "Add exercise identifiers and activity-file import, preserving sensor provenance and recorded-versus-estimated measures.",
    sources: ["wger", "omh"],
  },
  {
    path: "/records",
    title: "Medical Records",
    group: "Clinical & family",
    mode: "records",
    inputs:
      "Manual source metadata or a local single-report FHIR R4 JSON Bundle",
    pipeline: [
      "Validate references and subject consistency",
      "Review source fields, units and statuses",
      "Save a traceable local report projection",
    ],
    output:
      "Searchable timeline, linked observations, source hash, metadata CSV and reviewed JSON backups",
    current:
      "Source register with reviewed attribution, plus separate person notebooks at /records/people with owner-bound FHIR imports, identity-change holds and reviewed JSON replacement. Existing records are preserved; notebooks stay out of the default personal report. Profiles do not authenticate clinical identity.",
    next: "Next add explicitly reviewed legacy-source transfer/copy and cross-import namespace/alias handling. Separate notebooks accept one exact absolute Patient identity each; no automated patient matching is installed.",
    sources: [
      "fhir-patient-compartments",
      "medplum-scoped-repository",
      "fhir-reference-resolution",
      "synthea-reference-output",
      "fhir-report",
      "fhir-provenance",
      "medplum-match",
      "patient-linkage-preprint",
    ],
  },
  {
    path: "/annotations",
    title: "Genome Tracker",
    group: "Genetics",
    mode: "evidence",
    inputs:
      "Manually reviewed germline SNV identity, one MedGen condition and versioned ClinVar RCV source fields",
    pipeline: [
      "Gate explicit assembly and forward SNV alleles",
      "Save condition-specific source versions",
      "Compare source fields without clinical inference",
    ],
    output:
      "Local evidence register, version transitions, source/conflict flags, CSV and reviewed JSON backups",
    current:
      "Working personal evidence ledger with numeric version ordering, same-version discrepancy checks, exact-context comparisons and report provenance. Manual source transcriptions are not independently verified, matched to uploaded genotypes or refreshed online.",
    next: "Validate a pinned ClinVar release adapter against independently checked reference records, including merged accessions, condition aliases and reference-allele checks. Medicine Checker now has a source plan register; external annotation remains unimplemented.",
    sources: ["clinvar", "clinvar-prototypes", "dnabert2-screen"],
  },
  {
    path: "/medicine",
    title: "Medicine Checker",
    group: "Clinical & family",
    mode: "medications",
    inputs:
      "Reviewed product/ingredient strengths, route, explicit fixed-daily or PRN source instructions, status and calendar dates",
    pipeline: [
      "Preserve source quantity and schedule",
      "Gate date, route, ingredient label and unit dimension",
      "Review scheduled subtotals, optional PRN ceilings and repeated labels",
    ],
    output:
      "Editable source plan, dated ingredient review, inclusion/exclusion reasons, arithmetic provenance, CSV/JSON and personal report",
    current:
      "Working local medication source register and deterministic plan arithmetic. Unknown quantities and complex schedules stay unresolved; source-listed PRN ceilings are not safe limits. No interaction, contraindication or personal PGx assessment is installed.",
    next: "Validate a pinned external medication/PharmCAT report adapter with person/identity, guideline version and coverage checks before any gene–drug or drug–drug claim. Family Hub now has separate history profiles; existing personal imports remain unassigned.",
    sources: ["fhir-medication", "medplum-medications", "medextractor-screen"],
  },
  {
    path: "/bloodwork",
    title: "Blood Work",
    group: "Clinical & family",
    mode: "bloodwork",
    inputs:
      "Lab CSV with values, units, collection dates and optional reference intervals",
    pipeline: [
      "Review parsed observations",
      "Preserve laboratory units and ranges",
      "Group comparable results by marker, unit and lab",
    ],
    output:
      "Searchable longitudinal biomarker table, dated history and CSV/JSON report",
    current:
      "Personal lab imports replace demo biomarker cards; missing reference ranges stay unclassified.",
    next: "Add explicit, reviewed analyte mapping and unit conversions, retaining the original measurement.",
    sources: ["medplum", "function"],
  },
  {
    path: "/family",
    title: "Family Hub",
    group: "Clinical & family",
    mode: "family",
    inputs:
      "Separate source-backed person profiles, typed parent/caregiver links and explicit history assertions",
    pipeline: [
      "Validate identities, references and directed relationships",
      "Keep source assertions within their owning profile",
      "Review record coverage and export one person explicitly",
    ],
    output:
      "Person-specific history, entered connection inspector, mixed-assertion flags, selected-person CSV/JSON and reviewed full-workspace backups",
    current:
      "Working local Family Hub with profile/history CRUD, source chronology, reference/cycle gates and separate exports. Existing personal imports remain unassigned; no genetics, inheritance or disease-risk prediction is performed.",
    next: "Medical Records now has explicit attribution previews, reviewed file/paste backups and separate person exports. Evaluate multi-person source-store isolation before extending profile scope; Offspring Risk remains a demo until verified parental haplotypes and a validated clinical endpoint are available.",
    sources: ["fhir-family", "pedigreejs", "family-extraction"],
  },
  {
    path: "/offspring",
    title: "Offspring Risk",
    group: "Clinical & family",
    mode: "demo",
    inputs: "Confirmed parental genotypes and an explicit inheritance model",
    pipeline: [
      "Verify parental calls",
      "State Mendelian assumptions",
      "Show genotype transmission probabilities",
    ],
    output: "Illustrative inheritance table, not disease penetrance",
    current:
      "Punnett-square results use demo genotypes and do not estimate a child's disease probability.",
    next: "Require validated parental calls, linkage/phase context and appropriate counseling before personalized interpretation.",
    sources: ["phenotips", "clinvar"],
  },
  {
    path: "/enrichment",
    title: "Pathway Enrichment",
    group: "Genetics",
    mode: "demo",
    inputs: "Defined query genes and a defensible tested background",
    pipeline: [
      "Resolve gene identifiers",
      "Use a stated background",
      "Correct for multiple tests",
    ],
    output: "Term overlap table with adjusted p-values and database version",
    current:
      "Pathway plots and p-values are illustrative, not an analysis of your genome.",
    next: "Expose the background, query size, overlaps and correction method before enabling real results.",
    sources: ["gprofiler"],
  },
  {
    path: "/gwas",
    title: "GWAS & Disease",
    group: "Genetics",
    mode: "demo",
    inputs: "Study-level associations, effect alleles and ancestry metadata",
    pipeline: [
      "Harmonize allele and build",
      "Retain study population",
      "Show reported effects with uncertainty",
    ],
    output: "Study-linked association browser",
    current:
      "Disease associations are a fixed demonstration; no personal disease risk is calculated.",
    next: "Ingest versioned GWAS Catalog records with effect-allele and population context.",
    sources: ["gwas"],
  },
  {
    path: "/comparison",
    title: "Family Comparison",
    group: "Clinical & family",
    mode: "demo",
    inputs: "Two distinct profiles with harmonized, quality-controlled calls",
    pipeline: [
      "Keep profiles separate",
      "Match build and allele orientation",
      "Count callable concordant sites",
    ],
    output: "Variant comparison with missing and unresolved calls",
    current: "The self/partner comparison uses fictional profiles.",
    next: "Add separate profile imports and a denominator of jointly callable variants.",
    sources: ["snps", "fhir-family"],
  },
  {
    path: "/prs",
    title: "Polygenic Risk",
    group: "Genetics",
    mode: "demo",
    inputs:
      "A versioned PGS scoring file, harmonized genotypes and reference cohort",
    pipeline: [
      "Match effect alleles and weights",
      "Report matching QC",
      "Normalize against an appropriate reference",
    ],
    output:
      "Score, match coverage and ancestry/reference-specific distribution",
    current:
      "PRS percentiles and disease estimates are illustrative; no validated personal PRS has been computed.",
    next: "Integrate a reproducible scoring pipeline with score ID, build, matching QC and calibration evidence.",
    sources: ["pgsc", "gwas"],
  },
  {
    path: "/pharmacogenomics",
    title: "Pharmacogenomics",
    group: "Genetics",
    mode: "demo",
    inputs:
      "Validated pharmacogene calls including required structural-variant context",
    pipeline: [
      "Resolve haplotypes and diplotypes",
      "Translate to a supported phenotype",
      "Attach gene–drug guideline evidence",
    ],
    output: "Gene-level report with no-call/coverage and guideline versions",
    current:
      "Metabolizer profiles are demo examples. Imported consumer SNPs do not generate PGx phenotypes.",
    next: "Consume a versioned PharmCAT report and preserve ambiguous diplotypes and untested genes.",
    sources: ["pharmcat", "cpic"],
  },
  {
    path: "/import",
    title: "Import Data",
    group: "Overview",
    mode: "import",
    inputs: "CGM, raw genotype and laboratory CSV/text/Excel files",
    pipeline: [
      "Parse on this device",
      "Preview values and quality notes",
      "Save locally after review",
    ],
    output: "Reviewed local datasets with source filename and import date",
    current:
      "CGM, small-panel genome matching and blood-work CSV imports run locally.",
    next: "Add explicit provider adapters and format fixtures; evaluate document extraction independently.",
    sources: ["omh", "medplum", "snps", "medgemma"],
  },
];

export function sectionGuide(path: string) {
  return SECTION_GUIDES.find((section) => section.path === path);
}
export function sourcesFor(section: SectionGuide) {
  return RESEARCH_SOURCES.filter((source) =>
    section.sources.includes(source.id),
  );
}
