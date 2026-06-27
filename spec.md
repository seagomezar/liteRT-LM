# Spec: LiteRT-LM WebGPU Chat API Alignment & Bug Fix

## Objective
Align the dynamic library loading and model compilation flow in `src/state.js` with the official `@litert-lm/core` (version `0.13.1`) API. Resolve the runtime exception:
`Failed to load model: litertlm.loadWasmModule is not a function`
Ensure the application can successfully load the WASM runtime, compile downloaded models, and execute inference in the browser, while maintaining passing unit and E2E test suites.

## Tech Stack
- **Framework**: modern Lit (loaded from jsDelivr ESM CDN: `https://cdn.jsdelivr.net/npm/lit@3.1.2/+esm`).
- **LLM Runtime**: `@litert-lm/core` version `0.13.1` (loaded from CDN: `https://cdn.jsdelivr.net/npm/@litert-lm/core@0.13.1/+esm`).
- **WASM Assets**: Loaded via `litertlm.loadLiteRtLm` from `litertlm.LiteRtLm.DEFAULT_WASM_PATH`.
- **Markdown & Highlight**: `marked` and `highlight.js` loaded via CDN.
- **RAG Engine**: Local in-memory TF-IDF indexer (`src/rag.js`).
- **State Management**: Reactive state manager (`src/state.js`).
- **Test Framework**: Native Node.js Test Runner (`node:test`) and Cypress E2E.

## Commands
```bash
# Run unit tests
npm test

# Run Cypress E2E tests
npx cypress run
```

## Project Structure
```
liteRT-LM/
├── assets/
│   ├── index-BEHUn5zE.css     -> Re-implemented clean CSS
│   └── index-jzDBDxi2.js      -> Bootstrap launcher
├── src/
│   ├── state.js               -> App state manager (updated to align API calls)
│   ├── components.js          -> Lit UI components
│   └── rag.js                 -> TF-IDF document indexer
├── test/
│   └── state.test.js          -> TDD tests (updated to support new mocks)
├── package.json               -> Dependencies & scripts
├── server.js                  -> Zero-dependency server
└── spec.md                    -> Living specification
```

## Code Style & Good Practices
- Use clean, well-commented modern ES Modules.
- Gracefully handle differences between mock testing environments (Node.js) and real WebGPU browser environments.
- Fallback gracefully when experimental or non-existent APIs (like `getTokenizer()`) are not provided by the core engine.

## Testing Strategy
- Update the mock core object in `test/state.test.js` to provide both the old and new methods (`loadLiteRtLm`, `loadWasmModule`, `Engine.create`, `Engine.createEngine`) so that tests stay fully backwards compatible and pass successfully.
- Verify through unit tests that all state manager transition paths, cancellation flows, and caching mechanisms remain intact.

## Boundaries
- **Always**: Keep tests green and maintain full browser compatibility.
- **Ask first**: Adding new dependencies or changing styling choices.
- **Never**: Skip or disable tests rather than correcting their mocks.

## Success Criteria
- [x] Dynamic ESM import version updated to `0.13.1` in `src/state.js` to match `package.json`.
- [x] Crash `litertlm.loadWasmModule is not a function` is resolved by using `litertlm.loadLiteRtLm` with `litertlm.LiteRtLm.DEFAULT_WASM_PATH`.
- [x] Engine compilation aligned with `@litert-lm/core` by calling `litertlm.Engine.create()` instead of `litertlm.Engine.createEngine()`.
- [x] Safe check added for `engine.getTokenizer()` with a fallback word-split token estimator if it's missing in `@litert-lm/core`.
- [x] Local unit tests (`npm test`) pass successfully with 100% green status.
- [x] Cypress E2E tests (`npx cypress run`) pass successfully with 100% green status.

## Open Questions
- None at this time. The required API signatures have been verified directly in the installed `node_modules` code.

## Implementation Plan
1. **API Mapping & Verification**: Verify ESM dynamic CDN imports match the local installed version (`0.13.1`).
2. **Mock Updates**: Update `test/state.test.js` to mock the correct `loadLiteRtLm`, `LiteRtLm.DEFAULT_WASM_PATH`, and `Engine.create` APIs. Make them backwards-compatible with any remaining `loadWasmModule`/`createEngine` uses.
3. **State Manager Refactoring**: Update `src/state.js`:
   - Dynamic import version updated to `@0.13.1`.
   - Call `loadLiteRtLm(...)` instead of `loadWasmModule(...)`.
   - Call `Engine.create(...)` instead of `Engine.createEngine(...)`.
   - Check if `engine.getTokenizer` is a function before calling, falling back to a space-splitting approximation.
