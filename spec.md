# SPEC: LiteRT-LM WebGPU Chat - Testing, RAG Verification & GitHub Pages Deploy

## 1. Objective

Harden and ship the existing **LiteRT-LM WebGPU Chat** application: a fully local, browser-only LLM chat runner that downloads and compiles a model with `@litert-lm/core`, runs inference on WebGPU, and layers on RAG (document grounding), a Phaser talking avatar, TTS/STT voice interaction, and multilingual support.

This effort has three concrete goals:

1. **Robust testing.**
Establish a reliable, deterministic unit + E2E test strategy for the chat app so that regressions are caught before merge.
2. **Verify the core runtime paths.**
Ensure RAG indexing/retrieval, model download, and model compilation actually work end to end.
CI covers these against mocks; the real WebGPU/model paths are verified manually on the deployed site.
3. **Deploy pipeline.**
Set up GitHub Actions to gate on tests and deploy the static site to GitHub Pages on merge to `master`.

Out of scope: the **BrowserDJ AI / "DJ in the edge"** concept.
That is a separate project and its PRD is removed from this repo as part of this work (see Section 8).

### Target users

- **End users:** People running a private, offline LLM chat in their browser (no server inference, no data leaving the device).
They value privacy, resilience to connectivity loss, and a polished voice/avatar experience.
- **Developers/maintainers:** Contributors who need a green, trustworthy test suite and a hands-off deploy so shipping is safe and boring.

## 2. Commands

```bash
# Install dependencies
npm install

# Run the local dev server (serves the static site at http://localhost:5173)
npm run dev

# Run unit tests (Node.js native test runner)
npm test

# Run Cypress E2E tests headlessly (requires the dev server running on :5173)
npx cypress run

# Open Cypress interactively
npx cypress open
```

Notes:
- The dev server (`server.js`) is a zero-dependency static file server used for local development and as the Cypress `baseUrl`.
It is **not** part of the deployed artifact - GitHub Pages serves the static files directly.
- Cypress `baseUrl` is `http://localhost:5173`, which matches `server.js`'s default `PORT`.

## 3. Project Structure

```
liteRT-LM/
├── index.html                 -> App shell; loads Phaser, RAG global, ESM bootstrap, CSS
├── manifest.json              -> PWA manifest
├── sw.js                      -> Service worker (does NOT cache the multi-GB model)
├── server.js                  -> Zero-dependency static dev server (PORT=5173)
├── rag.js                     -> Global RAG engine + RAG UI + PDF ingest (window.ragIndex)
├── assets/
│   ├── index-jzDBDxi2.js      -> ESM bootstrap: imports state.js + components.js
│   ├── index-BEHUn5zE.css     -> Compiled app styles
│   └── styles.css             -> Styles
├── src/
│   ├── state.js               -> ChatStateManager: engine load/compile, inference,
│   │                             conversations, TTS/STT SpeechQueue, language mapping
│   ├── components.js          -> Lit web components (chat window, sidebar, avatar, inputs)
│   └── rag.js                 -> ESM RAG module (tokenize, LocalRAGIndex) used by unit tests
├── test/
│   └── state.test.js          -> Unit tests (node:test) for RAG + ChatStateManager
├── cypress/
│   └── e2e/chat.cy.js         -> E2E UI tests
├── cypress.config.js          -> Cypress config (baseUrl :5173, supportFile false)
├── icons/                     -> PWA / app icons
├── package.json               -> Deps (@litert-lm/core) + scripts
└── SPEC.md                    -> This living specification
```

### Known structural issue to resolve

There are **two RAG implementations** that have drifted:

- `rag.js` (repo root) - a browser global (`window.ragIndex` / `window.getRagPrompt`) with the RAG UI and PDF ingestion, loaded by `index.html`.
- `src/rag.js` - an ESM module (`export function tokenize`, `export class LocalRAGIndex`) imported by the unit tests.

**The unit tests exercise `src/rag.js`, but the running app uses `rag.js`.**
This means RAG can pass tests while the shipped behavior differs.
Part of this work is to reconcile these into a single source of truth (extract the shared core into `src/rag.js`, have the root file consume it) so tests actually cover what ships.

## 4. Code Style & Conventions

- **Modern ES Modules**, clean and well-commented. Match the existing idiom in `src/`.
- **Zero build step, CDN-first.**
Runtime dependencies (Lit, `@litert-lm/core`, `marked`, `highlight.js`, Phaser, pdf.js) load from CDN ESM/script tags.
Do not introduce a bundler without explicit approval (see Boundaries).
- **Relative asset paths only** (`./assets/...`).
This is required for the app to work under the GitHub Pages project subpath (`/liteRT-LM/`).
Never hardcode absolute root paths (`/assets/...`).
- **Graceful degradation.**
Feature-detect experimental browser APIs (WebGPU, `speechSynthesis`, `SpeechRecognition`, File System Access) and degrade with console warnings + disabled UI rather than crashing.
- **Environment parity.**
Code must run both in the Node.js mock test environment and the real WebGPU browser environment; guard browser-only globals.
- **Markdown docs:** one sentence per physical line; plain `-` dashes, never em dashes.

