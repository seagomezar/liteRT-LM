import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatStateManager } from '../src/state.js';
import { LocalRAGIndex } from '../src/rag.js';
import { FeatureConfigManager } from '../src/config.js';

/**
 * Deterministic Mock Engine for LiteRT-LM Core
 */
function createMockEngine(responseChunks = ["Mocked response token 1 ", "token 2 ", "token 3."]) {
  return {
    async createConversation() {
      return {
        async sendMessageStreaming(prompt) {
          let chunkIndex = 0;
          return {
            getReader() {
              return {
                async read() {
                  if (chunkIndex < responseChunks.length) {
                    const chunk = responseChunks[chunkIndex++];
                    if (typeof chunk === 'string') {
                      return { done: false, value: chunk };
                    }
                    return { done: false, value: chunk };
                  }
                  return { done: true, value: undefined };
                },
                cancel() {}
              };
            }
          };
        },
        cancelProcess() {},
        delete() {}
      };
    },
    async getTokenizer() {
      return {
        encode(text) {
          return text.split(/\s+/).filter(Boolean);
        }
      };
    }
  };
}

test('End-to-End Simulation Ground Truth Suite: Real User Flows', async (t) => {
  // In-memory browser environment simulation
  const mockStorage = new Map();
  global.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
      this.lang = 'en-US';
      this.voice = null;
      this.onend = null;
      this.onerror = null;
    }
  };

  global.window = {
    localStorage: {
      getItem: (k) => mockStorage.get(k) || null,
      setItem: (k, v) => mockStorage.set(k, String(v)),
      removeItem: (k) => mockStorage.delete(k),
      clear: () => mockStorage.clear()
    },
    confirm: () => true,
    caches: {
      open: async () => ({
        keys: async () => [],
        delete: async () => true,
        put: async () => {}
      })
    },
    speechSynthesis: {
      speak: (u) => {
        setTimeout(() => { if (u.onend) u.onend(); }, 5);
      },
      cancel: () => {},
      getVoices: () => [{ name: "Standard English", lang: "en-US" }]
    }
  };

  await t.test('Flow 1: Complete User Chat Turn with Streaming, CoT Reasoning, and Telemetry', async () => {
    mockStorage.clear();
    const state = new ChatStateManager();

    // Attach mock engine with reasoning channels and content
    state.engine = createMockEngine([
      { channels: { thought: "Analyzing user query regarding WebGPU..." } },
      "WebGPU ",
      "provides ",
      "direct ",
      "compute shader access."
    ]);
    state.activeConversation = await state.engine.createConversation();

    // User types prompt and sends message
    const prompt = "Explain WebGPU compute shaders";
    await state.sendMessage(prompt);

    // Verify Ground Truth Post-Conditions:
    assert.equal(state.isGenerating, false, 'Generation must be marked finished');
    assert.equal(state.statusText, "Generation completed.");
    assert.equal(state.messages.length, 2, 'Must have exactly 1 user message and 1 assistant message');

    // User Message Invariants
    const userMsg = state.messages[0];
    assert.equal(userMsg.role, "user");
    assert.equal(userMsg.text, prompt);
    assert.ok(parseInt(userMsg.tokensCount, 10) > 0);

    // Assistant Message Invariants
    const botMsg = state.messages[1];
    assert.equal(botMsg.role, "assistant");
    assert.equal(botMsg.thoughtText, "Analyzing user query regarding WebGPU...");
    assert.equal(botMsg.text, "WebGPU provides direct compute shader access.");
    assert.ok(botMsg.decodeSpeed.includes("tk/s"));
    assert.ok(botMsg.prefillSpeed.includes("tk/s"));
    assert.ok(parseInt(botMsg.tokensCount, 10) >= 4);

    // Persistence Check
    assert.ok(state.activeSavedConvId !== null, 'Active conversation ID must be established');
    const storedHistory = JSON.parse(mockStorage.get(`litertlm-chat-history-${state.activeSavedConvId}`));
    assert.equal(storedHistory.length, 2);
    assert.equal(storedHistory[1].text, "WebGPU provides direct compute shader access.");
  });

  await t.test('Flow 2: Rewind (Edit) and Redo (Retry) Conversational Branching', async () => {
    mockStorage.clear();
    const state = new ChatStateManager();
    state.engine = createMockEngine(["Turn answer."]);
    state.activeConversation = await state.engine.createConversation();

    // Turn 1
    await state.sendMessage("Turn 1 Question");
    // Turn 2
    state.engine = createMockEngine(["Turn 2 original answer."]);
    state.activeConversation = await state.engine.createConversation();
    await state.sendMessage("Turn 2 Question");

    assert.equal(state.messages.length, 4);

    // User clicks Edit (Rewind) on Turn 2 question (index 2)
    state.rewindConversation(2);

    // Verify Ground Truth:
    assert.equal(state.messages.length, 2, 'Messages at and beyond rewind index must be discarded');
    assert.equal(state.messages[0].text, "Turn 1 Question");
    assert.equal(state.messages[1].role, "assistant");

    // User submits alternative branch
    state.engine = createMockEngine(["Turn 2 branched answer."]);
    state.activeConversation = await state.engine.createConversation();
    await state.sendMessage("Turn 2 Alternative Question");

    assert.equal(state.messages.length, 4);
    assert.equal(state.messages[2].text, "Turn 2 Alternative Question");
    assert.equal(state.messages[3].text, "Turn 2 branched answer.");

    // User clicks Retry (Redo) on last response (index 3)
    state.engine = createMockEngine(["Turn 2 retried answer."]);
    state.activeConversation = await state.engine.createConversation();
    await state.redoResponse(3);

    assert.equal(state.messages.length, 4);
    assert.equal(state.messages[3].text, "Turn 2 retried answer.");
  });

  await t.test('Flow 3: Multi-Session Conversation Management (New, Select, Rename, Delete)', async () => {
    mockStorage.clear();
    const state = new ChatStateManager();
    state.engine = createMockEngine(["A response."]);
    state.activeConversation = await state.engine.createConversation();

    // Create Session 1
    await state.sendMessage("Session 1 Topic");
    const session1Id = state.activeSavedConvId;
    assert.ok(session1Id);
    assert.equal(state.conversationsList.length, 1);

    // User starts New Chat
    state.startNewConversation();
    assert.equal(state.activeSavedConvId, null);
    assert.equal(state.messages.length, 0);

    // Create Session 2
    state.engine = createMockEngine(["B response."]);
    state.activeConversation = await state.engine.createConversation();
    await state.sendMessage("Session 2 Topic");
    const session2Id = state.activeSavedConvId;
    assert.notEqual(session1Id, session2Id);
    assert.equal(state.conversationsList.length, 2);

    // Switch back to Session 1
    await state.selectConversation(session1Id);
    assert.equal(state.activeSavedConvId, session1Id);
    assert.equal(state.messages.length, 2);
    assert.equal(state.messages[0].text, "Session 1 Topic");

    // Rename Session 1
    state.renameConversation(session1Id, "Renamed Research Session 1");
    const conv1Meta = state.conversationsList.find(c => c.id === session1Id);
    assert.equal(conv1Meta.title, "Renamed Research Session 1");

    // Delete Session 2
    state.deleteConversation(session2Id);
    assert.equal(state.conversationsList.length, 1);
    assert.equal(global.window.localStorage.getItem(`litertlm-chat-history-${session2Id}`), null);
  });

  await t.test('Flow 4: Document RAG Ingestion, BM25 Indexing, and Context Augmentation Flow', async () => {
    mockStorage.clear();
    const rag = new LocalRAGIndex({ autoPersist: true });
    global.window.ragIndex = rag;
    global.window.getRagPrompt = (q) => rag.getRagPrompt(q);

    // 1. Ingest Technical Specifications
    rag.addDocument('spec_manual.md', `
      LiteRT-LM is an on-device WebGPU inference runtime.
      It uses Gemma 4 small parameter models compiled into WGSL compute shaders.
      Maximum context length supported is 8192 tokens.
      Offline weight caching utilizes CacheStorage container litertlm-models.
    `);

    // 2. Ingest Unrelated Document
    rag.addDocument('recipes.txt', `
      Sourdough bread recipe: mix 500g bread flour with 350g lukewarm water.
      Add 100g active sourdough starter and 10g sea salt. Ferment for 4 hours.
    `);

    assert.equal(rag.documents.size, 2);
    assert.ok(rag.chunks.length >= 2);

    // 3. User queries technical topic
    const userQuery = "What is the maximum context length in LiteRT-LM?";
    const augmentedPrompt = rag.getRagPrompt(userQuery);

    // Verify Ground Truth prompt structure
    assert.ok(augmentedPrompt.includes("Context from uploaded documents:"));
    assert.ok(augmentedPrompt.includes("spec_manual.md"));
    assert.ok(augmentedPrompt.includes("Maximum context length supported is 8192 tokens"));
    assert.ok(!augmentedPrompt.includes("Sourdough bread recipe"));
    assert.ok(augmentedPrompt.includes(`Question: ${userQuery}`));

    // 4. Disable RAG and verify prompt passthrough
    rag.disable();
    const disabledPrompt = rag.getRagPrompt(userQuery);
    assert.equal(disabledPrompt, userQuery);

    // 5. Re-enable and verify single document removal
    rag.enable();
    rag.removeDocument('spec_manual.md');
    assert.equal(rag.documents.size, 1);
    const postDeletePrompt = rag.getRagPrompt(userQuery);
    assert.equal(postDeletePrompt, userQuery, 'Deleted document must not augment queries');

    // 6. Clear all
    rag.clearAll();
    assert.equal(rag.documents.size, 0);
    assert.equal(rag.chunks.length, 0);
  });

  await t.test('Flow 5: Audio Speech Controls (Selective Mute Without Generation Abort)', async () => {
    mockStorage.clear();
    const state = new ChatStateManager();
    state.chatLanguage = "Spanish";
    state.enableVoiceResponse = true;

    state.engine = createMockEngine([
      "Primer fragmento. ",
      "Segundo fragmento! ",
      "Tercer fragmento final."
    ]);
    state.activeConversation = await state.engine.createConversation();

    // Start generation
    const promise = state.sendMessage("Pregunta en español");

    // While generation is in progress, user presses "Stop Audio Only"
    state.stopSpeechOnly();

    await promise;

    // Verify Ground Truth:
    assert.equal(state.isSpeechMutedForCurrentResponse, true);
    assert.equal(state.isSpeaking, false);
    assert.equal(state.messages[1].text, "Primer fragmento. Segundo fragmento! Tercer fragmento final.");
    assert.equal(state.statusText, "Generation completed.");
  });

  await t.test('Flow 6: Stream Abort and User Cancellation Recovery', async () => {
    mockStorage.clear();
    const state = new ChatStateManager();

    // Engine that provides an infinite / slow stream
    let cancelled = false;
    state.engine = {
      async createConversation() {
        return {
          async sendMessageStreaming() {
            return {
              getReader() {
                return {
                  async read() {
                    if (cancelled) return { done: true, value: undefined };
                    return { done: false, value: "Generating endless stream token..." };
                  },
                  cancel() { cancelled = true; }
                };
              }
            };
          },
          cancelProcess() { cancelled = true; },
          delete() {}
        };
      },
      async getTokenizer() {
        return { encode: () => [1] };
      }
    };
    state.importCore = async () => ({});
    state.activeConversation = await state.engine.createConversation();

    // Trigger message and immediately stop it
    const sendPromise = state.sendMessage("Infinite prompt");
    state.stopGeneration();

    await sendPromise;

    // Verify Ground Truth:
    assert.equal(state.isGenerating, false, 'Must gracefully exit isGenerating state');
    assert.equal(state.isCancelled, true);
    const botMsg = state.messages[1];
    assert.ok(botMsg.text.includes("*[Generation stopped by user]*"));
  });

  await t.test('Flow 7: Feature Config Manager Switchboard Synchronization', async () => {
    mockStorage.clear();
    const config = new FeatureConfigManager();

    // Toggle off avatar and code preview
    config.set('avatar', false);
    config.set('codePreview', false);

    assert.equal(config.get('avatar'), false);
    assert.equal(config.get('codePreview'), false);
    assert.equal(config.get('rag'), true);

    // Export configuration script
    const all = config.getAll();
    assert.equal(all.avatar, false);
    assert.equal(all.codePreview, false);

    // Reset defaults restores all
    config.reset();
    assert.equal(config.get('avatar'), true);
    assert.equal(config.get('codePreview'), true);
  });
});