4. **Validation**: Run both Unit tests and Cypress E2E tests to verify 100% green status.

## Tasks List
- [x] **Task 1**: Update mock definitions in `test/state.test.js`
  - *Acceptance*: Mocks provide both `loadLiteRtLm` / `Engine.create` and old compatibility helpers.
  - *Verify*: `npm test` passes.
  - *Files*: `test/state.test.js`
- [x] **Task 2**: Refactor `src/state.js` API calls and fallback logic
  - *Acceptance*: Code uses aligned APIs and doesn't crash on WASM loading or tokenizer creation.
  - *Verify*: `npm test` passes.
  - *Files*: `src/state.js`
- [x] **Task 3**: Run local server and E2E Cypress validation
  - *Acceptance*: Cypress suite runs and passes against the refactored code.
  - *Verify*: `npx cypress run` passes.
  - *Files*: None

## Iteration: Greedy Sampler Top-K Validation Fix

### Objective
Fix the runtime generation crash `Generation failed: Top-K value 64 must be <= 1` that occurs when using the Greedy sampler.

### Success Criteria
- [x] Construct `samplerParams` conditionally based on the active `samplerType`.
- [x] If `samplerType === "greedy"`, pass `k = 1`, `p = 1.0`, and `temperature = 0.0` to comply with the engine's validation check.
- [x] Unit tests pass successfully.
- [x] E2E Cypress tests pass successfully.

### Tasks List
- [x] **Task 4**: Add dynamic `getSamplerParams` helper and refactor `src/state.js` conversation creation.
  - *Acceptance*: State manager applies compliant parameters for greedy/top-p/top-k.
  - *Verify*: `npm test` passes.
  - *Files*: `src/state.js`
- [x] **Task 5**: Verify via Cypress E2E.
  - *Acceptance*: Cypress suite runs and passes.
  - *Verify*: `npx cypress run` passes.
  - *Files*: None

## Iteration: Chat Retitling & Persistence

### Objective
Add the capability for users to rename (retitle) conversations in the sidebar. The updated titles must persist in the browser's `localStorage` across page reloads.

### Success Criteria
- [ ] Render a rename button (pencil/edit icon or similar indicator) next to each conversation item in the sidebar.
- [ ] Clicking the rename button toggles an inline text input field pre-filled with the current title.
- [ ] Saving the new title (via Enter key, blur, or checkmark button) calls `ChatStateManager.renameConversation(id, newTitle)`.
- [ ] `ChatStateManager.renameConversation(id, newTitle)` updates the matching conversation in `conversationsList` and calls `saveSavedConversationsIndex()`.
- [ ] Escape key or clicking Cancel (cross button) cancels the edit without saving.
- [ ] Add unit tests in `test/state.test.js` to verify that `renameConversation(id, newTitle)` updates the list and persists it.
- [ ] Add E2E tests in `cypress/e2e/chat.cy.js` to verify the UI flow (clicking rename, typing a new name, saving, and seeing it updated).

### Tasks List
- [x] **Task 6**: Update `src/state.js` to implement `renameConversation(id, newTitle)` and unit tests in `test/state.test.js`.
  - *Acceptance*: State manager supports renaming; unit tests cover success and boundaries.
  - *Verify*: `npm test` passes.
  - *Files*: `src/state.js`, `test/state.test.js`
- [x] **Task 7**: Update `src/components.js` to support inline renaming in the sidebar.
  - *Acceptance*: Sidebar items can be edited via inline text inputs.
  - *Verify*: Manual browser check looks beautiful and functions cleanly.
  - *Files*: `src/components.js`
- [x] **Task 8**: Add Cypress E2E tests for the renaming flow.
  - *Acceptance*: Cypress test clicks rename, inputs new name, saves, and asserts change.
  - *Verify*: `npx cypress run` passes.
  - *Files*: `cypress/e2e/chat.cy.js`

## Iteration: Phaser JS Talking Avatar & Voice Interaction

