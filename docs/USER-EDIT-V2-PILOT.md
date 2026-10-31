# CI User Edit v2 — original-screen pilot

This CI-only product-owner pilot removes the v1 preview state; it does not modify Mother Standard. The eligible sequence is the original homepage followed by the existing User-created pages in stored order. Official-only plan, claim and premium pages do not appear in edit navigation; the complete customer journey remains available in Frontend.

## Homepage ownership and mapping

| Display position | Existing User setting | Classification |
| --- | --- | --- |
| Original `生活支援預備金` heading | `introSubtitle` | User-overridable sales presentation |
| Original introductory paragraph | `introTitle` | User-overridable sales presentation |
| Original support paragraph | `introSupport` | User-overridable sales presentation |
| Display choice | `showIntro` | Enables User overrides; false displays fixed defaults without deleting any saved text |
| Fixed treatment / recovery / living-expense illustration | None | Read-only fixed content |
| Benefits, eligibility, terms, premiums, claims, calculations | None | Protected; never edited here |

User and Frontend use the same homepage rendering function. Nonempty enabled User text replaces the default at its original position; empty values fall back to the original. The Official/default source stays unchanged. This maps the existing fields directly without changing storage schema or rewriting legacy values. Historical User text remains retained, but it may contain statements requiring human review for accuracy; User-origin text is not validated as official fact. A disabled User override can be re-enabled without losing the stored values.

User-created pages retain IDs, order, flowPosition, media references and backup compatibility. The existing CI customer frontstage renders those pages after the homepage; the pilot does not relocate them. Save validates and verifies the existing local-storage transaction; cancel, write/readback failure, and cross-tab conflict retain their established handling. localStorage is not an atomic compare-and-swap. Backup export includes the working draft. Explicit full backup restore remains the previous immediate restore operation and replaces local saved data; export a backup first.

Physical devices, installed PWA, embedded WebView, and live production integrations remain separate checks. Product-owner visual review is required before merge or any cross-App standardization.
