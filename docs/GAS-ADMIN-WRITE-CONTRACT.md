# Critical Illness Admin write contract

Critical Illness owns the Official product data, validation, calculations,
Google Sheet, GAS backend, and publishing logic. AVA Platform owns Admin
authentication and authorization. This repository does not implement a
Critical Illness password, email allowlist, Google-account gate, or second
login.

The existing Critical Illness GAS deployment implements these backend actions.

## `exchangeAdminSession`

The browser sends the exact App ID, one-time `launchTicket`, `launchNonce`, and browser-bound `browserProof` with `action: "exchangeAdminSession"` to this App's existing GAS endpoint. The GAS backend forwards that contract to Platform and returns the opaque `adminSessionProof`, expiry, and `ava-admin-session-v1` contract only after exact validation. Platform consumes the launch and browser proof once. The browser keeps the proof in memory only.

## `adminUpdate`

For every write, the existing backend must first validate the dataset, record, version, fields, and all Critical Illness business rules. It must then call the Platform verification endpoint over HTTPS:

```json
{
  "action": "verifyAdminSession",
  "adminSessionProof": "<opaque proof>",
  "appId": "critical-illness",
  "operation": "critical-illness:official-write:Plans"
}
```

Only a successful, unexpired response with the exact App ID, operation and contract permits the allowlisted, version-checked Official Sheet update. Missing, malformed, expired, replayed, cross-App, or wrong-operation proofs reject before any write.

The existing endpoint must accept the client request shape below, plus the short-lived in-memory grant:

```json
{
  "action": "adminUpdate",
  "appId": "critical-illness",
  "adminSessionProof": "<opaque proof>",
  "operation": "critical-illness:official-write:Plans",
  "dataset": "Plans",
  "recordId": "OYS2",
  "expectedVersion": "1",
  "fields": { "plan_name": "愛伴航2" }
}
```

It must return success only after the Sheet write, record version update, and dataset-version update succeed. The endpoint remains the existing canonical Critical Illness GAS deployment; no second backend or deployment is created.

## Deployment and secrets

The deployment owner must update the existing GAS project, configure the Platform verification URL and App-specific Script Properties there, and deploy a new version with authenticated server-to-server access. Platform Admin passwords, session tokens, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, Platform Script Properties, and verification credentials must never enter this repository or frontend source.

Production authorization remains blocked until this source is published as a new immutable version of the existing GAS deployment and the Android PWA flow is retested. Read actions and all Front/User behavior remain available throughout the deployment.
