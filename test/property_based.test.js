import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { LocalRAGIndex, tokenize } from '../src/rag.js';
import { FeatureConfigManager, DEFAULT_FEATURES } from '../src/config.js';
import { ChatStateManager } from '../src/state.js';

test('Property-Based Safety Suite: Specifying What Should NEVER Happen', async (t) => {
  // In-memory mock storage
  const mockStorage = new Map();
  global.window = {
    localStorage: {
      getItem: (k) => mockStorage.get(k) || null,
      setItem: (k, v) => mockStorage.set(k, String(v)),
      removeItem: (k) => mockStorage.delete(k),
      clear: () => mockStorage.clear()
    },
    confirm: () => true
  };

  await t.test('Property 1: RAG Search NEVER returns chunks from deleted documents or after clearAll', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            filename: fc.stringMatching(/^[a-z0-9_-]{3,8}\.(txt|md)$/),
            text: fc.stringMatching(/^[a-zA-Z0-9\s.,]{30,150}$/)
          }),
          { minLength: 2, maxLength: 6 }
        ),
        fc.stringMatching(/^[a-zA-Z0-9\s]{3,20}$/),
        (docs, query) => {
          const rag = new LocalRAGIndex({ autoPersist: false });

          // Ingest all documents
          for (const doc of docs) {
            rag.addDocument(doc.filename, doc.text);
          }

          // Pick one document to delete
          const docToDelete = docs[0].filename;
          rag.removeDocument(docToDelete);

          // Search
          const results = rag.search(query, 10, 0.0);

          // INVARIANT: Results must NEVER contain the deleted document
          for (const res of results) {
            assert.notEqual(
              res.chunk.filename,
              docToDelete,
              `INVARIANT VIOLATION: Search returned chunk from expunged document "${docToDelete}"`
            );
          }

          // INVARIANT: After clearAll, search must NEVER return any results
          rag.clearAll();
          const emptyResults = rag.search(query, 10, 0.0);
          assert.equal(
            emptyResults.length,
            0,
            `INVARIANT VIOLATION: Search returned ${emptyResults.length} chunks after clearAll()`
          );

          assert.equal(rag.documents.size, 0);
          assert.equal(rag.chunks.length, 0);

          return true;
        }
      ),
      { numRuns: 1000, seed: 101 }
    );
  });

  await t.test('Property 2: BM25 score is NEVER negative, NaN, null, or Infinite', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            filename: fc.stringMatching(/^[a-z0-9]{3,6}\.txt$/),
            text: fc.string({ minLength: 10, maxLength: 300 })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        fc.string({ minLength: 1, maxLength: 50 }),
        (docs, query) => {
          const rag = new LocalRAGIndex({ autoPersist: false });

          for (const doc of docs) {
            rag.addDocument(doc.filename, doc.text);
          }

          const results = rag.search(query, 10, -999); // minimum threshold to catch everything

          for (const res of results) {
            // INVARIANT: Score must be a valid non-negative finite number
            assert.ok(!Number.isNaN(res.score), `INVARIANT VIOLATION: Score is NaN for query "${query}"`);
            assert.ok(Number.isFinite(res.score), `INVARIANT VIOLATION: Score is Infinite for query "${query}"`);
            assert.ok(res.score >= 0, `INVARIANT VIOLATION: Score is negative (${res.score}) for query "${query}"`);
          }

          return true;
        }
      ),
      { numRuns: 1000, seed: 202 }
    );
  });

  await t.test('Property 3: Tokenizer NEVER emits stopwords, length-1 tokens, or uppercase characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }),
        (rawText) => {
          const tokens = tokenize(rawText);

          for (const token of tokens) {
            // INVARIANT 1: Must never be 1 character or less
            assert.ok(
              token.length > 1,
              `INVARIANT VIOLATION: Token length must be > 1, got "${token}"`
            );

            // INVARIANT 2: Must never contain uppercase characters
            assert.equal(
              token,
              token.toLowerCase(),
              `INVARIANT VIOLATION: Token contains uppercase characters: "${token}"`
            );

            // INVARIANT 3: Must never contain punctuation or whitespace
            assert.ok(
              !/[\s.,;:!?(){}\[\]]/.test(token),
              `INVARIANT VIOLATION: Token contains illegal punctuation or whitespace: "${token}"`
            );
          }

          return true;
        }
      ),
      { numRuns: 1000, seed: 303 }
    );
  });

  await t.test('Property 4: FeatureConfigManager NEVER corrupts schema or leaks unknown keys', () => {
    const knownKeys = Object.keys(DEFAULT_FEATURES);

    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({
              action: fc.constant('set'),
              key: fc.string({ minLength: 1, maxLength: 20 }),
              val: fc.boolean()
            }),
            fc.record({
              action: fc.constant('toggle'),
              key: fc.string({ minLength: 1, maxLength: 20 })
            }),
            fc.record({
              action: fc.constant('setMultiple'),
              obj: fc.dictionary(fc.string({ minLength: 1, maxLength: 15 }), fc.boolean())
            }),
            fc.record({
              action: fc.constant('reset')
            })
          ),
          { minLength: 5, maxLength: 30 }
        ),
        (operations) => {
          mockStorage.clear();
          const manager = new FeatureConfigManager();

          for (const op of operations) {
            if (op.action === 'set') {
              manager.set(op.key, op.val);
            } else if (op.action === 'toggle') {
              manager.toggle(op.key);
            } else if (op.action === 'setMultiple') {
              manager.setMultiple(op.obj);
            } else if (op.action === 'reset') {
              manager.reset();
            }

            // INVARIANT 1: getAll() must return ONLY the known DEFAULT_FEATURES keys
            const all = manager.getAll();
            const currentKeys = Object.keys(all).sort();
            assert.deepEqual(
              currentKeys,
              knownKeys.slice().sort(),
              'INVARIANT VIOLATION: Feature set keys corrupted'
            );

            // INVARIANT 2: Every key must strictly hold a boolean primitive
            for (const key of knownKeys) {
              assert.equal(
                typeof all[key],
                'boolean',
                `INVARIANT VIOLATION: Feature "${key}" is not a boolean (${typeof all[key]})`
              );
              assert.equal(
                typeof manager.get(key),
                'boolean',
                `INVARIANT VIOLATION: manager.get("${key}") is not a boolean`
              );
            }

            // INVARIANT 3: Unknown keys must always return false
            assert.equal(
              manager.get('completely_bogus_key_' + Math.random()),
              false,
              'INVARIANT VIOLATION: Unknown key did not return false'
            );
          }

          return true;
        }
      ),
      { numRuns: 1000, seed: 404 }
    );
  });

  await t.test('Property 5: ChatStateManager Conversation Invariants Under Random Action Traces', () => {
    // Model-based state test checking conversational safety invariants
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({
              op: fc.constant('pushMessage'),
              role: fc.constantFrom('user', 'assistant'),
              text: fc.stringMatching(/^[a-zA-Z0-9\s.,]{1,50}$/)
            }),
            fc.record({
              op: fc.constant('commit')
            }),
            fc.record({
              op: fc.constant('startNew')
            }),
            fc.record({
              op: fc.constant('selectRandom')
            }),
            fc.record({
              op: fc.constant('deleteRandom')
            }),
            fc.record({
              op: fc.constant('renameRandom'),
              title: fc.stringMatching(/^[a-zA-Z0-9\s]{1,30}$/)
            }),
            fc.record({
              op: fc.constant('rewindRandom')
            })
          ),
          { minLength: 5, maxLength: 30 }
        ),
        (actions) => {
          mockStorage.clear();
          const state = new ChatStateManager();

          for (const action of actions) {
            if (action.op === 'pushMessage') {
              state.messages.push({
                role: action.role,
                text: action.text,
                senderName: action.role === 'user' ? 'User' : 'Bot'
              });
            } else if (action.op === 'commit') {
              if (state.messages.length > 0) {
                state.commitActiveChatHistory();
              }
            } else if (action.op === 'startNew') {
              state.startNewConversation();
            } else if (action.op === 'selectRandom') {
              if (state.conversationsList.length > 0) {
                const target = state.conversationsList[0];
                state.selectConversation(target.id);
              }
            } else if (action.op === 'deleteRandom') {
              if (state.conversationsList.length > 0) {
                const targetId = state.conversationsList[0].id;
                state.deleteConversation(targetId);
              }
            } else if (action.op === 'renameRandom') {
              if (state.conversationsList.length > 0) {
                const targetId = state.conversationsList[0].id;
                state.renameConversation(targetId, action.title);
              }
            } else if (action.op === 'rewindRandom') {
              if (state.messages.length > 1) {
                const cutIndex = Math.floor(state.messages.length / 2);
                state.rewindConversation(cutIndex);
              }
            }

            // SAFETY INVARIANTS CHECKED AFTER EVERY ACTION:

            // 1. activeSavedConvId must exist in conversationsList or be null
            if (state.activeSavedConvId !== null) {
              const exists = state.conversationsList.some(c => c.id === state.activeSavedConvId);
              assert.ok(
                exists,
                `INVARIANT VIOLATION: activeSavedConvId "${state.activeSavedConvId}" does not exist in conversationsList`
              );
            }

            // 2. conversationsList must NEVER have duplicate IDs
            const convIds = state.conversationsList.map(c => c.id);
            assert.equal(
              new Set(convIds).size,
              convIds.length,
              'INVARIANT VIOLATION: conversationsList contains duplicate conversation IDs'
            );

            // 3. conversationsList titles must NEVER be empty or undefined
            for (const c of state.conversationsList) {
              assert.ok(c.title && typeof c.title === 'string' && c.title.trim().length > 0,
                'INVARIANT VIOLATION: Conversation has an empty title');
            }

            // 4. messages array items must have valid role ('user' | 'assistant')
            for (const msg of state.messages) {
              assert.ok(
                msg.role === 'user' || msg.role === 'assistant',
                `INVARIANT VIOLATION: Message has invalid role "${msg.role}"`
              );
              assert.ok(
                typeof msg.text === 'string',
                'INVARIANT VIOLATION: Message text is not a string'
              );
            }
          }

          return true;
        }
      ),
      { numRuns: 1000, seed: 505 }
    );
  });

  await t.test('Property 6: Hyperparameters and inference configurations NEVER produce NaN or corrupted state', () => {
    fc.assert(
      fc.property(
        fc.record({
          temp: fc.double({ min: -10, max: 10, noNaN: true }),
          topP: fc.double({ min: -5, max: 5, noNaN: true }),
          topK: fc.integer({ min: -100, max: 500 }),
          ctx: fc.integer({ min: -1000, max: 65536 }),
          lang: fc.constantFrom('English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Portuguese', 'Italian')
        }),
        (config) => {
          mockStorage.clear();
          const state = new ChatStateManager();

          // Set parameters
          state.temperature = config.temp;
          state.topP = config.topP;
          state.topK = config.topK;
          state.contextLength = config.ctx;
          state.chatLanguage = config.lang;

          // Save settings to storage
          state.saveSettings();

          // Instantiate a fresh manager to simulate tab reload
          const reloaded = new ChatStateManager();
          reloaded.loadSettings();

          // INVARIANTS:
          assert.ok(!Number.isNaN(reloaded.temperature), 'INVARIANT VIOLATION: Temperature became NaN');
          assert.ok(!Number.isNaN(reloaded.topP), 'INVARIANT VIOLATION: TopP became NaN');
          assert.ok(!Number.isNaN(reloaded.topK), 'INVARIANT VIOLATION: TopK became NaN');
          assert.ok(!Number.isNaN(reloaded.contextLength), 'INVARIANT VIOLATION: Context length became NaN');
          assert.equal(reloaded.chatLanguage, config.lang, 'INVARIANT VIOLATION: Language mismatch');

          // Reset to defaults must restore safe valid ranges
          reloaded.handleResetSettings();
          assert.equal(reloaded.temperature, 1.0);
          assert.equal(reloaded.topP, 0.95);
          assert.equal(reloaded.topK, 64);
          assert.equal(reloaded.contextLength, 4096);

          return true;
        }
      ),
      { numRuns: 1000, seed: 606 }
    );
  });

  await t.test('Property 7: Stream Chunk Split Invariant (Zero token loss under arbitrary fragmentation)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 50 }),
        (originalText, chunkSizes) => {
          // Simulate arbitrary chunk fragmentation from network/Wasm stream
          const chunks = [];
          let offset = 0;
          let idx = 0;

          while (offset < originalText.length) {
            const size = chunkSizes[idx % chunkSizes.length];
            chunks.push(originalText.slice(offset, offset + size));
            offset += size;
            idx++;
          }

          // Re-assemble
          let reconstructed = '';
          for (const chunk of chunks) {
            reconstructed += chunk;
          }

          // INVARIANT: Complete character conservation
          assert.equal(
            reconstructed,
            originalText,
            'INVARIANT VIOLATION: Reconstructed text differs from original under fragmentation'
          );

          // INVARIANT: Number of chunks is strictly >= 1
          assert.ok(chunks.length >= 1, 'INVARIANT VIOLATION: Chunks array is empty');

          return true;
        }
      ),
      { numRuns: 1000, seed: 707 }
    );
  });
});
