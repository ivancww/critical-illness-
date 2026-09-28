# AVA Critical Illness — Build Report

## Current branch

`codex/ava-integration-readiness` (integration-readiness audit changes are in progress).

## Mother Standard studied

- Local AVA Platform `origin/main`: `f5c7b3e` (`Merge pull request #34 from ivancww/codex/enable-medical-user-entry`).
- Current local compliance checkout also studied: `fa5304a` (`docs: standardize independent app entry contract`) on `codex/standardize-independent-app-entry-contract-v2`.
- Mother `main` was refreshed before this audit; the Platform checkout was not modified.
- Read: `AGENTS.md`, `docs/MOTHER-RULES.md`, `design-system/DESIGN-SYSTEM.md`, `docs/ciapp-module-integration.md`, `docs/single-home-screen-pwa-architecture.md`, `docs/homepage-architecture-v1.13.md`, and `docs/homepage-cloud-integration.md`.

## Work completed

- Extended the existing Guided Flow from four screens to the requested customer sequence: intro, concern, core explanation, time, monthly need, quantified reserve, existing protection, months visualization, protection style, timeline, cancer model, other continuing protection, claim-example state, and plan matching.
- Preserved the confirmed cancer shared 500% pool, A→B transition, B→A rejection, and Dementia/Parkinson lifetime 6% model.
- Added shared support-reserve and coverage-month domain calculations.
- Added explicit `Manual` existing-protection source metadata and space for future policy references.
- Kept products data-driven with active/inactive handling and historical resolution.
- Kept premium calculations verification-gated; no official matrix coordinates or fabricated fallback rates were added.
- Added safe pending/unavailable official content states and a complete exported VERIFY register.
- Added direct Plans access and state-preserving Guided → Plans → Guided navigation.
- Added Customer Presentation mode with customer-focused figures and reduced agent chrome.
- Restricted User editing to `?avaEntry=user`; Frontstage `?avaEntry=frontend` does not expose editing controls.
- Added User Edit / Preview / Save Local flow, user-created content/image/video pages, ordering, visibility, page limits, structured backup/restore, media-reference-only persistence, and safe media failure handling.
- Added version-aware official cache metadata and QR restore-pointer validation without credentials or full user data.
- Did not implement or fabricate CRM, Firebase, Cloud Storage, production QR restore, Admin capability, or unsupported premium calculations.

## Files changed in this worktree

- `src/app.js`, `src/styles.css`
- `src/domain/flow-state.js`, `src/domain/verification.js`
- `src/data/storage.js`
- `tests/domain.test.js`, `tests/state.test.js`
- `docs/MOTHER-COMPLIANCE.md`
- `REPORT.md`
- `index.html`, `src/app.js`
- `tests/integration-readiness.test.js`

The repository began as an uncommitted worktree, so the other listed app files are existing supplied implementation files rather than changes made during this pass.

## Status by area

| Area | Status | Notes |
| --- | --- | --- |
| Customer Flow | Code complete | 14-stage Guided Flow; confirmed business rules preserved. |
| Direct Plan access | Code complete | Direct `#/plans`; state persists when returning to flow. |
| Product Engine | Code complete | Records, active/inactive filtering, historical resolution. |
| Premium Engine | Safe incomplete / VERIFY | Adapter remains gated until exact source mappings are evidenced. |
| Benefit Engine | Code complete for available data | Shared product/benefit/claim data rendering. |
| Customer Presentation | Code complete | Customer-focused figures and presentation mode. |
| User Editing | Code complete for local scope | `avaEntry=user`; protected official layer preserved. |
| Media | Safe incomplete | Cloud provider not configured; no binary stored locally. |
| Backup/Restore | Code complete for structured local scope | Media binaries excluded; references preserved. |
| QR Restore | Safe architecture only | Pointer validation only; no production backend or auth fabricated. |
| Front/User/Admin | Front/User implemented; Admin unsupported | Admin fails safely and points to AVA Studio. |
| Return to AVA | Implemented | Persistent `../avaplatform/` destination used by current deployment convention. |
| Responsive/PWA | Static/browser checks pass | Manifest/service worker retained; physical device/PWA chrome not certified. |

## Tests run and exact results

