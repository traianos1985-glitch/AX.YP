# PR quality gates and CI lessons

This document is the persistent checklist for this repository. Update it whenever a PR exposes a new failure mode or a corrective change. The goal is to make future dossier/template PRs predictable and to avoid repeating already diagnosed CI failures.

## Current rule: do not merge on partial success

A PR is ready only when all required GitHub Actions jobs pass on the latest head commit, including:
- `Validate, test and build` (legal-data validation, source-link checks, regression suite and production build).
- `Production browser case lifecycle` (Chrome and Firefox E2E).
- Any other required checks configured by the repository.

Vercel is a separate deployment/status check. Record it separately; do not confuse a Vercel failure with a GitHub Actions job failure. Do not claim tests passed based on an earlier commit or on only one successful job. Keep the PR draft and do not merge until the latest commit is green.

## Failure history and fixes

### Narcotics official package PR #141

Branch: `feat/narcotics-official-package-v2`

1. **Missing test import**
   - Commit: `353dcd6488cd32e05651220aa4fb826e21362734`
   - Failure: the narcotics official-package test used `unzipSync` without importing it.
   - Fix: import `unzipSync` from `../vendor/fflate.js` alongside the other fflate helpers.
   - Prevention: when adding ZIP/DOCX tests, verify every helper import and run the exact test locally before pushing.

2. **Missing dossier field mapping**
   - Commit: `59389e14dc51e99ba93b3239b233eca11768e17e`
   - Failure: the synthetic official-package test exposed that `valueFor()` did not resolve `offender.taxOffice`.
   - Fix: add `offender.taxOffice` (and the sibling `offender.taxId`, `offender.phone`) to the field-value mapping.
   - Prevention: every new template placeholder must have a matching mapping test with realistic synthetic data; test every path, not just the common fields.

3. **Chrome guided-workflow step transition timed out**
   - Failure: `tests/browser-case-lifecycle.mjs` timed out waiting for workflow step 2.
   - Root cause: the first-step handler called form-wide `form.reportValidity()`; required controls in other hidden steps/category sections could block navigation.
   - Fix: `case-workflow.js` added `validateStep(section)`, validating only the current visible step, and replaced the form-wide validation calls for the first-step transition.
   - Prevention: validate only the active wizard step for navigation. Never use form-wide validation to decide whether a user may leave one step.

4. **Firefox saved-case E2E failed after Chrome passed**
   - Diagnostic commit: `302e433aae2ce61cf9d97a559c7b36138e3087b1`.
   - Failure: Firefox's native form validation rejected the final save. The diagnostic showed numerous required controls inside hidden category fieldsets/wrappers. Chrome's E2E passed, so Chrome alone was not sufficient coverage.
   - Important distinction: do not remove `required` from legitimate active-category fields and do not disable all hidden wizard steps. Values from earlier wizard steps must remain enabled and be saved.
   - Partial fix attempt: commits `62c8e5d30dcbddd433eb255f467efb622b59352f` and `db56ec3093e7b8978f741498ff12ec03e630db3a` attempted to disable controls in hidden category fieldsets. Run #1369 still failed in Firefox, showing that the selector did not cover every hidden category wrapper.

5. **Run #1369 exact outcome**
   - Commit under test: `db56ec3093e7b8978f741498ff12ec03e630db3a`.
   - `Validate, test and build`: passed (including regression tests and production build).
   - Chrome production browser E2E: passed.
   - Firefox production browser E2E: failed at the pre-save `form.checkValidity()` assertion. The diagnostic listed hidden invalid fieldsets and required inputs, including number inputs with empty values.
   - Vercel: separate failure status on this commit; it is not the Firefox test failure.

6. **Category-control handling — superseded and verified by final CI**
   - Commit: `702cb40c73d7a6c5b54535125124cea62612a99b`.
   - Change: after category visibility is applied, inspect all form controls and disable controls only when they have a hidden category ancestor (`[hidden]:not(.case-workflow-step)`). Restore controls previously disabled by this mechanism when their category becomes visible.
   - Explicitly exclude hidden wizard-step sections from this disabling rule: the wizard hides prior steps temporarily, but their entered values must remain enabled and included in the saved dossier.
   - Outcome: this broad scan was not sufficient by itself; later dynamic-field and wizard-step fixes below completed the correction. The final CI run #1383 passed both browser engines.

