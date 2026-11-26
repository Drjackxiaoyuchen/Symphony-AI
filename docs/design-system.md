# Symphony AI visual baseline

Status: **working proposal, awaiting the user's visual acceptance** (2026-11-19).

Keep one scheme across the product: warm ivory canvas, white surfaces, dark copper controls, warm neutral text and serif headings. Improve the detail within this direction. The user has the final say on UI acceptance; publishing a tested revision does not establish acceptance. Do not replace the visual direction or describe it as approved without explicit feedback.

## Shared tokens

The source of truth is `tailwind.config.ts`, with matching global CSS variables in `src/app/globals.css`.

| Purpose                  | Token / value                       |
| ------------------------ | ----------------------------------- |
| Canvas                   | cream / `#F6F1EB`                   |
| Surface                  | white / `#FFFFFF`                   |
| Border                   | cream-300 / `#E8E0D4`               |
| Primary controls         | copper / `#8A644B`                  |
| Primary text             | stone-800 / `#2D2A26`               |
| Secondary text           | stone-600 / `#5E5A55`               |
| Small text               | stone-400 / stone-500 / `#716C66`   |
| Body / labels / metadata | 16 / 14 / 12 px equivalents, in rem |
| Cards / controls         | 16 / 12 px radii                    |

Use copper for interactive emphasis and continuous audit scales. Muted sage/rose/amber are reserved for data semantics, not new section themes. Keep charts' units, denominators and missingness visible. Controls need a visible keyboard focus state; data inspection must be available by selection rather than hover alone. Tables and matrices may scroll inside their own region on narrow screens.

## First daily revision for review

- Shared typography and text/primary-control contrast refined across the app.
- Glucose workspace has section links, grouped controls, a day-by-hour audit with selectable cells and a detailed inspector, consistent export controls, and quieter method disclosure.
- UI acceptance: **pending user review**. Scientific methods and limitations are documented separately in [the CGM audit method](methods/cgm-quality-v1.md).

2026-11-20: Medical Records extends the same cards, fields, controls, typography and colors into a personal source register. No theme or global token change was made. UI acceptance remains pending.

2026-11-21: Genome Tracker uses the same scheme for a source register, neutral classification text, inspection flags, source chronology, responsive identity/source fields and portable evidence tools. No theme tokens changed; UI acceptance remains pending.

2026-11-22: Medicine Checker extends the same cards, controls and typography to source records, responsive ingredient fields, dated quantity review and inspectable arithmetic. No theme token changed; UI acceptance remains pending.

2026-11-23: Family Hub uses the same scheme for person selection, source assertions, separate relationship types, inspection flags and scoped export controls. No global theme token changed. Profiles are data containers, not access-control boundaries. UI acceptance remains pending.

2026-11-24 proposal: Medical Records attribution reuses the existing cards, fields, copper controls, paired source/person contexts, neutral change flags and responsive grids. No global theme token changed. Automated checks pass; browser control timed out repeatedly before desktop/mobile inspection. Screenshots and browser validation remain pending, so the proposal is retained in a pull request. User visual acceptance remains pending.

2026-11-25: Completed attribution desktop/mobile review using invented records. Compact three-column mobile counters, paired review context and pasted-JSON backup preview use the same tokens and controls. Confirmation clears stale revoke/undo feedback. Screenshots are published for review; user visual acceptance is still pending.

Next: collect visual feedback and continue the same scheme in person-scoped source-store work. Keep scientific validation independent from visual acceptance.

2026-11-26: The reference audit extends the same typography, neutral source context, copper disclosures and review controls. Long target URIs wrap in a named, keyboard-focusable table with bounded internal scrolling. Pasted FHIR input follows the existing backup-preview pattern. Desktop/mobile screenshots are proposals; user visual acceptance remains pending.
