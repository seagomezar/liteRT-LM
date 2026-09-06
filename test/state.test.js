import test from 'node:test';
import assert from 'node:assert';

// -------------------------------------------------------------
// Global environment mocking for state.js in Node environment
// -------------------------------------------------------------

global.performance = {
  now() {
    return Date.now();
  }
};

global.window = {
  confirmResult: true,
  confirmCalledWith: null,
  confirm(msg) {
    global.window.confirmCalledWith = msg;
    return global.window.confirmResult;
  },
  localStorage: {
    store: {},
    getItem(key) { return this.store[key] || null; },
    setItem(key, value) { this.store[key] = String(value); },
    removeItem(key) { delete this.store[key]; },
    clear() { this.store = {}; }
  },
  caches: {
    store: new Map(),
    mockMatchResponse: null,
    async open(name) {
      return {
        async match(req) {
          const url = typeof req === 'string' ? req : req.url;
          if (global.window.caches.mockMatchResponse) {
            return global.window.caches.mockMatchResponse(url);
          }
          return global.window.caches.store.get(url) || null;
        },
        async put(url, response) {
          global.window.caches.store.set(url, response);
        },
        async keys() {
          return Array.from(global.window.caches.store.keys()).map(url => ({ url }));
        },
        async delete(url) {
          global.window.caches.store.delete(url);
          return true;
        }
      };
    },
    async delete(name) {
      global.window.caches.store.clear();
      return true;
    }
  }
};

// Speech Synthesis and Recognition Mocking
class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    this.voice = null;
    this.onend = null;
    this.onerror = null;
  }
}
global.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;

global.window.speechSynthesis = {
  speakingList: [],
  getVoices() {
    return [{ name: "Mock English Voice", lang: "en-US" }];
  },
  speak(utterance) {
    this.speakingList.push(utterance);
    setTimeout(() => {
      const idx = this.speakingList.indexOf(utterance);
      if (idx !== -1) {
        this.speakingList.splice(idx, 1);
      }
      if (typeof utterance.onend === 'function') {
        utterance.onend();
      }
    }, 5);
  },
  cancel() {
    this.speakingList.forEach(ut => {
      if (typeof ut.onend === 'function') ut.onend();
    });
    this.speakingList = [];
  }
};

class MockSpeechRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = false;
    this.lang = 'en-US';
    this.onstart = null;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
  }
  start() {
    if (typeof this.onstart === 'function') this.onstart();
    // Simulate speech input
    setTimeout(() => {
      if (typeof this.onresult === 'function') {
        this.onresult({
          resultIndex: 0,
          results: [[{ transcript: "mock voice input", isFinal: true }]]
        });
      }
      if (typeof this.onend === 'function') this.onend();
    }, 5);
  }
  stop() {
    if (typeof this.onend === 'function') this.onend();
  }
}
global.window.SpeechRecognition = MockSpeechRecognition;
global.window.webkitSpeechRecognition = MockSpeechRecognition;

global.document = {
  readyState: 'complete',
  addEventListener() {},
  body: {},
  getElementById(id) {
    if (id === 'chat-input-textarea') {
      return {
        value: '',
        dispatchEvent() {}
      };
    }
    return null;
  }
};

global.MutationObserver = class {
  observe() {}
};

global.Response = class {
  constructor(body, options) {
    this.body = body;
    this.headers = {
      get(key) {
        return options?.headers?.[key] || null;
      }
    };
    this.ok = options?.status ? (options.status >= 200 && options.status < 300) : true;
    this.statusText = options?.statusText || 'OK';
  }
};

global.ReadableStream = class {
  constructor(underlyingSource) {
    this.underlyingSource = underlyingSource;
    this.enqueued = [];
    this.closed = false;
    this.errorVal = null;
    this.controller = {
      enqueue: (val) => this.enqueued.push(val),
      close: () => { this.closed = true; },
      error: (err) => { this.errorVal = err; }
    };
    if (underlyingSource && typeof underlyingSource.start === 'function') {
      try {
        underlyingSource.start(this.controller);
      } catch (err) {
        this.errorVal = err;
      }
    }
  }
  getReader() {
    let index = 0;
    const stream = this;
    return {
      async read() {
        if (stream.errorVal) {
          throw stream.errorVal;
        }
        if (index < stream.enqueued.length) {
          return { done: false, value: stream.enqueued[index++] };
        }
        // If not enqueued yet, return default mock value once for standard fetch mock bodies
        if (index === 0 && !stream.closed) {
          index++;
          return { done: false, value: new Uint8Array([1, 2, 3, 4, 5]) };
        }
        return { done: true };
      },
      async cancel() {
        if (stream.underlyingSource && typeof stream.underlyingSource.cancel === 'function') {
          stream.underlyingSource.cancel();
        }
      }
    };
  }
  tee() {
    return [this, this];
  }
};

