# Shisa model provider for DSH

Optional Shisa model access and sign-in UI for DeepSeek Harness. Maintained in
`sabishii-me`; this is not an official DeepSeek distribution.

## Scope

One installable plugin contains the provider and browser account UI. It uses DSH's
public authorization, credential, LLM, Remote and UI slot APIs. Jouzu CLI is not
required, installed or bundled. The device authorization service currently uses
the `jouzu` client identity; that protocol identity does not require the CLI.

The plugin contributes Shisa sign-in to model settings and, on desktop carriers,
the runtime `settings.onboarding` slot. It does not modify the desktop installer
or render before the Host and plugins start. Users may skip sign-in. Credentials
remain in the Host credential store; UI receives only secret-free status.

## Compatibility and installation

Initial source release targets DSH **0.2.1-alpha.2**. Peer versions are pinned to
that tested API baseline; compatibility with other versions is not asserted.

Build a package with Node >=22.22:

```sh
npm ci
npm run build
npm test
npm pack
```

Install the resulting tarball using DSH's plugin manager in the desired profile.
The package declares `dsh.bundle` and includes `cordis.patch.yml`, so the normal
profile bundle mechanism activates it. Do not also enable the older separate
`dsh-experimental-shisa-provider` / `shisa-ui` packages: they own the same service
and slot registrations. This repository publication does not publish to npm.

## Authorization and models

- HTTPS gateway defaults to `https://gateway.shisa.ai`.
- Sign-in issues an authorization link and code; the user approves in a browser.
- An **advanced option stores a Shisa API key instead of approving a device**. The
  key is sent once to `https://api.shisa.ai/v1/jouzu/model-catalog` before anything
  is persisted, so a rejected key never displaces a working credential; the
  gateway base is derived from that catalog address (`https://api.shisa.ai/v1`).
  Saving a key supersedes the device link on this machine.
- Cancellation stops the pending authorization attempt.
- Model discovery is separate from authorization. Discovery failure is shown and
  can be retried without silently fabricating models.
- Model requests use the existing DSH pi-ai adapter, not a new agent loop.
- Sign-out requests revocation for a device link; an API key is forgotten locally.

Configuration: `gateway`, `apiKeyCatalogUrl`, `clientVersion`, `requestTimeoutMs`
(30000 default), and `maxResponseBytes` (1048576 default). Never commit credentials
or user profiles.

## Verification limits

The predecessor integration exercised real device-code issuance and cancellation,
and desktop runtime slot rendering. User-approved authorization and all catalog /
model combinations are not certified by that evidence. This standalone repository
has its own build and package-contract checks; those do not substitute for live
account acceptance testing.

## Development

`src/provider` owns authorization and model transport; `src/client` owns UI.
`src/generated` contains checked-in Typert descriptors from the original Host
reflection build. If Remote methods or status types change, regenerate these
using the matching DSH Typert generator and review the wire contract together.
The standalone build does not currently regenerate descriptors automatically.

## License and provenance

MIT. Extracted from `packages/experimental/shisa-provider` and `shisa-ui` in the
DeepSeek Harness integration work. Original DeepSeek copyright and MIT license
are preserved in `LICENSE`. See `NOTICE.md` for provenance.