### Objective
Create an in-browser voice-interactive experience:
1. Render a procedural 2D cartoon avatar in Phaser JS positioned above the chat timeline.
2. Implement local Text-to-Speech (TTS) using the Web Speech Synthesis API, queued to speak sentence-by-sentence dynamically as the LLM stream is generated.
3. Synchronize the Phaser avatar's mouth-flap and facial expression animations with the talking state.
4. Implement local Speech-to-Text (STT) voice input using the Web Speech Recognition API, activated via a toggleable Microphone button with visual state changes.

### Assumptions I'm Making:
1. **Phaser JS**: Loaded from CDN (`https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js`) via a `<script>` tag in `index.html`.
2. **Text-to-Speech (TTS)**: Built-in browser `window.speechSynthesis` API is used. No external API keys are required.
3. **Speech-to-Text (STT)**: Built-in browser `window.SpeechRecognition` (or `window.webkitSpeechRecognition`) is used.
4. **Sentence Streaming**: We split the LLM response text into sentences on punctuation (e.g. `.`, `!`, `?`, `\n`) and feed them into a TTS speak queue to minimize initial voice delay.
5. **Fallback**: If speech APIs are blocked or unsupported by the browser, the application degrades gracefully with console warnings and disables the voice UI elements.

### Success Criteria
- [x] Phaser script loaded and initialized dynamically or statically in `index.html`.
- [x] A dedicated avatar card/panel is rendered above the chat timeline, housing a Phaser Canvas.
- [x] Phaser avatar displays an idle animation (e.g., breathing, occasional eye blinking) when not speaking.
- [x] Phaser avatar displays a talking animation (e.g., mouth opening/closing procedurally) when TTS is speaking.
- [x] LLM stream is parsed on the fly into complete sentences, and sentences are queued and read sequentially.
- [x] Microphone button added to the input panel. Clicking it toggles speech recognition.
- [x] Speech recognition captures user voice, prints transcribed text in the input area, and automatically submits the prompt when the user stops speaking.
- [x] TTS speech can be stopped/interrupted if the user clicks "Stop" during generation.
- [x] Unit tests updated/added in `test/state.test.js` to mock/verify speech queue features.
- [x] Cypress E2E tests verify the existence of the avatar card and the mic button.

### Implementation Plan
1. **Script Integration**: Add Phaser JS CDN script link to `index.html`.
2. **State Manager (TTS & STT)**:
   - Add a `SpeechQueue` class or state helpers in `src/state.js` to split, queue, and synthesize text.
   - Bind talking state changes to state variables (e.g. `this.isSpeaking = true/false`).
   - Implement web Speech Recognition start/stop flow and auto-submit hooks.
3. **Phaser Avatar Component**:
   - Implement a new Web Component `litert-avatar` in `src/components.js` that boots a Phaser Game instance.
   - Use Phaser graphics primitives (circle, arcs, paths) to draw a cute, stylized cartoon face (eyes, head, mouth) procedurally.
   - Implement Phaser update/animations loop reacting to state changes (`isSpeaking`).
4. **UI Integration**:
   - Embed `litert-avatar` above the chat messages container in `litert-chat-window`.
   - Add mic button with mic-icon (using SVG) to the input bar.
5. **Validation**: Write tests and check that the application works seamlessly.

### Tasks List
- [x] **Task 9**: Integrate Phaser CDN and create the Speech manager inside `src/state.js` with tests in `test/state.test.js`.
  - *Acceptance*: Sentence splitter and speak queue work. Unit tests cover queuing and splitting logic.
  - *Verify*: `npm test` passes.
  - *Files*: `index.html`, `src/state.js`, `test/state.test.js`
- [x] **Task 10**: Build the `litert-avatar` component using Phaser JS.
  - *Acceptance*: Character is drawn procedurally and animates its mouth when `isSpeaking` is true.
  - *Verify*: Open in browser and verify the canvas character draws correctly and blinks/moves.
  - *Files*: `src/components.js`
- [x] **Task 11**: Connect Speech Recognition input & Microphone button UI.
  - *Acceptance*: Clicking the microphone starts recognition, updating input text, and auto-submits.
  - *Verify*: Microphones are active, text parses.
  - *Files*: `src/components.js`, `src/state.js`
- [x] **Task 12**: Run E2E Cypress tests to check layout alignment.
  - *Acceptance*: Cypress checks avatar container and mic button presence.
  - *Verify*: `npx cypress run` passes.
  - *Files*: `cypress/e2e/chat.cy.js`