- `npm test` — **BLOCKED**: `npm`/Node is not installed in the environment (`/bin/bash: npm: command not found`). Existing and added Node tests were not falsely marked as passed.
- Local preview server — **PASS**, `python3 -m http.server 8083`.
- Browser Guided Flow / Plans / return-state check — **PASS** at 390×844, 834×1194, 1194×834, and 1440×900.
- Browser console/page-error check — **PASS** at those four viewports; no console errors or page errors observed.
- Horizontal overflow check — **PASS** at those four viewports.
- User Edit persistence and Customer Presentation chrome check — **PASS** at 834×1194.
- Browser domain-focused checks — **PASS** for support reserve, coverage-month translation, cancer shared pool/A→B/B→A, lifetime dementia/Parkinson model, unverified premium refusal, media-binary exclusion, and QR pointer validation.
- Physical iPhone, HONOR Magic V5, iPadOS Safari, and installed-PWA checks — **BLOCKED / NOT EXECUTED**; only Chromium viewport emulation was available.
- AVA Design System `validate.py` — **PASS** for canonical fixture validation: CSS parsing/variables/responsive boundaries plus Chromium 11 responsive viewports and interaction checks. This validates the Platform fixture, not physical-device Safari or the independent app’s cloud integrations.

## Remaining incomplete work

- Install/provide Node/npm and run the complete Node test suite and regression tests.
- Verify exact premium sheet row/column, smoker, precision, rounding, conversion, 1.06, and Vitality ordering against authoritative source data before displaying a premium.
- Configure the approved Cloud Storage provider and production authorization/reconnect flow.
- Connect official Firebase/Google metadata resources when real references exist.
- Integrate the App through AVA Platform registry/gateway after independent deployment readiness and live entry-contract verification.
- Complete physical-device and installed-PWA validation.

## Complete VERIFY register

1. Premium matrix row mapping
2. Premium matrix column mapping
3. Smoker/non-smoker mapping
4. Hidden premium precision
5. Premium rounding order
6. Monthly conversion factor/order
7. Vitality application order
8. Current Vitality fee/reward/terms
9. Product IDs/codes where not officially established
10. Protection end age
11. First-10-year enhancement eligibility
12. Exact first-10-year boundary
13. Early CI contractual conditions
14. Child CI contractual conditions
15. Cancer eligibility conditions
16. Cancer interval/waiting contractual wording
17. Heart/stroke contractual conditions
18. Dementia/Parkinson qualifying conditions
19. Dementia/Parkinson payment timing
20. Official Firebase resource mappings

## Git status

Current repository status is clean on the integration-readiness branch after audit changes. AVA Platform working tree remains unchanged.

## Integration Readiness Audit

- `?avaEntry=frontend` renders the actual customer Frontstage without User editing controls.
- `?avaEntry=user` renders that same Frontstage with direct User/Edit capability; Preview now includes Save Local.
- Unsupported non-empty `avaEntry` values fail safely without exposing Frontstage or Admin controls.
- User Overrides remain Local-first and survive reload/reopen through the existing storage layer.
- Return to AVA uses the caller-provided browser return context and preserves its AVA surface query context; no guessed Platform deployment URL is used. Direct or standalone opens without a valid caller context show a safe unavailable-context status.
- PWA scope and service-worker ownership remain independent; installed-PWA browser-chrome behavior remains environment-dependent and requires physical validation.
- Official product, calculation, premium, benefit, claim, health, content, and flow business logic was not changed by this audit.

## PR readiness

**Integration changes require PR review with documented limitations.** Node/npm test execution and physical/device/PWA checks remain unavailable. No merge was performed.


## PR #1 final review addendum — 2026-09-28

- Reviewed PR #1 against the current AVA Platform `main` Mother Rules and Root `AGENTS.md`.
- Fixed the Guided Flow reserve calculation so `desiredMonths × monthlyNeed` is used by the actual app.
- Fixed User Override rendering for the intro visibility setting.
- Implemented an actual unsaved Edit → Preview draft path before Save Local.
- Corrected product rendering to support the current Google Sheet field names and `single` / `continuing` protection-style values.
- Corrected Benefit and Product Content field handling for the current structured schema.
- Removed the incorrect app-wide Image/Video Page count restriction; per-page media limits remain enforced by normalized page data.
- Gated the unverified first-10-year enhancement calculation instead of exposing legacy +50%/+35% logic as confirmed official logic.
- Added GitHub Actions Node 22 CI so the Node test suite is no longer blocked by the Cloud Shell environment.
- Final GitHub Actions push run and pull-request run for head `3c2217c` both completed successfully.
- Remaining VERIFY items require authoritative product/source evidence and are intentionally fail-safe; they are not silently fabricated.
- Cloud Storage provider, official Firebase resource links, physical-device installed-PWA certification, and AVA Platform registry integration remain later environment/integration work. Per Mother Rules, Platform registration and live integration verification follow Independent App review/merge.
