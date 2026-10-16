# CI Official Firebase media boundary

Critical Illness product documents and images are public customer-facing
resources. This release intentionally removes Firebase Authentication from
the binary upload step for the `critical-illness/official/**` namespace.

The resulting boundaries are deliberately separate:

- Firebase Storage: public read and validated public create/update for CI
  Official media only.
- Product_Content: still requires the existing AVA Admin session and the
  authorized CI GAS write/read-after-write contract.
- Firebase Storage delete: denied for CI Official media.
- `critical-illness/users/**`: unchanged private User-scope authorization.
- `medical/**`: unchanged by this repository change.
- Service-account credentials, custom-token secrets and broker secrets are not
  used or exposed by the CI Official upload client.

The Storage rule still limits CI Official writes to non-empty PDF, PNG, JPEG
and WebP objects of 20 MB or less. Replacements upload a new object first;
the old reference remains authoritative until the protected Product_Content
write and authoritative read-back succeed. No delete-before-upload operation
is used.

This is an intentional product/security trade-off accepted for public product
resources. It is not equivalent to authenticated Admin-only binary upload.