global.AbortController = class {
  constructor() {
    this.signal = { aborted: false };
    this.abortedReason = null;
  }
  abort(reason) {
    this.signal.aborted = true;
    this.abortedReason = reason;
  }
};

global.fetch = async (url, options) => {
  if (global.mockFetch) {
    return global.mockFetch(url, options);
  }
  return new global.Response(new global.ReadableStream(), {
    headers: { 'content-length': '1000' }
  });
};

// -------------------------------------------------------------
// Core Mock for LiteRT-LM dependency
// -------------------------------------------------------------
const mockCore = {
  DEFAULT_WASM_PATH: 'https://cdn.jsdelivr.net/npm/@litert-lm/core@0.12.1/dist/litertlm.wasm',
  LiteRtLm: {
    DEFAULT_WASM_PATH: 'https://cdn.jsdelivr.net/npm/@litert-lm/core@0.13.1/wasm'
  },
  async loadLiteRtLm(path) {
    global.wasmPathLoaded = path;
    return true;
  },
  async loadWasmModule(path) {
    global.wasmPathLoaded = path;
    return true;
  },
  SamplerType: { GREEDY: 0, TOP_K: 1, TOP_P: 2 },
  Engine: {
    async create({ model }) {
      return await mockCore.Engine.createEngine({ model });
    },
    async createEngine({ model, wasmPath }) {
      // Consume stream to trigger onProgress callback inside makeProgressStream
      if (model && typeof model.getReader === 'function') {
        const reader = model.getReader();
        try {
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        } catch (_) {}
      }
      return {
        async createConversation(config) {
          return {
            delete() {
              global.deletedConversation = true;
            },
            async sendMessageStreaming(prompt) {
              if (global.mockSendMessageStreaming) {
                return global.mockSendMessageStreaming(prompt);
              }
              // Default mock readable stream returning thought and content tokens
              return {
                getReader() {
                  let index = 0;
                  const chunks = [
                    { content: null, channels: { thought: 'Initial thoughts...' } },
                    { content: 'Hello', channels: null },
                    { content: ' from engine', channels: null }
                  ];
                  return {
                    async read() {
                      if (index < chunks.length) {
                        return { done: false, value: chunks[index++] };
                      }
                      return { done: true };
                    },
                    async cancel() {}
                  };
                }
              };
            },
            cancelProcess() {
              global.cancelProcessCalled = true;
            }
          };
        },
        async getTokenizer() {
          return {
            encode(text) {
              return { length: text.split(/\s+/).length };
            }
          };
        }
      };
    }
  }
};


// -------------------------------------------------------------
// Test suites
// -------------------------------------------------------------

test('RAG Engine Unit Tests', async (t) => {
  const { LocalRAGIndex, tokenize } = await import('../src/rag.js');

  await t.test('tokenization filters out stop words and handles punctuation', () => {
    const tokens = tokenize('This is a simple query, right?');
    assert.deepStrictEqual(tokens, ['simple', 'query', 'right']);
  });

  await t.test('enable and disable state management', () => {
    const rag = new LocalRAGIndex();
    let updated = false;
    rag.addListener(() => { updated = true; });

    rag.disable();
    assert.strictEqual(rag.enabled, false);
    assert.strictEqual(updated, true);

    updated = false;
    rag.enable();
    assert.strictEqual(rag.enabled, true);
    assert.strictEqual(updated, true);
  });

  await t.test('addDocument with duplicate filename overwrites existing', () => {
    const rag = new LocalRAGIndex();
    rag.addDocument('test.txt', 'This is content one');
    assert.strictEqual(rag.documents.size, 1);
    assert.strictEqual(rag.chunks.length, 1);

    // Add again with duplicate
    rag.addDocument('test.txt', 'New completely different text data for testing');
    assert.strictEqual(rag.documents.size, 1);
    assert.ok(rag.chunks[0].text.includes('completely different'));
  });

  await t.test('removeDocument gracefully handles nonexistent files', () => {
    const rag = new LocalRAGIndex();
    rag.addDocument('test.txt', 'Original content');
    rag.removeDocument('nonexistent.txt');
    assert.strictEqual(rag.documents.size, 1);
  });

  await t.test('clearAll removes all documents and recalculates', () => {
    const rag = new LocalRAGIndex();
    rag.addDocument('a.txt', 'Hello universe');
    rag.addDocument('b.txt', 'Hello galaxy');
    assert.strictEqual(rag.documents.size, 2);

    rag.clearAll();
    assert.strictEqual(rag.documents.size, 0);
    assert.strictEqual(rag.chunks.length, 0);
  });

  await t.test('search returns empty when index has no chunks or query has no tokens', () => {
    const rag = new LocalRAGIndex();
    assert.deepStrictEqual(rag.search('hello'), []);
    
    rag.addDocument('a.txt', 'Hello universe');
    assert.deepStrictEqual(rag.search(''), []);
  });

  await t.test('getRagPrompt formats matched prompt correctly', () => {
    const rag = new LocalRAGIndex();
    // Default prompt when disabled or empty
    assert.strictEqual(rag.getRagPrompt('my query'), 'my query');

    rag.disable();
    rag.addDocument('a.txt', 'Important token details about the local project.');
    assert.strictEqual(rag.getRagPrompt('local project'), 'local project');

    rag.enable();
    const prompt = rag.getRagPrompt('local project');
    assert.ok(prompt.includes('Context from uploaded documents'));
    assert.ok(prompt.includes('Important token details'));

    // Test query with no matching terms
    const noMatchPrompt = rag.getRagPrompt('completely different query');
    assert.strictEqual(noMatchPrompt, 'completely different query');
  });

  await t.test('logs array rotation does not exceed limit', () => {
    const rag = new LocalRAGIndex();
    for (let i = 0; i < 25; i++) {
      rag.addLog(`log entry ${i}`);
    }
    assert.ok(rag.logs.length <= 20);
  });
});


