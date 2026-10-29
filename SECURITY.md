# Security

`dsh-llm-shisa` is a third-party model provider for DeepSeek Harness. It runs inside
the Host process and can therefore read the Host credential store; treat it with
the same trust you give any plugin you install.

## Reporting

Report vulnerabilities privately through the repository's GitHub **Security →
Report a vulnerability** form, or by email to the maintainer listed in
`package.json`. Do not open a public issue for a suspected vulnerability. Please
include the plugin version, the DSH version, and a reproduction path.

## Supported versions

The latest published minor version receives fixes. Pre-`1.0` releases may fix
security issues in a new minor version only.

## What this plugin touches

| Surface | Behaviour |
| --- | --- |
| Network | HTTPS only. The gateway and the API-key catalog are validated as `https:` with no credentials, query or fragment. Requests use `redirect: 'error'`, a per-request timeout, and a bounded response reader. |
| Credentials | The device grant and the API key live in the Host credential store (`llm-shisa/account`, `SHISA_API_KEY`). They are never returned by a Remote method and never logged. |
| Remote surface | `getState` returns only the signed-out/ready status, model metadata and the device-flow link/code the user is meant to see. There is no read path for a secret. |
| UI | Receives status only. The API-key field is an ordinary password input whose value is cleared after a successful save. |
| Files | Writes nothing to the workspace. |

## Design guarantees

- **A rejected key never replaces a working credential.** An API key is read
  against the catalog before it is persisted.
- **Errors never echo a response body.** Provider responses can contain secrets;
  parse and transport failures collapse to stable messages.
- **No retry on generation or authorization polls that could duplicate work**
  beyond the bounded device-flow polling described by the protocol.
- **One credential owner.** Only this plugin writes `llm-shisa/*`; the API key it
  derives is stored under `SHISA_API_KEY` for the pi-ai adapter to resolve.

## Known limitations

- The plugin trusts the configured gateway. A compromised gateway can return a
  malicious catalog or endpoints; endpoints are still rejected unless they are
  plain HTTPS URLs, but the plugin cannot attest to their identity.
- There is no certificate pinning and no request signing.
- The device flow's `jouzu` client identity is a protocol constant, not a claim
  that this plugin ships or depends on the Jouzu CLI.
- Catalog content is untrusted input: it is schema-validated and byte-bounded,
  then projected into model profiles. It cannot execute code.

## Supply chain

- Runtime dependencies are limited to `zod`; everything else is a Host-provided
  peer. `npm audit --omit=dev` is expected to report zero vulnerabilities.
- Peer and dev versions track the tested Host baseline (`0.2.1-rc.2`, `cordis`
  4.0.5, `schemastery` 3.18.5). No `postinstall` script runs.
- `dist/` is built by `scripts/build.mjs` from `src/`; the published tarball
  contains no build hooks.