## Iteration: Multilingual Support (Language Selection & Alignment)

### Objective
Allow the user to select their desired conversation language in the sidebar settings. This language configuration will:
1. Force the local LLM agent to only chat (respond) in the selected language.
2. Align the local Text-to-Speech (TTS) voice and language configuration to speak with matching accent and pronunciation.
3. Align the Speech-to-Text (STT) recognition engine to correctly transcribe the user's spoken voice in the selected language.

- [x] Add a "Language" dropdown select element in the sidebar settings panel.
- [x] Persist `chatLanguage` (defaulting to `"English"`) inside the settings structure in `localStorage`.
- [x] Map `chatLanguage` in `state.js` to BCP 47 codes:
  * English -> `en-US`
  * Spanish -> `es-ES`
  * French -> `fr-FR`
  * German -> `de-DE`
  * Chinese -> `zh-CN`
  * Japanese -> `ja-JP`
  * Portuguese -> `pt-BR`
  * Italian -> `it-IT`
- [x] Update `SpeechRecognition` to configure `recognition.lang` to the mapped BCP 47 code.
- [x] Configure `SpeechSynthesisUtterance.lang` and select a matching voice based on the BCP 47 code.
- [x] Append prompt postfix `\n\n[Instruction: Respond ONLY in ${this.chatLanguage}.]` in `ChatStateManager.sendMessage` (and the `redoResponse` flow).
- [x] Update unit tests in `test/state.test.js` to verify language settings loading, persistence, and dynamic voice/recognition mapping.
- [x] Verify that Cypress E2E tests run successfully (mocking/checking the new language element).

### Implementation Plan
1. **State Manager Updates**:
   - Add `chatLanguage` to the settings and default state.
   - Map languages to BCP 47 tags.
   - Configure `recognition.lang` and SpeechQueue to use the mapped language code.
   - Append prompt instruction in `sendMessage`.
2. **UI Settings Panel**:
   - Add a `<select>` dropdown in `src/components.js` for language selection under the inference settings.
3. **Validation**:
   - Update unit tests in `test/state.test.js` to assert `chatLanguage` default, setting, and correct execution paths.
   - Ensure `npm test` and local server Cypress flows pass cleanly.

### Tasks List
- [x] **Task 13**: Refactor `src/state.js` to support `chatLanguage`, BCP 47 language mapping, TTS/STT language injection, and prompt constraint appending.
  - *Acceptance*: State manager initializes, persists, and utilizes the selected language correctly.
  - *Verify*: `npm test` passes.
  - *Files*: `src/state.js`
- [x] **Task 14**: Update `src/components.js` settings drawer UI.
  - *Acceptance*: A premium dropdown for Language is rendered in the sidebar, modifying `state.chatLanguage` on change.
  - *Verify*: Manual browser check of sidebar select box.
  - *Files*: `src/components.js`
- [x] **Task 15**: Add unit tests in `test/state.test.js` to verify language changes, STT alignment, and prompt postfix injection.
  - *Acceptance*: Test suite verifies multilingual logic with 100% pass status.
  - *Verify*: `npm test` passes.
  - *Files*: `test/state.test.js`
- [x] **Task 16**: Update and run Cypress E2E tests.
  - *Acceptance*: Cypress verifies presence of the language setting select box and that settings updates affect the state correctly.
  - *Verify*: `npx cypress run` passes.
  - *Files*: `cypress/e2e/chat.cy.js`

## Iteration: Selective Audio Stop (Stop Speech But Not Generation)

### Objective
Allow the user to stop the audio speech playback (TTS) of the agent's response immediately, without interrupting the textual stream/generation of the answer in the chat timeline.

### Success Criteria
- [x] Implement `stopSpeechOnly()` in `ChatStateManager` to clear `SpeechQueue` and set `isSpeechMutedForCurrentResponse = true`.
- [x] Reset `isSpeechMutedForCurrentResponse = false` in `ChatStateManager.sendMessage(prompt)`.
- [x] Prevent sentence splitting and queuing inside `sendMessage` loop if `isSpeechMutedForCurrentResponse` is true.
- [x] Add the "Stop Audio" button dynamically inside `LiteRTAvatar` component when `state.isSpeaking` is true.
- [x] Add unit tests verifying `stopSpeechOnly()` behavior, state suppression, and reset on the next prompt.
- [x] Verify that Cypress E2E tests run successfully (mocking/checking the new selective stop audio button).