7. **Firefox still rejected hidden required controls on run #1373**
   - Tested PR merge commit: `42cb9db69b159309974020b92cf2f213b13776f4`, corresponding to feature head `576396b6c66718fbaa7599e844360899dea2a077`.
   - Run: `1373`; regression/build job passed and Chrome production E2E passed, but Firefox failed at the pre-save `form.checkValidity()` assertion.
   - The invalid controls were still inside hidden fieldsets/category wrappers. The previous broad scan was correct for controls already present, but it ran before schema-driven category fields were dynamically inserted by `renderCategoryFields()`. Those newly inserted required controls were never passed through the disabling rule.
   - Fix attempt: observe form subtree additions and re-run `applyCategoryFields()` only when inserted nodes contain form controls. This preserves the values and keeps prior wizard steps enabled; inactive category fields are disabled after they are rendered. The Firefox test now records disabled state and hidden-ancestor identity for every invalid control.
   - Outcome: the MutationObserver correction is included in the final green head. Final CI run #1383 passed Firefox and all required jobs.

8. **Run #1378/1379 exposed two distinct browser failures**
   - On merge commit `73fe30f4862ff630128363df45b64ddcfcbdcc82`, run #1378 Firefox failed at the final `form.checkValidity()`: required inputs from the hidden wizard step 2 remained `willValidate=true`. The diagnostic showed the hidden ancestor was `.case-workflow-step`, not a hidden category wrapper. Excluding wizard steps from category disabling was correct for preserving values, but native validation still evaluated their required attributes.
   - Fix attempt: `syncStepRequiredState()` temporarily removes the `required` attribute from controls in inactive wizard steps, retaining an explicit marker and restoring the attribute when that step becomes active. Controls remain enabled, so values from previous steps remain available to dossier serialization. Category-disabled controls remain non-validating and regain required status only when both category and wizard step are active.
   - Run #1379 Chrome failed separately at application reload with `CDP command timed out: Runtime.evaluate` in `tests/browser-case-lifecycle.mjs:233`. Production build and regression job passed. This reload/renderer timeout is not yet root-caused and must be investigated independently; do not conflate it with the Firefox required-field issue.
   - Outcome: `syncStepRequiredState()` is included in the final green head. The later CI run #1383 passed both Chrome and Firefox. The separate Chrome CDP reload timeout did not recur in that successful run; treat it as a transient runner/browser timeout, not as a proven application defect, and investigate from fresh logs if it recurs.

### 11. Compressed published-package payloads must be one stream

- For `.axyp.pack.json` descriptors with `encoding: "base64-chunks"`, every `.b64` part is a **text slice of the same single Base64 encoding** of one complete `zlibSync(...)` payload.
- Correct generation order: serialize the complete package JSON once; compress the complete JSON once; Base64-encode the compressed bytes once; split that Base64 string into bounded text files without re-compressing individual chunks. Concatenate the text parts in descriptor order before Base64 decoding, then call `unzlibSync` once.
- Never concatenate independently compressed zlib streams or mix chunks produced by different package-generation attempts. A matching `byteLength` proves only decoded byte count, not stream integrity.
- Before updating a PR, run the exact package test and verify that the concatenated bytes successfully decompress to valid JSON with the expected `schemaVersion`, `category`, document count, and DOCX parts. Then run the full CI suite; do not use diagnostic-only changes as a substitute for repairing the payload.
- Reference implementation: the existing `narcotics-v2.axyp.pack.json` / `narcotics-v2-clean.b64` package uses one complete Base64-encoded zlib stream.
- PR #147 failure mode (2026-11-11): the three submission `.b64` files had the expected combined byte length but did not form one valid compressed stream; `unzlibSync` failed with `invalid distance`. The regression test was not to be weakened.

## Rules for future dossier/template PRs

