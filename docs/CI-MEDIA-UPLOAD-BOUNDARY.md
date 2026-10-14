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
calculation. User-personal upload remains unavailable and separate from
Official media.