## 5. Testing Strategy

### 5.1 Unit tests (`npm test`, `node:test`) - the fast gate

- Deterministic and fully mocked; no network, no WebGPU, no real model.
- Mock `@litert-lm/core` to cover both current and legacy API shapes (`loadLiteRtLm`, `LiteRtLm.DEFAULT_WASM_PATH`, `Engine.create`) so tests stay backwards compatible.
- Cover: RAG tokenization/indexing/retrieval, `ChatStateManager` state transitions, cancellation (AbortController), conversation persistence + rename, sampler param construction (greedy/top-k/top-p), speech queue splitting/queuing, selective audio stop, language mapping (BCP 47) and prompt-language injection, and continuous STT transcript accumulation + error reporting.
- **Baseline:** currently 46 tests passing. This must stay green; new features add tests.
- **Action item:** once RAG is reconciled to a single source (Section 3), unit tests must import the same module the app ships, so RAG coverage is real.

### 5.2 E2E tests (Cypress) - the UI gate

- Run against the static site served by `server.js` on `:5173`.
- Mock/stub the LiteRT-LM engine and speech APIs at the browser layer so the UI flows are deterministic and fast (no real model download).
- Cover the flows already present: landing page structure, inference settings + CoT toggle, custom model dropdown, starter + custom prompt submission and message bubbles, retry/edit, learn-more drawer, document hub indexing + file/PDF upload, new conversation + list toggle, sidebar rename + persistence, language selection + persistence, and selective speech stop.
- Replace fixed `cy.wait(<ms>)` calls with assertions/aliases where they cause flakiness (flakiness is a defect - fix it when seen).

### 5.3 Real-model verification - manual, on the deployed site

CI is **fully mocked** (5.1 and 5.2).
The real runtime paths that cannot run in CI - multi-GB model download, compilation via `@litert-lm/core`, and WebGPU inference - are verified **manually against the deployed GitHub Pages site**, not in an automated job.

There is deliberately **no** WebGPU/GPU-runner E2E job.
This avoids self-hosted GPU-runner infrastructure and keeps CI fast, deterministic, and free.
The tradeoff is that real model/inference regressions are caught by the manual pass below rather than by CI.

**Manual checklist (run against `https://seagomezar.github.io/liteRT-LM/` after each deploy):**
- Cold model download completes and streams to storage.
- Warm reload recovers the model instantly from cache (no re-download).
- Model compiles and a real prompt produces streamed tokens (TTFT sanity check).
- RAG on vs. off produces a visibly different, document-grounded response.
- TTS speaks streamed sentences; avatar mouth-flap syncs to speech.
- STT transcribes voice input in both English and Spanish without premature cutoff.
- Language switch changes both the response language and the TTS voice.

If any item is skipped or cannot be verified (e.g., no WebGPU on the test device), record that explicitly rather than reporting a false green.

## 6. Deployment (GitHub Pages via GitHub Actions)

Repository: `github.com/seagomezar/liteRT-LM` → Pages URL `https://seagomezar.github.io/liteRT-LM/` (project subpath, hence relative paths are mandatory).

### Pipeline shape: test-gate, then deploy

**On pull requests to `master`:**
1. Checkout, `npm ci`.
2. `npm test` (unit) - must pass.
3. Start `server.js`, run `npx cypress run` (E2E) - must pass.
4. These are **required status checks**; a red suite blocks merge.

**On push/merge to `master`:**
1. Re-run the test gate.
2. On success, publish the static site (repo root static files: `index.html`, `assets/`, `rag.js`, `sw.js`, `manifest.json`, `icons/`, `src/`) to GitHub Pages using the official Pages actions (`upload-pages-artifact` + `deploy-pages`) with the correct `permissions` (`pages: write`, `id-token: write`) and a `github-pages` environment.

After deploy, run the manual real-model verification against the live Pages site (Section 5.3).

