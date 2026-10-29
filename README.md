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

Build a package with Node >=22.22:

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
  Saving a key supersedes the device link on this machine.
- Cancellation stops the pending authorization attempt.
- Model discovery is separate from authorization. Discovery failure is shown and
  can be retried without silently fabricating models.
- Model requests use the existing DSH pi-ai adapter, not a new agent loop.
- Sign-out requests revocation for a device link; an API key is forgotten locally.
- Catalog `modalities` are projected to pi-ai `input`, so a vision model keeps
  image input instead of being registered as text-only.

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
The standalone build does not currently regenerate descriptors automatically, and
no TypeScript type check runs over `src`; both are tracked in the transfer review.

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
