# CI Unified User Edit: field classification and rollout

Base: v0.6.11. User entry directly opens the customer flow. Draft is in memory and custom-page and User introduction changes are saved through a verified readback. Existing `AVA_CI_USER_STATE_V1` / schema 3 and backup format remain unchanged; no legacy-field migration is performed. Existing page media references and other metadata are copied from the saved snapshot, never accepted from edited draft data. Customer scenario writes preserve the latest stored pages and preferences to avoid an ordinary navigation overwriting a different tab’s presentation changes. Customer scenario data continues to use its pre-existing persistence path.

| Field | Classification | Treatment |
| --- | --- | --- |
| User page title, subtitle, content | ALLOW for personal non-product copy | Editable beside its page, text escaped; user remains responsible for accuracy |
| User page create/delete/order/visibility | ALLOW | Drafted, previewed, verified local save |
| User page type, media, reference metadata, flowPosition, overrides, timestamps | PRESERVE | Existing references are retained; no new user cloud provider exists, upload remains unavailable; type is selected on creation |
| `introTitle`, `introSubtitle`, `introSupport` | USER OWNED with content review required | Exact existing User values are preserved; editable and displayed as labelled personal presentation beside fixed Official/default introduction. User-entered claims are not validated or treated as authoritative; individual historical text cannot be automatically classified. |
| `showIntro` | USER PRESENTATION | Controls personal introduction visibility; fixed introduction and customer navigation remain visible. Legacy boolean retained. |
| flow, selectedPlanIds, frontstage | CUSTOMER SCENARIO | Existing journey operations preserved, not User presentation fields |
| resourceOverrides, overrides | REVIEW REQUIRED | Kept without modification by presentation save |
| claims, benefits, premiums, eligibility, product content, calculations, Admin and Official write | PROTECTED | No editing or changes |

Rollback: export the existing structured backup before edits; no format migration is required. On write failure the in-memory draft is retained; readback failure attempts rollback only if the written value can still be identified. If rollback cannot be verified the user must inspect and restore their backup. Simultaneous edits to the same pages in another tab are rejected where detected; localStorage provides no atomic cross-tab locking.

No legacy data migration or rewriting is performed. Historical mixed text remains User-owned and visibly labelled as personal presentation, but its accuracy and any embedded product claims require human review. The fixed introduction remains separately visible. A backup export includes the current draft for recovery; restoring it replaces the selected local backup state, so back up the current saved state before restoring. Existing Cloud Storage upload has no configured User provider. A native modal dialog provides the discard confirmation, focus containment and Escape handling. Physical devices, live deployment and external services require separate verification.
