# Claude audit follow-up — 2026-11-06

This note records the disposition of the remaining findings from the Claude review. It distinguishes implemented corrections from items that require a separate, risk-controlled operation or further source material.

## Implemented in this PR

- Production service-worker cache names are generated from a SHA-256 digest of the copied application assets, DOCX templates, and legal source files. The service worker source uses a development placeholder; CI verifies that the production build replaces it with a deterministic hash.
- The service worker's three-second network timeout and cached fallback were implemented in PR #83.
- The eight commerce skeletons are explicitly marked as temporary in the template library. The warning is shown in the application UI and is no longer printed into generated documents.
- Commerce DOCX packages now include a styles part and a relationship to it, so the Title paragraph style has an actual definition.
- Mobile and unsupported-browser messaging now explains that the personal-folder picker is desktop Chrome/Edge functionality and that local browser storage remains the fallback. Users are warned not to clear browser data without a backup.
- Generated DOCX text receives conservative, XML-text-node corrections for the specific Greek spelling/typography issues reported: «ενώπιιον», «κατηγορούμενου», «κρατούμενου», «επισκέψείς», «ποιά», «σηματική αναφορά μας», Latin Y in «Yποβολή», Greek ordinal Β΄, repeated spaces, and spaces before punctuation.
- A targeted pre-replacement correction routes the investigator-B service wording to `officerB.service` instead of `officerA.service`.
- Regression tests now recognize Greek Unicode placeholders in noise and commerce documents and test the new DOCX normalization and investigator mapping behavior.

## Findings rechecked; intentionally preserved

- The `02/10/1985` reference in the noise-document context corresponds to the publication date of Υγειονομική Διάταξη Α5/3010/1985, ΦΕΚ Β΄ 593/2-10-1985. The date is not changed to a different legal instrument. This is a source-identification check, not a legal opinion about the provision's current applicability.
- The fixed recipient details in the narcotics submission/chemical-service documents are recipient-service information, not the issuing police unit. They must not be blindly replaced with the user's local police service. The official recipient names and contact details should be rechecked against the relevant authority before operational use.
- The current narcotics-10 metadata exposes only `officerA.fullName` as a mapped field; the claimed date-field replacement cannot be inferred from that metadata. The original DOCX body needs a direct binary-document review before changing its printed date blanks.
- The existing `case.date` derived fields already cover narcotics-01 and narcotics-06. No new date placeholders are inserted into documents without confirming the original form's intended wording and location.

## Not part of an ordinary code PR

- Git history containing personal information introduced by PRs #56, #61, #72 and #75 still requires a targeted history rewrite. Making the repository private does not remove old Git objects, PR diffs, forks, or cached views. This must be handled as a coordinated `git-filter-repo` sensitive-data-removal operation, followed by force-with-lease pushes and GitHub Support follow-up. It must not be simulated by deleting current files or by rewriting unrelated history.
- The 1 MB template data module has been split into independent category chunks. The template library now dynamically imports and seeds only the category opened by the user. The service worker precaches all category chunks for offline first use; per-category lazy loading and idempotent seeding are covered by regression tests.
- The signature layout in narcotics-02 still needs a direct DOCX layout review before converting space-aligned signatures into a Word table.
- Full visual/functional review of every generated DOCX, including Word on Android, remains part of the final manual acceptance test.

## Safety constraints

No legal provision was automatically selected or changed by this follow-up. No real personal data was added. The application remains local-first; no cloud sync, telemetry, or AI processing was introduced.