1. **Start from the latest green main branch.** Keep each dossier/category in its own focused PR/branch. Do not stack unverified changes from unrelated work.
2. **Preserve the original official document.** Do not rewrite source text or OOXML structure/layout. Only approved placeholder substitutions are allowed. Do not introduce real case PII into source code, fixtures, test snapshots, logs, commit messages, or deny-lists.
3. **Use synthetic test data only.** Include plausible but invented names, identifiers, dates, amounts and contact details. Scan all fixtures and commit diffs for sensitive source strings before pushing.
4. **Build a complete placeholder-to-field map.** For every placeholder, verify:
   - exact path exists in the field schema or explicit custom mapping;
   - correct grammatical form/date/number/unit formatting;
   - empty/optional value behavior;
   - generated DOCX output contains the expected synthetic value;
   - no unresolved placeholder remains unless intentionally documented.
5. **Test document fidelity.** Validate DOCX ZIP/XML integrity, visible text, headers/footers/tables/relationships and layout/page count where applicable. Do not accept a build-only pass as proof of document fidelity.
6. **Test all browser engines configured in CI.** Run the full regression/build suite and both Chrome and Firefox production E2E. Browser-native validation differs; a Chrome pass does not establish Firefox correctness.
7. **For guided forms:** validate only the active step during step navigation. Hidden category-specific controls must not block final validation. Disable only controls hidden because their category is inactive; never disable prior wizard-step controls just because the step is temporarily hidden. Restore disabled controls when their category is selected again. Add browser tests for category switching, required-field behavior, retained values, save and reload.
8. **Do not weaken validation to silence CI.** Identify the exact invalid control and its hidden/disabled ancestry. Preserve required validation for the active category and core dossier fields.
9. **Inspect the actual failing job log.** Record commit SHA, run number, job, failing step, assertion and root cause before changing code. Avoid speculative edits and multiple unrelated fixes in one commit.
10. **Re-run after the final change.** Only the latest commit's complete green checks count. Keep draft status until then; the user performs the merge.

## Per-PR closeout record

Append a short entry below for each future dossier PR:
- PR number / branch:
- Dossier/category and templates:
- New field paths/placeholders:
- Tests added/changed:
- CI run + exact head SHA:
- GitHub Actions jobs:
- Vercel status (separate):
- Failures and confirmed root causes:
- Fix commits:
- Final verification:


## Final closeout — PR #141 (verified 2026-11-09)

- Final tested feature head before this documentation closeout: `d3251384d4d80add43793846078524b31a49a01d`.
- GitHub Actions run: **#1383** (`42693533942`), conclusion: **success**.
- `Validate, test and build`: **success** — legal-data validation, source-link checks, regression tests and production build all completed successfully.
- `Production browser case lifecycle`: **success** — production Chrome E2E and production Firefox E2E both completed successfully.
- Vercel status for the same head: **success** (separate from GitHub Actions).
- PR #141 remains open and unmerged. The user performs the merge.

### Consolidated prevention notes from the full failure sequence

- ZIP/DOCX tests must import every fflate helper they call; specifically the missing `unzipSync` import was fixed.
- Every official-template placeholder must be covered by an explicit field mapping and a synthetic-value regression assertion; the missing tax-office mapping and sibling tax ID/phone mappings were added.
- Wizard navigation validates only the active step; never call form-wide `reportValidity()` to advance past a step.
- Inactive category controls must be disabled after category rendering, including dynamically inserted fields; reapply category state when the form subtree receives new controls.
- Do not disable prior wizard-step controls merely because their step is hidden: their values must remain available for save/serialization.
- Native browser validation must ignore required fields in inactive wizard steps. Preserve their required state using a reversible marker, and restore it when the step becomes active. Active category/core fields must still be validated.
- Always run both Chrome and Firefox production E2E. Chrome passing alone did not catch Firefox's native validation behavior.
- Treat a Chrome CDP `Runtime.evaluate` timeout during reload as a separate failure from form validation. Inspect its own logs and reproduce before changing application code or merely increasing timeouts. It did not recur in successful run #1383.
- A green result counts only for the exact latest head SHA, with every required job complete. Vercel must be recorded separately.