Deployment constraints:
- GitHub Pages is static-only: no `server.js` at runtime, no server-side inference.
All compute is client-side (this is the product's whole point).
- The service worker must continue to **not** cache the model blob (already handled in `sw.js`).
- Verify the deployed site loads under the `/liteRT-LM/` subpath before declaring success.

## 7. Boundaries

### Always
- Keep the unit suite (`npm test`) and E2E suite (`npx cypress run`) green before merge.
- Use relative asset paths so the app works under the Pages subpath.
- Feature-detect and degrade gracefully for WebGPU and speech APIs.
- Reconcile RAG to a single source of truth so tests cover shipped behavior.
- Fix flakiness, lint issues, and test failures you encounter, even if incidental.
- Reproduce bugs in an E2E setting (as an end user would hit them) before fixing.

### Ask first
- Adding any new runtime dependency or introducing a bundler/build step (breaks the zero-build, CDN-first architecture).
- Changing the model, the `@litert-lm/core` major version, or the CDN sources.
- Significant restyling or UI layout changes.
- Removing or archiving the existing chat app code.

### Never
- Skip, disable, or delete tests to make the suite pass - fix the code or the mocks instead.
- Report a false green: if a step was skipped, mocked, or truncated, say so.
- Add server-side inference or any dependency on a remote compute backend (violates the offline/private product promise).
- Cache the multi-GB model inside the service worker cache.
- Reintroduce BrowserDJ AI / "DJ in the edge" material into this repo.

## 8. Removal: BrowserDJ AI ("DJ in the edge")

BrowserDJ AI is a separate project and must not live in this repo.

- **Delete** `BrowserDJ AI - PRD y Blueprint de Ingenieria.md`.
- Investigation confirms there is currently **no DJ-specific code or assets** in the repo (no Elementary Audio, DSP graph, AudioWorklet, or mixdown references outside the PRD).
Removal is limited to the PRD file.
- If any DJ-only code surfaces later, remove it too, keeping only what the chat app uses.

## 9. Success Criteria

- [ ] `BrowserDJ AI - PRD y Blueprint de Ingenieria.md` deleted; no DJ references remain (outside this spec's mention).
- [ ] RAG reconciled to a single source of truth; unit tests import the same module the app ships.
- [ ] `npm test` green with unit coverage for RAG, model load/compile mocks, inference, and all existing features.
- [ ] `npx cypress run` green, with flaky `cy.wait` timers replaced by assertions where they caused instability.
- [ ] GitHub Actions PR workflow runs unit + E2E as required checks (fully mocked; no GPU runner).
- [ ] GitHub Actions deploy workflow publishes to GitHub Pages on merge to `master`; deployed site verified loading under `/liteRT-LM/`.
- [ ] Manual real-model checklist (Section 5.3) documented and run against the live Pages site after deploy.

## 10. Open Questions

- **Manual-check model:** Which model + weights the manual checklist (Section 5.3) exercises on the deployed site.
Defaults to whatever the app ships as its default model unless specified otherwise.

---

## Appendix: Historical Iteration Log

The following records the completed feature iterations that built the current chat app.
Preserved for context; not part of the active plan above.

### Iteration: API Alignment & Bug Fix (completed)
Aligned `src/state.js` with `@litert-lm/core@0.13.1`: use `loadLiteRtLm` + `LiteRtLm.DEFAULT_WASM_PATH` (not `loadWasmModule`), `Engine.create` (not `Engine.createEngine`), and a safe `getTokenizer()` fallback word-split estimator.

### Iteration: Greedy Sampler Top-K Fix (completed)
Conditional `samplerParams`: greedy uses `k=1`, `p=1.0`, `temperature=0.0` to satisfy engine validation.

### Iteration: Chat Retitling & Persistence (completed)
`renameConversation(id, newTitle)` with inline sidebar edit (Enter/blur/checkmark to save, Escape/cancel to abort), persisted to `localStorage`.

### Iteration: Phaser Talking Avatar & Voice (completed)
Procedural Phaser avatar above the timeline; TTS via `speechSynthesis` speaking streamed sentences; STT via `SpeechRecognition` with a mic toggle; mouth-flap synced to `isSpeaking`; graceful degradation when speech APIs are unavailable.

### Iteration: Multilingual Support (completed)
Language dropdown persisted as `chatLanguage`; BCP 47 mapping (en-US, es-ES, fr-FR, de-DE, zh-CN, ja-JP, pt-BR, it-IT) applied to STT `recognition.lang`, TTS utterance/voice, and a prompt postfix constraining the response language.

### Iteration: Selective Audio Stop (completed)
`stopSpeechOnly()` clears the SpeechQueue and sets `isSpeechMutedForCurrentResponse` so audio stops without interrupting text generation; reset on the next `sendMessage`; "Stop Audio" button on the avatar card while speaking.

### Iteration: Continuous STT Robustness (completed)
`recognition.continuous = true`, `onresult` loops from index 0 to accumulate transcripts across a continuous session, and `onerror` surfaces a descriptive `statusText`.