### Implementation Plan
1. **State Manager Updates**:
   - Add `isSpeechMutedForCurrentResponse = false` to default state.
   - Implement `stopSpeechOnly()` method to clear/stop the SpeechQueue and set `isSpeechMutedForCurrentResponse = true`.
   - In `sendMessage()`, reset `isSpeechMutedForCurrentResponse` to `false` at start.
   - Conditionally add sentences to `SpeechQueue` inside the streaming loop only if `!isSpeechMutedForCurrentResponse`.
2. **UI Updates**:
   - In `src/components.js`, inside `LiteRTAvatar.render()`, if `state.isSpeaking` is true, render a "Stop Audio" button. Clicking it invokes `state.stopSpeechOnly()`.
3. **Validation**:
   - Add tests to `test/state.test.js` validating the state suppression, SpeechQueue stopping, and auto-reset.
   - Update Cypress E2E test suite to verify presence and clickability of the "Stop Audio" button.

### Tasks List
- [x] **Task 17**: Refactor `src/state.js` to implement `stopSpeechOnly()`, suppress TTS queuing when active, and reset on `sendMessage()`.
  - *Acceptance*: State manager supports stopping audio separately from generation.
  - *Verify*: `npm test` passes.
  - *Files*: `src/state.js`
- [x] **Task 18**: Update `src/components.js` to render the "Stop Audio" button on the `<litert-avatar>` component card.
  - *Acceptance*: "Stop Audio" button is visible when avatar is speaking, and clicking it halts speech.
  - *Verify*: Manual browser check of avatar card during audio synthesis.
  - *Files*: `src/components.js`
- [x] **Task 19**: Add unit tests in `test/state.test.js` to cover selective audio stopping and reset flows.
  - *Acceptance*: Unit tests verify the new state flag and SpeechQueue interaction.
  - *Verify*: `npm test` passes.
  - *Files*: `test/state.test.js`
- [x] **Task 20**: Run Cypress E2E tests.
  - *Acceptance*: Verification suite runs successfully.
  - *Verify*: `npx cypress run` passes.
  - *Files*: `cypress/e2e/chat.cy.js`

## Iteration: Multilingual Speech-to-Text Robustness (Continuous Listening)

### Objective
Ensure that both Spanish and English voice transcription (Speech-to-Text) functions smoothly, reliably, and without premature cutoffs.

### Success Criteria
- [x] Set `rec.continuous = true` in `initSpeechRecognition()`.
- [x] Update `rec.onresult` to loop from `0` to `event.results.length` to properly accumulate transcripts across continuous sessions.
- [x] Add explicit error message handling in `rec.onerror` to update `state.statusText`.
- [x] Update unit tests in `test/state.test.js` to mock continuous speech recognition events and assert proper transcript accumulation and error feedback.
- [x] Verify that Cypress E2E tests run successfully.

### Implementation Plan
1. **State Manager Updates**:
   - In `initSpeechRecognition()`, configure `rec.continuous = true`.
   - Update the loop inside `rec.onresult` to read from index `0` to `event.results.length` and combine `finalTranscript + interimTranscript`.
   - In `rec.onerror`, set `this.statusText = 'Voice input failed: ' + e.error`.
2. **Unit Tests**:
   - Update tests in `test/state.test.js` to simulate multiple event results in SpeechRecognition mock to verify the loop scans from index 0.
   - Assert error messaging works correctly.
3. **Validation**:
   - Verify all unit tests and Cypress E2E tests pass.

### Tasks List
- [x] **Task 21**: Refactor `src/state.js` to enable continuous recognition, build accumulated transcripts, and capture descriptive speech error feedback.
  - *Acceptance*: State manager supports continuous voice recording and detailed error reports.
  - *Verify*: `npm test` passes.
  - *Files*: `src/state.js`
- [x] **Task 22**: Update unit tests in `test/state.test.js` to mock continuous results lists and assert error status messages.
  - *Acceptance*: Test suite verifies continuous accumulation and error logging with 100% pass status.
  - *Verify*: `npm test` passes.
  - *Files*: `test/state.test.js`
- [x] **Task 23**: Run Cypress E2E tests.
  - *Acceptance*: Verification suite runs successfully.
  - *Verify*: `npx cypress run` passes.
  - *Files*: `cypress/e2e/chat.cy.js`


