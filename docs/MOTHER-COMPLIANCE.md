# Critical Illness Mother Standard Sync

This app keeps Critical Illness business logic, Google Sheet/GAS integration, Benefit Engine and Claim Rule Engine in this repository. The sync adds only the Independent App compliance layer.

## Current limitations

- No Cloud Storage provider is configured for this app. Image/video upload therefore fails safely with `CLOUD_STORAGE_UNAVAILABLE`; no media binary is written to IndexedDB, LocalStorage, Base64 data, or the app database.
- Image and Video Pages retain typed, provider-independent Cloud references only. Image Pages are capped at six items; Video Pages are capped at one item. Missing media renders a safe fallback and does not stop the Flow.
- User Backup is structured JSON with schema/version, User settings, overrides, pages, ordering, visibility, and media metadata/references. It excludes media binary. Media is reconnected lazily by reference. The local QR interface only validates a secure restore pointer shape; it does not implement production restore or credentials.
- `?avaEntry=frontend` opens the customer Frontstage without editing controls. `?avaEntry=user` opens that same Frontstage with direct User Editing permission. `?avaEntry=admin` opens the separate data-driven Official Config surface in read-only mode. Unsupported non-empty `avaEntry` values fail safely.

Admin does not share the User Override store and does not expose protected calculation or premium mapping writes. Official write-back is `EXTERNAL CONFIGURATION REQUIRED` because the current GAS contract exposes read actions only; production Admin authentication remains AVA Platform / AVA Studio dependent. The App never claims a cloud save that it cannot perform.

Return to AVA uses the caller-provided browser return context (`document.referrer`) and preserves its AVA surface query context. When no valid caller context is available, the control remains visible but reports that the App must be reopened from AVA; no guessed Platform deployment URL is used. The independent app remains independently owned.
