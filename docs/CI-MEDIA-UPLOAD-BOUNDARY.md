# Critical Illness Official Media Boundary

This release adds the Critical Illness Admin media workflow at the
application boundary without changing claim, premium, or customer data
semantics.

## Resource model

Existing Product_Content records are reused:

- diseases and child: covered-disease resources
- documents with content_type=brochure: product brochures
- claims with content_type=claim_example: claim-case presentation resources

The Google Sheet stores metadata and resource_ref; the original PDF/image
binary is not stored in the Sheet or IndexedDB.

Official object paths are deterministic and contain no customer identity:

- critical-illness/official/{planId}/product/{category}/{timestamp}_{filename}
- critical-illness/official/{planId}/claims/{contentId}/{timestamp}_{filename}

Replacing a resource is intentionally upload-first and reference-write-second.
The old reference remains authoritative if the later Official write or
read-after-write fails.

## Authorization and runtime gate

The Admin screen is reachable only after the existing AVA Studio launch,
browser binding, nonce exchange, and adminSessionProof flow. A query
parameter such as avaEntry=admin is not upload authority.

The Firebase Web configuration is public client configuration. It is not a
credential and it does not prove Firebase Storage upload permission.

FIREBASE_UPLOAD_ENABLED remains false in this release because the current
environment could not verify an authenticated Firebase Storage Rules contract
or an approved AVA upload broker. The browser integration is prepared with
Firebase browser ESM imports, MIME/20 MB validation, safe paths, HTTPS URL
validation, and single-app/single-Storage initialization, but production
activation is blocked with FIREBASE_RUNTIME_BLOCKED.

Before activation, an authorized owner must verify one of the following
without public writes:

1. Firebase Auth/custom-token plus Storage Rules that accept only the
   authorized AVA Admin contract; or
2. an approved AVA Cloud Media upload broker that returns a cloud reference.

Then perform a controlled non-production upload and confirm:

Firebase object -> HTTPS reference -> authorized GAS Official write ->
authoritative read-after-write -> customer resource renderer.

No Firebase Storage Rules, production secrets, or production data were
changed by this release.

## Scope boundary

This is a file-storage and configured-resource workflow only. It does not
perform AI processing, OCR, extraction, summarization, classification,
document understanding, CRM integration, claim interpretation, or payout
calculation.

## Official and User resource layers

Official resources remain shared Admin-owned content. Their metadata and
references are governed by `Product_Content`, and their binaries use the
`critical-illness/official/{planId}/...` namespace.

User resource overrides are a separate metadata-only layer. Resolution is
deterministic: an override owned by the current canonical AVA User binding is
used first, then the matching Official resource, then no resource. Removing
an override only removes that User metadata and automatically reveals the
Official resource; it never writes or deletes Official data.

The current AVA Platform source exposes only its local provider for personal
files, which stores Blobs in IndexedDB. That provider is not used for CI User
resources because this app requires User binaries to remain in approved cloud
storage. No approved User cloud provider or canonical cloud User-binding
adapter is currently available, so `USER_RESOURCE_RUNTIME_BLOCKED` remains the
safe runtime state. No User binary is stored in CI LocalStorage or IndexedDB.

## Secure authorization migration

The repository now contains the activation contract, but production remains
fail-closed until the Firebase-side bridge is configured:

- `firebase/storage.rules` allows public reads for published Official media,
  requires the `avaAdmin=true` Firebase claim for Official
  create/update/delete, and requires an exact `avaUserScope` claim for private
  User resources.
- Uploads are limited to PDF, PNG, JPEG, and WebP, with a 20 MB maximum.
- `src/integration/firebase-auth.js` requests a short-lived custom-token grant
  from the existing CI GAS endpoint; it never contains a service account or
  signing secret.
- `gas/Code.gs` verifies the existing AVA Admin session before calling the
  server-side broker configured through Script Properties:
  `CI_FIREBASE_AUTH_BROKER_URL` and `CI_FIREBASE_AUTH_BROKER_SECRET`.
- `src/integration/firebase-user-media.js` provides cloud-only User
  `saveFile`, `replaceFile`, `resolveFile`, and `deleteFile` operations. It
  requires a canonical opaque AVA User binding plus a short-lived User claim.

The deployed Firebase project currently has no Authentication provider and
still has the unsafe global public rule. Therefore the code reports
`OFFICIAL_STORAGE_AUTH_CONFIG_REQUIRED` and
`USER_STORAGE_AUTH_CONFIG_REQUIRED`; it does not enable upload or attempt a
production write. No browser credential, Firebase Admin key, or broker secret
is stored in this repository.

## Shared Medical bucket compatibility

The bucket is shared with Medical. The rules artifact leaves
`medical/official/**` publicly readable but denies writes until Medical has
migrated to the same verified Admin claim/broker contract. This prevents a CI
rule activation from preserving the current global public-write vulnerability
or silently breaking Medical customer reads. A coordinated Firebase Rules
deployment and Medical upload migration are required before changing the
deployed shared rules.