test('ChatStateManager Unit Tests', async (t) => {
  const { ChatStateManager } = await import('../src/state.js');

  await t.test('initializes default values', () => {
    const state = new ChatStateManager();
    assert.strictEqual(state.contextLength, 4096);
    assert.strictEqual(state.isWasmLoaded, false);
    assert.strictEqual(state.messages.length, 0);
  });

  await t.test('addHost registers host and calls addController', () => {
    const state = new ChatStateManager();
    let controllerAdded = false;
    const mockHost = {
      addController(ctrl) {
        if (ctrl === state) controllerAdded = true;
      },
      requestUpdate() {}
    };
    state.addHost(mockHost);
    assert.strictEqual(state.hosts.includes(mockHost), true);
    assert.strictEqual(controllerAdded, true);

    // Call addHost again (should not duplicate)
    state.addHost(mockHost);
    assert.strictEqual(state.hosts.length, 1);
  });

  await t.test('requestUpdate calls host requestUpdate method', () => {
    const state = new ChatStateManager();
    let updated = false;
    const mockHost = {
      requestUpdate() { updated = true; }
    };
    state.addHost(mockHost);
    state.requestUpdate();
    assert.strictEqual(updated, true);

    // Gracefully handles host updating error
    const faultyHost = {
      requestUpdate() { throw new Error('Faulty update'); }
    };
    state.addHost(faultyHost);
    assert.doesNotThrow(() => state.requestUpdate());
  });

  await t.test('hostConnected and hostDisconnected hooks', () => {
    const state = new ChatStateManager();
    state.hostConnected();
    assert.strictEqual(state.messages.length, 0);

    state.hostDisconnected();
    assert.strictEqual(state.engine, null);
  });

  await t.test('loadSettings and saveSettings logic', () => {
    global.window.localStorage.clear();
    const state = new ChatStateManager();
    state.contextLength = 1024;
    state.enableThinking = false;
    state.saveSettings();

    const state2 = new ChatStateManager();
    state2.loadSettings();
    assert.strictEqual(state2.contextLength, 1024);
    assert.strictEqual(state2.enableThinking, false);

    // LocalStorage failure handling
    const originalGetItem = global.window.localStorage.getItem;
    global.window.localStorage.getItem = () => { throw new Error('Storage blocked'); };
    assert.doesNotThrow(() => state2.loadSettings());
    global.window.localStorage.getItem = originalGetItem;
  });

  await t.test('handleResetSettings handles confirm confirmation', () => {
    const state = new ChatStateManager();
    state.contextLength = 1024;

    // confirm returns false
    global.window.confirmResult = false;
    state.handleResetSettings();
    assert.strictEqual(state.contextLength, 1024);

    // confirm returns true
    global.window.confirmResult = true;
    state.handleResetSettings();
    assert.strictEqual(state.contextLength, 4096);
  });

  await t.test('selectConversation restores conversation state', () => {
    global.window.localStorage.clear();
    const state = new ChatStateManager();
    state.conversationsList = [
      { id: '123', title: 'Test Conv', modelPath: 'custom-path' }
    ];
    state.saveSavedConversationsIndex();

    global.window.localStorage.setItem('litertlm-chat-history-123', JSON.stringify([
      { role: 'user', text: 'Hi', senderName: 'User' },
      { role: 'assistant', text: 'Hello', senderName: 'Bot' }
    ]));

    state.selectConversation('123');
    assert.strictEqual(state.activeSavedConvId, '123');
    assert.strictEqual(state.messages.length, 2);
    assert.strictEqual(state.selectedModelPath, 'custom-path');
    assert.deepStrictEqual(state.pendingHistory, [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' }
    ]);
  });

  await t.test('deleteConversation clears files and active conversation', () => {
    global.window.localStorage.clear();
    const state = new ChatStateManager();
    state.conversationsList = [
      { id: '123', title: 'Conv 1' },
      { id: '456', title: 'Conv 2' }
    ];
    state.activeSavedConvId = '123';

    state.deleteConversation('123');
    assert.strictEqual(state.conversationsList.length, 1);
    assert.strictEqual(state.activeSavedConvId, null); // should start new
  });

  await t.test('renameConversation updates title and saves index', () => {
    global.window.localStorage.clear();
    const state = new ChatStateManager();
    state.conversationsList = [
      { id: '123', title: 'Old Title' }
    ];
    state.saveSavedConversationsIndex();

    state.renameConversation('123', 'New Title');
    assert.strictEqual(state.conversationsList[0].title, 'New Title');

    // Verify localStorage has been updated
    const saved = JSON.parse(global.window.localStorage.getItem(state.CONVS_LIST_KEY));
    assert.strictEqual(saved[0].title, 'New Title');

    // Handles empty or whitespace-only inputs gracefully (should not rename)
    state.renameConversation('123', '   ');
    assert.strictEqual(state.conversationsList[0].title, 'New Title');
    
    // Handles nonexistent conversation gracefully
    state.renameConversation('999', 'Ghost');
    assert.strictEqual(state.conversationsList[0].title, 'New Title');
  });

  await t.test('commitActiveChatHistory creates entry when active ID is null', () => {
    global.window.localStorage.clear();
    const state = new ChatStateManager();
    state.messages = [
      { role: 'user', text: 'Prompt description is very long to test title truncation limit here' }
    ];
    state.commitActiveChatHistory();

    assert.ok(state.activeSavedConvId);
    assert.strictEqual(state.conversationsList.length, 1);
    assert.strictEqual(state.conversationsList[0].title, 'Prompt description is very...');
  });

  await t.test('rewindConversation and redoResponse operations', () => {
    const state = new ChatStateManager();
    state.messages = [
      { role: 'user', text: 'Hi' },
      { role: 'assistant', text: 'Hello' },
      { role: 'user', text: 'Test' }
    ];

    // Rewind - reject confirm
    global.window.confirmResult = false;
    state.rewindConversation(1);
    assert.strictEqual(state.messages.length, 3);

    // Rewind - accept confirm
    global.window.confirmResult = true;
    state.rewindConversation(1);
    assert.strictEqual(state.messages.length, 1);
    assert.deepStrictEqual(state.pendingHistory, [{ role: 'user', content: 'Hi' }]);

    // RedoResponse - reject
    state.messages = [
      { role: 'user', text: 'Hi' },
      { role: 'assistant', text: 'Hello' }
    ];
    global.window.confirmResult = false;
    state.redoResponse(1);
    assert.strictEqual(state.messages.length, 2);
  });

  await t.test('cache metrics updateCacheSize, deleteModelFromCache, clearAllCache', async () => {
    global.window.caches.store.clear();
    const state = new ChatStateManager();

    // Mock key matching in caches
    const cachedResponse = new global.Response(null, { headers: { 'content-length': '2048' } });
    global.window.caches.store.set('http://model-url', cachedResponse);

    await state.updateCacheSize();
    assert.strictEqual(state.cachedModels.size, 1);
    assert.strictEqual(state.cachedModels.get('model-url'), 2048);

    // Delete
    await state.deleteModelFromCache('http://model-url');
    assert.strictEqual(state.cachedModels.size, 0);

    // Clear all
    global.window.caches.store.set('http://model-url', cachedResponse);
    await state.clearAllCache();
    assert.strictEqual(state.cachedModels.size, 0);
  });

  await t.test('loadModelWeights download from URL cache miss compiles successfully', async () => {
    const state = new ChatStateManager();
    state.importCore = async () => mockCore;

    // Force cache miss
    global.window.caches.mockMatchResponse = () => null;

    let fetchCalled = false;
    global.mockFetch = async (url) => {
      fetchCalled = true;
      return new global.Response(new global.ReadableStream(), {
        headers: { 'content-length': '500' }
      });
    };

    await state.loadModelWeights();
    assert.strictEqual(fetchCalled, true);
    assert.strictEqual(state.isWasmLoaded, true);
    assert.ok(state.engine);
    assert.ok(state.activeConversation);
    assert.strictEqual(state.statusText, 'Model loaded and ready.');
  });

  await t.test('loadModelWeights download from cache hit compiles successfully', async () => {
    const state = new ChatStateManager();
    state.importCore = async () => mockCore;

    // Force cache hit
    global.window.caches.mockMatchResponse = () => new global.Response(new global.ReadableStream(), {
      headers: { 'content-length': '500' }
    });

    await state.loadModelWeights();
    assert.strictEqual(state.statusText, 'Model loaded and ready.');
  });

  await t.test('cancelDownload cancels download controller', () => {
    const state = new ChatStateManager();
    let abortCalled = false;
    state.downloadAbortController = {
      abort() { abortCalled = true; }
    };
    state.cancelDownload();
    assert.strictEqual(abortCalled, true);
    assert.strictEqual(state.isModelLoading, false);
    assert.strictEqual(state.statusText, 'Download cancelled by user.');
  });

  await t.test('sendMessage executes full streaming timeline', async () => {
    const state = new ChatStateManager();
    state.importCore = async () => mockCore;

    // Set engine and conversation
    await state.loadModelWeights();

    await state.sendMessage('My test prompt');
    assert.strictEqual(state.isGenerating, false);
    assert.strictEqual(state.messages.length, 2); // 1 user + 1 bot
    assert.strictEqual(state.messages[1].text, 'Hello from engine');
    assert.strictEqual(state.messages[1].thoughtText, 'Initial thoughts...');
    assert.ok(state.messages[1].decodeSpeed);
  });

  await t.test('sendMessage handles stream cancellation', async () => {
    const state = new ChatStateManager();
    state.importCore = async () => mockCore;
    await state.loadModelWeights();

    // Mock a slow streaming response that checks cancellation
    global.mockSendMessageStreaming = async () => {
      return {
        getReader() {
          return {
            async read() {
              // Trigger cancellation flow
              state.stopGeneration();
              throw new Error('Stream cancelled');
            },
            async cancel() {}
          };
        }
      };
    };

    global.cancelProcessCalled = false;
    await state.sendMessage('Cancel prompt');
    assert.strictEqual(global.cancelProcessCalled, true);
    assert.ok(state.messages[1].text.includes('[Generation stopped by user]'));
  });

  await t.test('stopGeneration cancels active reader', () => {
    const state = new ChatStateManager();
    state.isGenerating = true;
    state.activeConversation = {
      cancelProcess() { global.cancelProcessCalled = true; }
    };
    let readerCancelled = false;
    state.activeReader = {
      cancel() { readerCancelled = true; }
    };

    state.stopGeneration();
    assert.strictEqual(state.isCancelled, true);
    assert.strictEqual(readerCancelled, true);
  });

  await t.test('constructor with host parameter, cleanup error catch', () => {
    let controllerAdded = false;
    const mockHost = {
      addController() { controllerAdded = true; },
      requestUpdate() {}
    };
    const state = new ChatStateManager(mockHost);
    assert.strictEqual(controllerAdded, true);

    state.activeConversation = {
      delete() { throw new Error('Mock delete failure'); }
    };
    state.cleanup();
    assert.strictEqual(state.activeConversation, null);
  });

  await t.test('localStorage exception handling', async () => {
    const state = new ChatStateManager();
    const originalSetItem = global.window.localStorage.setItem;
    const originalGetItem = global.window.localStorage.getItem;
    
    try {
      // Save settings error
      global.window.localStorage.setItem = () => { throw new Error('Blocked write'); };
      assert.doesNotThrow(() => state.saveSettings());
      
      // Load conversations error
      global.window.localStorage.getItem = () => { throw new Error('Blocked read'); };
      assert.doesNotThrow(() => state.loadSavedConversationsIndex());
      
      // Save conversations error
      assert.doesNotThrow(() => state.saveSavedConversationsIndex());

      // JSON parse error in selectConversation
      global.window.localStorage.setItem = originalSetItem;
      global.window.localStorage.getItem = () => '{ invalid json ';
      await state.selectConversation('123');
    } finally {
      global.window.localStorage.setItem = originalSetItem;
      global.window.localStorage.getItem = originalGetItem;
    }
  });

  await t.test('deleteConversation deletes non-active item', () => {
    const state = new ChatStateManager();
    state.conversationsList = [
      { id: '123', title: 'Active' },
      { id: '456', title: 'Inactive' }
    ];
    state.activeSavedConvId = '123';
    state.deleteConversation('456');
    assert.strictEqual(state.conversationsList.length, 1);
    assert.strictEqual(state.activeSavedConvId, '123');
  });

  await t.test('rewindConversation and redoResponse error paths', async () => {
    const state = new ChatStateManager();
    state.messages = [{ role: 'user', text: 'Hi' }];
    const originalMessages = Object.getOwnPropertyDescriptor(state, 'messages');
    
    try {
      // Mock messages to throw on slice
      Object.defineProperty(state, 'messages', {
        get() { throw new Error('Slice fail'); },
        set() {},
        configurable: true
      });
      
      global.window.confirmResult = true;
      state.rewindConversation(0);
      assert.strictEqual(state.statusText, 'Rewind failed.');

      // redoResponse fail path
      await state.redoResponse(1);
      assert.strictEqual(state.statusText, 'Retry failed.');
    } finally {
      if (originalMessages) {
        Object.defineProperty(state, 'messages', originalMessages);
      } else {
        delete state.messages;
        state.messages = [];
      }
    }
  });

  await t.test('caches error catch handling', async () => {
    const state = new ChatStateManager();
    const originalOpen = global.window.caches.open;
    global.window.caches.open = () => { throw new Error('Cache open fail'); };

    await state.updateCacheSize();
    await state.deleteModelFromCache('http://model');
    await state.clearAllCache();
    
    // restore
    global.window.caches.open = originalOpen;
  });

  await t.test('makeProgressStream error and cancel paths', async () => {
    const state = new ChatStateManager();
    // Simulate reading stream that throws immediately
    const faultyStream = {
      getReader() {
        return {
          async read() { throw new Error('Faulty stream read'); },
          async cancel() {}
        };
      }
    };
    
    const progressStream = state.makeProgressStream(faultyStream, () => {});
    // Let microtasks execute so error can propagate to controller
    await new Promise(resolve => setTimeout(resolve, 0));

    const reader = progressStream.getReader();
    await assert.rejects(async () => {
      await reader.read();
    }, /Faulty stream read/);
    
    await reader.cancel();
  });

  await t.test('loadModelWeights details: pendingHistory, download progress speed, caching errors', async () => {
    const state = new ChatStateManager();
    state.importCore = async () => mockCore;
    state.pendingHistory = [{ role: 'user', content: 'Preloaded' }];

    // Force cache miss
    global.window.caches.mockMatchResponse = () => null;

    // Mock download fetch response
    global.mockFetch = async () => {
      return new global.Response(new global.ReadableStream(), {
        headers: { 'content-length': '1000' }
      });
    };

    // Mock cache open to return a failing put
    const originalOpen = global.window.caches.open;
    global.window.caches.open = async () => {
      return {
        async match() { return null; },
        async put() { throw new Error('Disk full'); },
        async keys() { return []; }
      };
    };

    await state.loadModelWeights();
    assert.strictEqual(state.statusCacheText, '⚠ Cache Failed: Disk quota exceeded. (Running from memory)');
    
    // Restore
    global.window.caches.open = originalOpen;
  });

  await t.test('loadModelWeights fails to import core compiler runtime', async () => {
    const state = new ChatStateManager();
    state.importCore = async () => { throw new Error('Network error'); };

    await state.loadModelWeights();
    assert.strictEqual(state.isModelLoading, false);
    assert.ok(state.statusText.includes('Failed to load model'));
  });

  await t.test('sendMessage auto-loads model when engine is null', async () => {
    const state = new ChatStateManager();
    state.importCore = async () => mockCore;
    state.engine = null; // force auto-load

    await state.sendMessage('Auto load weights test');
    assert.ok(state.engine);
    assert.strictEqual(state.messages.length, 2);
  });

  await t.test('sendMessage handles cancellation cleanup errors', async () => {
    const state = new ChatStateManager();
    state.importCore = async () => mockCore;
    await state.loadModelWeights();

    // Force cancellation cleanup recreateConversation error
    state.isCancelled = true;
    
    const originalCreate = state.engine.createConversation;
    state.engine.createConversation = () => { throw new Error('Recreation fail'); };
    
    global.mockSendMessageStreaming = async () => {
      return {
        getReader() {
          return {
            async read() { return { done: true }; },
            async cancel() {}
          };
        }
      };
    };

    await state.sendMessage('Force cleanup test');
    // should fail silently in recreate but not crash
    assert.strictEqual(state.isGenerating, false);
    
    // restore
    state.engine.createConversation = originalCreate;
  });

  await t.test('addLog delegating to global RAG indexer or console.log', () => {
    const state = new ChatStateManager();
    let loggedMsg = null;
    global.window.ragIndex = {
      addLog(msg) { loggedMsg = msg; }
    };

    state.addLog('Log to RAG');
    assert.strictEqual(loggedMsg, 'Log to RAG');
    
    // Clean up
    delete global.window.ragIndex;
    delete global.window.getRagPrompt;
    
    // Call without RAG index (should not throw)
    assert.doesNotThrow(() => state.addLog('Log to console'));
  });

  await t.test('rewindConversation with activeConversation present', () => {
    const state = new ChatStateManager();
    state.messages = [{ role: 'user', text: 'Hi' }, { role: 'assistant', text: 'Hello' }];
    
    let deleted = false;
    state.activeConversation = {
      delete() { deleted = true; }
    };

    global.window.confirmResult = true;
    state.rewindConversation(1);
    assert.strictEqual(deleted, true);
    assert.strictEqual(state.activeConversation, null);
  });

  await t.test('redoResponse success path execution', async () => {
    const state = new ChatStateManager();
    state.importCore = async () => mockCore;
    await state.loadModelWeights();

    state.messages = [
      { role: 'user', text: 'Prompt first' },
      { role: 'assistant', text: 'Response first' }
    ];
    
    let deleted = false;
    state.activeConversation = {
      delete() { deleted = true; }
    };

    global.window.confirmResult = true;
    global.mockSendMessageStreaming = null; // use default stream
    
    await state.redoResponse(2);
    await new Promise(r => setTimeout(r, 10));
    while (state.isModelLoading || state.isGenerating) {
      await new Promise(r => setTimeout(r, 10));
    }
    assert.strictEqual(deleted, true);
    assert.strictEqual(state.statusText, 'Generation completed.');
  });

  await t.test('sendMessage stream loops break when isCancelled is true', async () => {
    const state = new ChatStateManager();
    state.importCore = async () => mockCore;
    await state.loadModelWeights();

    global.mockSendMessageStreaming = async () => {
      return {
        getReader() {
          return {
            async read() {
              state.isCancelled = true;
              return { done: false, value: { content: 'Interrupted' } };
            },
            async cancel() {}
          };
        }
      };
    };

    await state.sendMessage('Stream cancel prompt');
    while (state.isGenerating) {
      await new Promise(r => setTimeout(r, 0));
    }
    assert.strictEqual(state.statusText, 'Generation completed.');
  });

  await t.test('SpeechQueue queuing, stop, and speech recognition toggle', async () => {
    const state = new ChatStateManager();
    state.enableVoiceResponse = true;

    // Test SpeechQueue add
    state.speechQueue.add('Hello world. This is a test.');
    assert.strictEqual(state.isSpeaking, true);
    assert.strictEqual(state.speechQueue.queue.length, 0);

    // Stop SpeechQueue
    state.speechQueue.stop();
    assert.strictEqual(state.isSpeaking, false);

    // Test Speech Recognition toggling
    assert.strictEqual(state.isListening, false);
    state.toggleListening();
    
    // Wait for the mock async callbacks to fire
    await new Promise(r => setTimeout(r, 15));
    assert.strictEqual(state.isListening, false); // should end after mock triggers result/end
  });

  await t.test('multilingual support configuration and alignment', async () => {
    const state = new ChatStateManager();
    
    // Default language is English
    assert.strictEqual(state.chatLanguage, 'English');

    // Mapped BCP 47 code works
    const { LANGUAGE_CODES } = await import('../src/state.js');
    assert.strictEqual(LANGUAGE_CODES['Spanish'], 'es-ES');

    // Change language to Spanish
    state.chatLanguage = 'Spanish';
    state.saveSettings();

    // Verify loading settings retrieves the saved language
    const anotherState = new ChatStateManager();
    anotherState.loadSettings();
    assert.strictEqual(anotherState.chatLanguage, 'Spanish');

    // Test speech recognition language updates dynamically on start
    anotherState.toggleListening();
    assert.strictEqual(anotherState.recognition.lang, 'es-ES');
    anotherState.recognition.stop();

    // Test prompt postfix instruction injection
    anotherState.importCore = async () => mockCore;
    await anotherState.loadModelWeights();

    let lastSentPrompt = null;
    global.mockSendMessageStreaming = async (prompt) => {
      lastSentPrompt = prompt;
      return {
        getReader() {
          return {
            async read() { return { done: true }; },
            async cancel() {}
          };
        }
      };
    };

    await anotherState.sendMessage('Hola amigo');
    assert.ok(lastSentPrompt.includes('[Instruction: Respond ONLY in Spanish.]'));

    // Resetting settings defaults language back to English
    anotherState.handleResetSettings();
    assert.strictEqual(anotherState.chatLanguage, 'English');
  });

  await t.test('selective audio stop suppresses speech queue but does not cancel inference', async () => {
    const state = new ChatStateManager();
    state.importCore = async () => mockCore;
    await state.loadModelWeights();

    // Default flag
    assert.strictEqual(state.isSpeechMutedForCurrentResponse, false);

    // Stop speech only sets flag and stops queue
    state.stopSpeechOnly();
    assert.strictEqual(state.isSpeechMutedForCurrentResponse, true);

    // Sending a message resets flag
    let lastSentPrompt = null;
    global.mockSendMessageStreaming = async (prompt) => {
      lastSentPrompt = prompt;
      return {
        getReader() {
          let count = 0;
          return {
            async read() {
              if (count === 0) {
                count++;
                return { done: false, value: { content: 'This should not speak.' } };
              }
              return { done: true };
            },
            async cancel() {}
          };
        }
      };
    };

    // Before sending, verify it resets to false
    await state.sendMessage('Test speech suppression');
    assert.strictEqual(state.isSpeechMutedForCurrentResponse, false);

    // Call stopSpeechOnly during speech synthesis/generation
    state.stopSpeechOnly();
    assert.strictEqual(state.isSpeechMutedForCurrentResponse, true);
    assert.strictEqual(state.isSpeaking, false);
  });

  await t.test('continuous speech recognition accumulates results and reports errors', async () => {
    const state = new ChatStateManager();
    
    // Override getElementById temporarily to be stateful
    const mockTextarea = {
      value: '',
      dispatchEvent() {}
    };
    const originalGetElementById = global.document.getElementById;
    global.document.getElementById = (id) => {
      if (id === 'chat-input-textarea' || id === 'terminal-prompt-input') return mockTextarea;
      return null;
    };

    try {
      // Initialize recognition
      state.initSpeechRecognition();
      assert.ok(state.recognition);
      assert.strictEqual(state.recognition.continuous, true);
      assert.strictEqual(state.getChatInputElement(), mockTextarea);

      // Mock onresult with multi-part continuous results
      let finalEvent = {
        results: [
          [{ transcript: "Hello world", isFinal: true }],
          [{ transcript: " this is continuous", isFinal: true }],
          [{ transcript: " testing", isFinal: false }]
        ]
      };

      // Trigger onresult mock
      state.recognition.onresult(finalEvent);
      assert.strictEqual(mockTextarea.value, "Hello world this is continuous testing");

      // Trigger onerror mock
      state.recognition.onerror({ error: 'not-allowed' });
      assert.strictEqual(state.isListening, false);
      assert.strictEqual(state.statusText, 'Voice input failed: not-allowed');

      // Verify onend after error resets flag without throwing
      state.recognition.onend();
      assert.strictEqual(state.isListening, false);
    } finally {
      // Restore
      global.document.getElementById = originalGetElementById;
    }
  });

  await t.test('loadModelFromFile reads file stream, updates metrics and initializes session', async () => {
    const state = new ChatStateManager();
    const mockCore = {
      SamplerType: { GREEDY: 0, TOP_K: 1, TOP_P: 2 },
      Engine: {
        async create() {
          return {
            async createConversation() {
              return {
                async sendMessageStreaming() {
                  return { getReader() { return { read() { return { done: true }; } }; } };
                }
              };
            }
          };
        }
      }
    };
    state.importCore = async () => mockCore;

    const mockFile = {
      name: 'gemma-local.litertlm',
      size: 1048576,
      stream() {
        return new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(1048576));
            controller.close();
          }
        });
      }
    };

    await state.loadModelFromFile(mockFile);
    assert.strictEqual(state.isModelLoading, false);
    assert.ok(state.statusText.includes('Model loaded from local file'));
    assert.ok(state.engine);
    assert.ok(state.activeConversation);
  });

  await t.test('liveTokensPerSec initializes at 0 and is accessible', () => {
    const state = new ChatStateManager();
    assert.strictEqual(state.liveTokensPerSec, 0);
  });
});

