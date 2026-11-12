# dsh-llm-shisa

Shisa model access and sign-in UI for DeepSeek Harness. Maintained in
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

Tested against DSH **0.2.1-rc.2** and the stable `cordis` 4.0.5 / `schemastery`
3.18.5 baseline. Peer ranges accept any `0.2.1` prerelease or release; other host
versions are not asserted.

Build a package with Node >=22.19:

```sh
npm ci
npm run build
npm test
npm pack
```

Install the resulting tarball through DSH's plugin manager, or from the release
asset over HTTPS:

```sh
dsh plugin --profile <name> add https://github.com/<owner>/dsh-llm-shisa/releases/download/v<version>/dsh-llm-shisa-<version>.tgz
```

The package declares `dsh.bundle` and includes `cordis.patch.yml`, so the normal
profile bundle mechanism activates it. **Do not install from a local path**
(`file:` / `link:`): the desktop shell treats those as disposable development
links and removes them on the next start. Do not also enable the older separate
`dsh-experimental-shisa-provider` / `shisa-ui` packages: they own the same service
and slot registrations.

## Authorization and models

- HTTPS gateway defaults to `https://gateway.shisa.ai`.
- Sign-in issues an authorization link and code; the user approves in a browser.
- An **advanced option stores a Shisa API key instead of approving a device**. The
  key is sent once to `https://api.shisa.ai/v1/jouzu/model-catalog` before anything
  is persisted, so a rejected key never displaces a working credential; the
  gateway base is derived from that catalog address (`https://api.shisa.ai/v1`).
  A stored key is the credential whether or not a device link exists; the link
  only decides which endpoints and catalog it is used against.
- Cancellation stops the pending authorization attempt.
- Model discovery is separate from authorization. Discovery failure is shown with
  its real cause and can be retried without silently fabricating models. A
  credential the gateway rejects is removed locally so sign-in becomes reachable
  again, instead of leaving an account that can only fail.
- Model requests use the existing DSH pi-ai adapter, not a new agent loop.
- Sign-out always ends the session locally. Revocation is best effort: a gateway
  that cannot revoke the link still gets the local credential cleared, and the
  status says the device may remain linked.
- Catalog `modalities` are projected to pi-ai `input`, so a vision model keeps
  image input instead of being registered as text-only.
- Catalog entries that declare no `capabilities` at all are not published: DSH
  sends tool definitions on every request, and those backends answer `400`. They
  are reported in the log by id so the gap is visible rather than silent.

Configuration: `gateway`, `apiKeyCatalogUrl`, `clientVersion`, `requestTimeoutMs`
(30000 default), and `maxResponseBytes` (1048576 default). Never commit credentials
or user profiles.

## Verification limits

The predecessor integration exercised real device-code issuance and cancellation,
and desktop runtime slot rendering. This repository additionally certifies a real
device authorization, catalog discovery, and a model turn against a 0.2.1-rc.2
desktop. API-key sign-in is covered by contract tests and a rejected-key probe, not
by a live accepted key. All catalog / model combinations are not certified.

## Development

`src/provider` owns authorization and model transport; `src/client` owns UI.
`src/generated` contains checked-in Typert descriptors from the original Host
reflection build. If Remote methods or status types change, regenerate these
using the matching DSH Typert generator and review the wire contract together.

`npm run typecheck` covers the Host surface. The browser surface is built but not
type-checked, because it depends on generated `.d.ts` declarations this
repository does not produce yet. `npm run verify` runs typecheck, build and tests.

## Releasing

Releases are tag-driven; nothing is published from a branch.

1. Merge the change through a pull request. `main` requires the `verify` check,
   and the protected branch rejects force pushes and deletions.
2. Set the version in `package.json`, commit it, and merge that through a PR.
3. Create an **annotated** tag whose name is exactly `v<version>`, then push that
   one tag:

   ```sh
   git tag -a v0.2.0 -m "dsh-llm-shisa 0.2.0"
   git push origin v0.2.0
   ```

4. Attach the packed tarball to a GitHub release on that tag:

   ```sh
   npm pack
   gh release create v0.2.0 dsh-llm-shisa-0.2.0.tgz --title "dsh-llm-shisa 0.2.0" --notes-file release-notes.md
   ```

   The release asset URL is the supported install source. A local `file:` or
   `link:` install is disposable and is removed by the desktop shell on restart.

Optional npm publication is manual and gated by
[`.github/workflows/publish-npm.yml`](.github/workflows/publish-npm.yml). It
refuses anything that is not an annotated `vX.Y.Z` tag matching `package.json`,
refuses to overwrite a published version, and publishes the packed tarball with
provenance. Two pieces of setup live outside the repository:

- a GitHub environment named `npm-publish`;
- a Trusted Publisher entry on npmjs.com for this repository, workflow
  `publish-npm.yml`, environment `npm-publish`.

Then `gh workflow run publish-npm.yml -f ref=v0.2.0`.

## Syncing with Jouzu

This plugin follows [shisa-ai/jouzu](https://github.com/shisa-ai/jouzu) as the
reference implementation of Shisa account handling. Behaviour was last checked
against Jouzu commit `1ac3257` (`packages/cli/src/shisa-link/`).

Mirrored on purpose:

- device flow: `client_id: jouzu`, `POST /device/code`, `/device/token`,
  `/device/link/ack`, `/device/link/revoke`, default gateway
  `https://gateway.shisa.ai`;
- API-key accounts: product catalog `https://api.shisa.ai/v1/jouzu/model-catalog`
  and the inference base derived from it by stripping `/jouzu/model-catalog`;
- credential: a stored key is the credential whether or not a device link
  exists; the link only decides which endpoints and catalog that key is used
  against. Setting a key is therefore the override.

Different on purpose: credentials live in the DSH credential store rather than
`auth.json`, the package is MIT and not Apache-2.0, and the Jouzu CLI is neither
required nor bundled.

## Roadmap

Both of the following consume the account owner's resolved key through this
plugin; neither may become a second credential owner.

- **Speech recognition (ASR)** — DSH already owns the seam: implement
  `SpeechProvider` (`{ info, transcribe }`) and call `ctx.speechToText.register()`.
  Shisa exposes `POST /asr/srt/audio_llm` (base64 audio plus a language hint,
  returning `{ text, language, confidence }`), which matches `SpeechInput`.
  Requires the `@deepseek-ai/dsh-experimental-speech-to-text` seam, the API bridge
  and the voice-input UI bundles; declare only languages the route actually
  accepts, and point `defaultProvider` at this provider.
- **Image generation** — DSH has no image-generation seam, so this is an agent
  tool plus `ctx.attachments.saveImages()`, matching how MCP image results become
  durable attachments. Shisa's route is Gemini-Interactions shaped
  (`POST https://api.shisa-ai.com/image/v1beta/interactions`, response
  `steps[].content[]` with base64), not OpenAI `/v1/images/generations`, so it
  must not be registered as an LLM model. Needs its own response-byte budget and
  no automatic retry, because a retry duplicates a paid generation.

## Security

See `SECURITY.md` for the reporting address and the threat model this plugin
assumes.

## License and provenance

MIT. Extracted from `packages/experimental/shisa-provider` and `shisa-ui` in the
DeepSeek Harness integration work. Original DeepSeek copyright and MIT license
are preserved in `LICENSE`. See `NOTICE.md` for provenance.
