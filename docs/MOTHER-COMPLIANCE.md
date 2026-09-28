# Critical Illness Mother Standard Sync

This app keeps Critical Illness business logic, Google Sheet/GAS integration, Benefit Engine and Claim Rule Engine in this repository. The sync adds only the Independent App compliance layer.

## Current limitations

- No Cloud Storage provider is configured for this app. Image/video upload therefore fails safely with `CLOUD_STORAGE_UNAVAILABLE`; no media binary is written to IndexedDB, LocalStorage, Base64 data, or the app database.
- Image and Video Pages retain typed, provider-independent Cloud references only. Image Pages are capped at six items; Video Pages are capped at one item. Missing media renders a safe fallback and does not stop the Flow.
- User Backup is structured JSON with schema/version, User settings, overrides, pages, ordering, visibility, and media metadata/references. It excludes media binary. Media is reconnected lazily by reference. The local QR interface only validates a secure restore pointer shape; it does not implement production restore or credentials.
- `?avaEntry=frontend` hides QA User Editing controls. `?avaEntry=user` may expose the app-owned direct Frontstage editor for development QA. `?avaEntry=admin` exposes only the AVA Studio handoff/status surface; it does not grant Admin permission.

The canonical Return to AVA target is the AVA Platform sibling path `../avaplatform/`, matching the Platform module-gateway deployment convention. The independent app remains independently owned.
