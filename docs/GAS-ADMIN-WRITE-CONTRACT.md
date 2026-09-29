# Critical Illness Admin write contract

Critical Illness owns the Official product data, validation, calculations,
Google Sheet, GAS backend, and publishing logic. AVA Platform owns Admin
authentication and authorization. This repository does not implement a
Critical Illness password, email allowlist, Google-account gate, or second
login.

The existing Critical Illness GAS deployment must add these backend actions.

## `exchangeAppLaunch`

The browser sends `{ action: "exchangeAppLaunch", appId: "critical-illness", launchTicket }` to this App's existing GAS endpoint. The GAS backend calls the Platform endpoint with the same action, App ID, and ticket, checks the successful response, and returns the opaque `appGrant` and `expiresAt` to the browser. Platform consumes the launch ticket once. The browser keeps the grant in memory only and never places it in LocalStorage, IndexedDB, backup, QR, or a durable URL.

## `adminUpdate`

For every write, the existing backend must first validate the dataset, record, version, fields, and all Critical Illness business rules. It must then call the Platform verification endpoint over HTTPS:

```json
{
  "action": "verifyAppGrant",
  "appGrant": "<opaque grant>",
  "appId": "critical-illness",
  "operation": "official-write"
}
```

Only a successful response with `appId === "critical-illness"` permits the allowlisted, version-checked Official Sheet update. Missing, malformed, expired, revoked, or wrong-App grants reject before any write. The backend must not trust `avaEntry`, URL presence, referrer, frontend state, or Sheet access as authorization.

The existing endpoint must accept the client request shape below, plus the short-lived in-memory grant:

```json
{
  "action": "adminUpdate",
  "appGrant": "<opaque grant>",
  "dataset": "Plans",
  "recordId": "OYS2",
  "expectedVersion": "1",
  "fields": { "plan_name": "愛伴航2" }
}
```

It must return success only after the Sheet write, record version update, and dataset-version update succeed. The endpoint remains the existing canonical Critical Illness GAS deployment; no second backend or deployment is created.

## Deployment and secrets

The deployment owner must update the existing GAS project, configure the Platform verification URL and App-specific Script Properties there, and deploy a new version with authenticated server-to-server access. Platform Admin passwords, session tokens, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, Platform Script Properties, and verification credentials must never enter this repository or frontend source.

Until that existing deployment is updated and tested, Admin launch/write live verification is blocked. Read actions and all Front/User behavior remain available through the existing deployment.
