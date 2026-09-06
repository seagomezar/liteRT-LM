export const LANGUAGE_CODES = {
  "English": "en-US",
  "Spanish": "es-ES",
  "French": "fr-FR",
  "German": "de-DE",
  "Chinese": "zh-CN",
  "Japanese": "ja-JP",
  "Portuguese": "pt-BR",
  "Italian": "it-IT"
};

/**
 * SpeechQueue helper class for sentence-by-sentence local TTS play queue.
 */
class SpeechQueue {
  constructor(stateManager) {
    this.stateManager = stateManager;
    this.queue = [];
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.voice = null;
  }

  setVoice(voiceName) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    this.voice = voices.find(v => v.name === voiceName) || null;
  }

  add(text) {
    const cleanText = text.trim();
    if (!cleanText) return;
    this.queue.push(cleanText);
    this.process();
  }

  process() {
    if (this.isSpeaking || this.queue.length === 0) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    this.isSpeaking = true;
    this.stateManager.isSpeaking = true;
    this.stateManager.requestUpdate();

    const textToSpeak = this.queue.shift();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    
    const targetLangCode = LANGUAGE_CODES[this.stateManager.chatLanguage] || 'en-US';
    utterance.lang = targetLangCode;

    if (this.voice) {
      utterance.voice = this.voice;
    } else {
      const voices = window.speechSynthesis.getVoices();
      const matchingVoice = voices.find(v => v.lang.startsWith(targetLangCode.split('-')[0]) || v.lang === targetLangCode);
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }
    }

    utterance.onend = () => {
      this.isSpeaking = false;
      this.currentUtterance = null;
      this.stateManager.isSpeaking = false;
      this.stateManager.requestUpdate();
      this.process();
    };

    utterance.onerror = (e) => {
      console.error("[SpeechQueue] TTS error:", e);
      this.isSpeaking = false;
      this.currentUtterance = null;
      this.stateManager.isSpeaking = false;
      this.stateManager.requestUpdate();
      this.process();
    };

    this.currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  stop() {
    this.queue = [];
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.stateManager.isSpeaking = false;
    this.stateManager.requestUpdate();
  }
}


/**
 * Application State Manager for LiteRT-LM WebGPU Chat PWA.
 * Orchestrates settings, localStorage persistence, conversation threads,
 * model weight downloading, caching, and stream decoding.
 */
export class ChatStateManager {
  constructor(host = null) {
    this.hosts = [];
    
    // Core parameters
    this.selectedModelPath = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm";
    this.contextLength = 4096;
    this.maxOutputTokens = 2048;
    this.samplerType = "greedy";
    this.temperature = 1.0;
    this.topP = 0.95;
    this.topK = 64;
    this.enableThinking = true;
    this.chatLanguage = "English";

    // Status Flags
    this.isWasmLoaded = false;
    this.isModelLoading = false;
    this.isGenerating = false;
    this.statusText = "Idle. Select settings to start.";
    this.statusCacheText = "";
    this.metricLoadTime = "-";
    this.liveTokensPerSec = 0; // Reactive rate for vintage VU-meter needle

    // Cache & Downloading
    this.cachedModels = new Map();         // filename -> size
    this.downloadProgresses = new Map();   // filename -> percentage
    this.downloadSpeeds = new Map();       // filename -> speedText
    this.downloadAbortController = null;
    this.isDownloadAborted = false;
    this.isCancelled = false;

    // Conversation History
    this.activeSavedConvId = null;
    this.conversationsList = [];
    this.messages = [];                    // Array of { role, text, thoughtText, senderName, prefillSpeed, decodeSpeed, tokensCount }
    this.pendingHistory = null;
    this.isHydratingHistory = false;

    // Speech synthesis & recognition
    this.isSpeaking = false;
    this.isListening = false;
    this.enableVoiceResponse = true;
    this.speechQueue = new SpeechQueue(this);
    this.recognition = null;
    this.isSpeechMutedForCurrentResponse = false;

    // LiteRT-LM Wasm / Engine Instances
    this.engine = null;
    this.activeConversation = null;
    this.sharedTokenizer = null;
    this.activeReader = null;

    // LocalStorage Keys
    this.SETTINGS_KEY = "litertlm-chat-settings";
    this.CONVS_LIST_KEY = "litertlm-conversations-list";
    this.ACTIVE_CONV_KEY = "litertlm-active-conv-id";

    if (host) {
      this.addHost(host);
    }
    
    // Auto-setup settings if running in browser
    if (typeof window !== 'undefined' && window.localStorage) {
      this.loadSettings();
      this.loadSavedConversationsIndex();
      this.updateCacheSize();
      this.startNewConversation();
    }
  }

  addHost(host) {
    if (host && !this.hosts.includes(host)) {
      this.hosts.push(host);
      if (typeof host.addController === 'function') {
        host.addController(this);
      }
    }
  }

  requestUpdate() {
    for (const host of this.hosts) {
      try {
        if (typeof host.requestUpdate === 'function') {
          host.requestUpdate();
        }
      } catch (err) {
        console.error("[LiteRT-LM] Host update failed:", err);
      }
    }
  }

  hostConnected() {
    this.loadSettings();
    this.loadSavedConversationsIndex();
    this.updateCacheSize();
    this.startNewConversation();
  }

  hostDisconnected() {
    this.cleanup();
  }

  cleanup() {
    if (this.activeConversation) {
      try { this.activeConversation.delete(); } catch (_) {}
      this.activeConversation = null;
    }
    this.engine = null;
  }

  loadSettings() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const data = window.localStorage.getItem(this.SETTINGS_KEY);
      if (data) {
        const settings = JSON.parse(data);
        this.selectedModelPath = settings.selectedModelPath ?? this.selectedModelPath;
        this.contextLength = settings.contextLength ?? this.contextLength;
        this.maxOutputTokens = settings.maxOutputTokens ?? this.maxOutputTokens;
        this.samplerType = settings.samplerType ?? this.samplerType;
        this.temperature = settings.temperature ?? this.temperature;
        this.topP = settings.topP ?? this.topP;
        this.topK = settings.topK ?? this.topK;
        this.enableThinking = settings.enableThinking ?? this.enableThinking;
        this.chatLanguage = settings.chatLanguage ?? this.chatLanguage;
      }
    } catch (err) {
      console.error("[LiteRT-LM] Failed to load settings:", err);
    }
  }

  saveSettings() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const settings = {
        selectedModelPath: this.selectedModelPath,
        contextLength: this.contextLength,
        maxOutputTokens: this.maxOutputTokens,
        samplerType: this.samplerType,
        temperature: this.temperature,
        topP: this.topP,
        topK: this.topK,
        enableThinking: this.enableThinking,
        chatLanguage: this.chatLanguage
      };
      window.localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      console.error("[LiteRT-LM] Failed to save settings:", err);
    }
  }

  handleResetSettings() {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm("Are you sure you want to reset all inference settings to their defaults?")) {
      return;
    }
    this.contextLength = 4096;
    this.maxOutputTokens = 2048;
    this.samplerType = "greedy";
    this.temperature = 1.0;
    this.topP = 0.95;
    this.topK = 64;
    this.enableThinking = true;
    this.chatLanguage = "English";
    this.saveSettings();
    this.requestUpdate();
    this.statusText = "Inference configurations reset to system defaults.";
  }

  loadSavedConversationsIndex() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const data = window.localStorage.getItem(this.CONVS_LIST_KEY);
      this.conversationsList = data ? JSON.parse(data) : [];
    } catch (err) {
      console.error("[LiteRT-LM] Failed to load conversations index:", err);
      this.conversationsList = [];
    }
  }

  saveSavedConversationsIndex() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(this.CONVS_LIST_KEY, JSON.stringify(this.conversationsList));
    } catch (err) {
      console.error("[LiteRT-LM] Failed to save conversations index:", err);
    }
  }

  startNewConversation() {
    if (this.isGenerating) return;
    this.activeSavedConvId = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(this.ACTIVE_CONV_KEY);
    }
    this.pendingHistory = null;
    this.messages = [];
    this.statusText = "Ready for a new conversation.";
    this.requestUpdate();
  }

  async selectConversation(id) {
    if (this.isGenerating) return;
    this.activeSavedConvId = id;
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(this.ACTIVE_CONV_KEY, id);
    const key = `litertlm-chat-history-${id}`;
    
    try {
      const historyStr = window.localStorage.getItem(key);
      if (!historyStr) return;
      const savedMessages = JSON.parse(historyStr);
      this.isHydratingHistory = true;
      this.messages = [];
      const historyArr = [];
      
      for (const msg of savedMessages) {
        this.messages.push(msg);
        historyArr.push({ role: msg.role, content: msg.text });
      }
      this.pendingHistory = historyArr;
      this.isHydratingHistory = false;
      this.statusText = "Restored conversation from history.";
      
      const details = this.conversationsList.find(c => c.id === id);
      if (details) {
        this.selectedModelPath = details.modelPath;
        this.saveSettings();
      }
      this.requestUpdate();
    } catch (err) {
      this.isHydratingHistory = false;
      console.error("[LiteRT-LM] Failed to load conversation history:", err);
    }
  }

  deleteConversation(id) {
    if (this.isGenerating) return;
    this.conversationsList = this.conversationsList.filter(c => c.id !== id);
    this.saveSavedConversationsIndex();
    
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(`litertlm-chat-history-${id}`);
    }
    
    if (this.activeSavedConvId === id) {
      this.startNewConversation();
    } else {
      this.requestUpdate();
    }
  }

  renameConversation(id, newTitle) {
    if (!newTitle || !newTitle.trim()) return;
    const conversation = this.conversationsList.find(c => c.id === id);
    if (conversation) {
      conversation.title = newTitle.trim();
      this.saveSavedConversationsIndex();
      this.requestUpdate();
    }
  }


  commitActiveChatHistory() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    
    if (!this.activeSavedConvId) {
      const convId = Date.now().toString();
      const firstMsgText = this.messages[0]?.text || "Untitled Conversation";
      const title = firstMsgText.length > 26 ? firstMsgText.substring(0, 26) + "..." : firstMsgText;
      
      this.activeSavedConvId = convId;
      window.localStorage.setItem(this.ACTIVE_CONV_KEY, convId);
      this.conversationsList.unshift({
        id: convId,
        title: title,
        createdAt: Date.now(),
        modelPath: this.selectedModelPath
      });
      this.saveSavedConversationsIndex();
    }
    
    const key = `litertlm-chat-history-${this.activeSavedConvId}`;
    window.localStorage.setItem(key, JSON.stringify(this.messages));
    this.requestUpdate();
  }

  rewindConversation(index) {
    if (this.isGenerating) return;
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm("Are you sure you want to edit this message and discard all subsequent turns?")) {
      return;
    }
    
    try {
      this.statusText = "Rewinding conversation...";
      this.requestUpdate();
      this.messages = this.messages.slice(0, index);
      
      const historyArr = [];
      for (const msg of this.messages) {
        historyArr.push({ role: msg.role, content: msg.text });
      }
      this.pendingHistory = historyArr;
      
      // If conversation is already built, re-initialize later when generating
      if (this.activeConversation) {
        try { this.activeConversation.delete(); } catch (_) {}
        this.activeConversation = null;
      }
      
      this.saveSavedConversationsIndex();
      this.commitActiveChatHistory();
      this.statusText = "Conversation rewound.";
    } catch (err) {
      console.error("[LiteRT-LM] Failed to rewind conversation:", err);
      this.statusText = "Rewind failed.";
      this.requestUpdate();
    }
  }

  async redoResponse(index) {
    if (this.isGenerating) return;
    
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm("Are you sure you want to retry this response?")) {
      return;
    }
    
    try {
      const promptText = this.messages[index - 1]?.text || "";
      if (!promptText) return;
      
      this.statusText = "Retrying response...";
      this.requestUpdate();
      this.messages = this.messages.slice(0, index - 1);
      
      const historyArr = [];
      for (const msg of this.messages) {
        historyArr.push({ role: msg.role, content: msg.text });
      }
      this.pendingHistory = historyArr;
      
      if (this.activeConversation) {
        try { this.activeConversation.delete(); } catch (_) {}
        this.activeConversation = null;
      }
      
      this.isGenerating = false;
      this.sendMessage(promptText);
    } catch (err) {
      console.error("[LiteRT-LM] Failed to retry response:", err);
      this.statusText = "Retry failed.";
      this.requestUpdate();
    }
  }

  async updateCacheSize() {
    if (typeof window === 'undefined' || !window.caches) return;
    try {
      const cache = await window.caches.open("litertlm-models");
      const keys = await cache.keys();
      this.cachedModels.clear();
      
      for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
          const length = parseInt(response.headers.get("content-length") || "0", 10);
          const filename = request.url.split("/").pop();
          this.cachedModels.set(filename, length);
        }
      }
      this.requestUpdate();
    } catch (err) {
      console.error("[LiteRT-LM] Failed to update cache size:", err);
    }
  }

  async deleteModelFromCache(path) {
    if (typeof window === 'undefined' || !window.caches) return;
    try {
      const cache = await window.caches.open("litertlm-models");
      await cache.delete(path);
      this.addLog(`Removed from cache: ${path.split("/").pop()}`);
      await this.updateCacheSize();
    } catch (err) {
      console.error("[LiteRT-LM] Failed to remove cached model:", err);
    }
  }

  async clearAllCache() {
    if (typeof window === 'undefined' || !window.caches) return;
    try {
      await window.caches.delete("litertlm-models");
      this.addLog("Cleared all model cache.");
      await this.updateCacheSize();
    } catch (err) {
      console.error("[LiteRT-LM] Failed to clear model cache:", err);
    }
  }

  makeProgressStream(stream, onProgress) {
    const reader = stream.getReader();
    return new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
            onProgress(value.length);
            controller.enqueue(value);
          }
        } catch (err) {
          controller.error(err);
        }
      },
      cancel() {
        reader.cancel();
      }
    });
  }

  getSamplerTypeEnum(type, litertlm) {
    const st = litertlm?.SamplerType || { TOP_K: 1, TOP_P: 2, GREEDY: 0 };
    return type === "top_k" ? st.TOP_K : (type === "top_p" ? st.TOP_P : st.GREEDY);
  }

  getSamplerParams(litertlm) {
    const type = this.getSamplerTypeEnum(this.samplerType, litertlm);
    const params = {
      type,
      temperature: this.temperature
    };
    
    if (this.samplerType === "greedy") {
      params.k = 1;
      params.p = 1.0;
      params.temperature = 0.0;
    } else if (this.samplerType === "top_p") {
      params.p = this.topP;
      params.k = this.topK;
    } else if (this.samplerType === "top_k") {
      params.k = this.topK;
      params.p = 1.0;
    }
    
    return params;
  }

  async loadModelWeights() {
    if (this.isModelLoading || typeof window === 'undefined') return;
    
    const pathUrl = this.selectedModelPath;
    const filename = pathUrl.split("/").pop() || pathUrl;
    
    this.isModelLoading = true;
    this.isDownloadAborted = false;
    this.statusCacheText = "";
    this.statusText = "Preparing runtime & model...";
    this.requestUpdate();
    
    const startTime = performance.now();
    
    try {
      // Import CDN package dynamically
      const litertlm = await this.importCore();
      
      if (!this.isWasmLoaded) {
        this.statusText = "Loading LiteRT WASM runtime...";
        this.requestUpdate();
        // Load WASM from CDN using loadLiteRtLm if available, fallback to loadWasmModule
        if (typeof litertlm.loadLiteRtLm === 'function') {
          const wasmPath = litertlm.LiteRtLm ? litertlm.LiteRtLm.DEFAULT_WASM_PATH : (litertlm.DEFAULT_WASM_PATH || "");
          await litertlm.loadLiteRtLm(wasmPath);
        } else if (typeof litertlm.loadWasmModule === 'function') {
          await litertlm.loadWasmModule(litertlm.DEFAULT_WASM_PATH);
        }
        this.isWasmLoaded = true;
      }
      
      // Setup engine if null
      this.cleanup();
      
      const cache = await window.caches.open("litertlm-models");
      const cachedResponse = await cache.match(pathUrl);
      let progressStream;
      
      this.downloadProgresses.set(filename, 0);
      this.downloadSpeeds.set(filename, "0 MB / 0 MB");
      this.requestUpdate();
      
      if (cachedResponse) {
        this.statusText = `Loading cached weights (${filename})...`;
        this.requestUpdate();
        const totalSize = parseInt(cachedResponse.headers.get("content-length") || "0", 10);
        let loaded = 0;
        
        progressStream = this.makeProgressStream(cachedResponse.body, (chunkLength) => {
          loaded += chunkLength;
          const percentage = totalSize > 0 ? (loaded / totalSize) * 100 : 0;
          this.downloadProgresses.set(filename, Math.round(percentage));
          this.downloadSpeeds.set(filename, `${(loaded / 1e6).toFixed(1)} MB / ${(totalSize / 1e6).toFixed(1)} MB`);
          this.requestUpdate();
        });
      } else {
        this.statusText = `Downloading weights (${filename})...`;
        this.requestUpdate();
        this.downloadAbortController = new AbortController();
        
        const response = await fetch(pathUrl, { signal: this.downloadAbortController.signal });
        if (!response.ok) throw new Error(`Failed to fetch model: ${response.statusText}`);
        
        const totalSize = parseInt(response.headers.get("content-length") || "0", 10);
        let downloaded = 0;
        let lastTime = performance.now();
        let lastDownloaded = 0;
        let speedStr = "0.0 MB/s";
        
        const stream = this.makeProgressStream(response.body, (chunkLength) => {
          downloaded += chunkLength;
          const now = performance.now();
          if (now - lastTime > 400) {
            const bytesPerSec = ((downloaded - lastDownloaded) / (now - lastTime)) * 1000;
            speedStr = `${(bytesPerSec / 1e6).toFixed(1)} MB/s`;
            lastTime = now;
            lastDownloaded = downloaded;
          }
          
          if (totalSize > 0) {
            const percentage = Math.min(100, Math.round((downloaded / totalSize) * 100));
            this.downloadProgresses.set(filename, percentage);
            this.downloadSpeeds.set(filename, `${(downloaded / 1e6).toFixed(1)} / ${(totalSize / 1e6).toFixed(1)} MB (${speedStr})`);
          } else {
            // Indeterminate size - show downloaded MB and animated state
            this.downloadProgresses.set(filename, -1);
            this.downloadSpeeds.set(filename, `${(downloaded / 1e6).toFixed(1)} MB downloaded (${speedStr})`);
          }
          this.requestUpdate();
        });
        
        // Tee the stream so one goes to local cache and the other goes to model runner compiler
        const [runnerStream, cacheStream] = stream.tee();
        const cachedRes = new Response(cacheStream, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": totalSize.toString()
          }
        });
        
        cache.put(pathUrl, cachedRes).then(() => {
          this.updateCacheSize();
        }).catch(err => {
          if (this.isDownloadAborted) return;
          console.error("[LiteRT-LM] Cache failed:", err);
          this.statusCacheText = "⚠ Cache Failed: Disk quota exceeded. (Running from memory)";
          this.requestUpdate();
        });
        
        progressStream = runnerStream;
      }
      
      this.statusText = `Compiling Model (${filename})...`;
      this.requestUpdate();
      
      // Instantiate LLM Engine
      if (typeof litertlm.Engine.create === 'function') {
        this.engine = await litertlm.Engine.create({
          model: progressStream
        });
      } else {
        this.engine = await litertlm.Engine.createEngine({
          model: progressStream,
          wasmPath: litertlm.DEFAULT_WASM_PATH
        });
      }
      
      const loadEndTime = performance.now();
      this.metricLoadTime = `${((loadEndTime - startTime) / 1000).toFixed(2)}s`;
      
      this.statusText = "Creating conversation session...";
      this.requestUpdate();
      
      this.activeConversation = await this.engine.createConversation({
        sessionConfig: {
          maxOutputTokens: this.maxOutputTokens,
          samplerParams: this.getSamplerParams(litertlm)
        },
        preface: {
          extra_context: {
            enable_thinking: this.enableThinking
          }
        }
      });
      
      // Load tokenizer if supported
      if (typeof this.engine.getTokenizer === 'function') {
        this.sharedTokenizer = await this.engine.getTokenizer();
      } else {
        this.sharedTokenizer = null;
      }
      
      // Prefill history if pending
      if (this.pendingHistory && this.pendingHistory.length > 0) {
        this.statusText = "Prefilling conversation KV cache...";
        this.requestUpdate();
        await this.activeConversation.sendMessageStreaming(this.pendingHistory);
        this.pendingHistory = null;
      }
      
      this.statusText = "Model loaded and ready.";
      this.isModelLoading = false;
      this.downloadProgresses.delete(filename);
      this.downloadSpeeds.delete(filename);
      this.requestUpdate();
    } catch (err) {
      console.error("[LiteRT-LM] Load weights failed:", err);
      this.isModelLoading = false;
      this.statusText = `Failed to load model: ${err.message || err}`;
      this.downloadProgresses.delete(filename);
      this.downloadSpeeds.delete(filename);
      this.requestUpdate();
    }
  }

  cancelDownload() {
    if (this.downloadAbortController) {
      this.isDownloadAborted = true;
      this.downloadAbortController.abort();
      this.isModelLoading = false;
      this.statusText = "Download cancelled by user.";
      this.requestUpdate();
    }
  }

  async loadModelFromFile(file) {
    if (this.isModelLoading || typeof window === 'undefined' || !file) return;

    const filename = file.name;
    this.isModelLoading = true;
    this.isDownloadAborted = false;
    this.statusCacheText = "";
    this.statusText = `Preparing local model file (${filename})...`;
    this.requestUpdate();

    const startTime = performance.now();

    try {
      const litertlm = await this.importCore();

      if (!this.isWasmLoaded) {
        this.statusText = "Loading LiteRT WASM runtime...";
        this.requestUpdate();
        if (typeof litertlm.loadLiteRtLm === 'function') {
          const wasmPath = litertlm.LiteRtLm ? litertlm.LiteRtLm.DEFAULT_WASM_PATH : (litertlm.DEFAULT_WASM_PATH || "");
          await litertlm.loadLiteRtLm(wasmPath);
        } else if (typeof litertlm.loadWasmModule === 'function') {
          await litertlm.loadWasmModule(litertlm.DEFAULT_WASM_PATH);
        }
        this.isWasmLoaded = true;
      }

      this.cleanup();
      this.statusText = `Reading local file (${filename})...`;
      this.requestUpdate();

      const totalSize = file.size || 0;
      let loaded = 0;
      const fileStream = typeof file.stream === 'function' ? file.stream() : new Response(file).body;

      const progressStream = this.makeProgressStream(fileStream, (chunkLength) => {
        loaded += chunkLength;
        const percentage = totalSize > 0 ? (loaded / totalSize) * 100 : 0;
        this.downloadProgresses.set(filename, Math.round(percentage));
        this.downloadSpeeds.set(filename, `${(loaded / 1e6).toFixed(1)} MB / ${(totalSize / 1e6).toFixed(1)} MB`);
        this.requestUpdate();
      });

      this.statusText = `Compiling Model (${filename})...`;
      this.requestUpdate();

      if (typeof litertlm.Engine.create === 'function') {
        this.engine = await litertlm.Engine.create({ model: progressStream });
      } else {
        this.engine = await litertlm.Engine.createEngine({ model: progressStream, wasmPath: litertlm.DEFAULT_WASM_PATH });
      }

      const loadEndTime = performance.now();
      this.metricLoadTime = `${((loadEndTime - startTime) / 1000).toFixed(2)}s`;

      this.statusText = "Creating conversation session...";
      this.requestUpdate();

      this.activeConversation = await this.engine.createConversation({
        sessionConfig: {
          maxOutputTokens: this.maxOutputTokens,
          samplerParams: this.getSamplerParams(litertlm)
        },
        preface: {
          extra_context: {
            enable_thinking: this.enableThinking
          }
        }
      });

      if (typeof this.engine.getTokenizer === 'function') {
        this.sharedTokenizer = await this.engine.getTokenizer();
      }

      this.statusText = `Model loaded from local file (${filename}). Ready.`;
      this.isModelLoading = false;
      this.downloadProgresses.delete(filename);
      this.downloadSpeeds.delete(filename);
      this.requestUpdate();
    } catch (err) {
      console.error("[LiteRT-LM] Local load failed:", err);
      this.isModelLoading = false;
      this.statusText = `Failed to load local file: ${err.message || err}`;
      this.downloadProgresses.delete(filename);
      this.downloadSpeeds.delete(filename);
      this.requestUpdate();
    }
  }

  async sendMessage(prompt) {
    if (this.isGenerating || !prompt || !prompt.trim() || typeof window === 'undefined') return;
    
    const cleanPrompt = prompt.trim();
    this.isGenerating = true;
    this.isCancelled = false;
    this.isSpeechMutedForCurrentResponse = false;
    this.statusText = "Thinking...";
    this.speechQueue.stop();
    
    let tokensCountStr = "-";
    if (this.sharedTokenizer) {
      try {
        tokensCountStr = this.sharedTokenizer.encode(cleanPrompt).length.toString();
      } catch (_) {}
    } else {
      tokensCountStr = Math.round(cleanPrompt.split(/\s+/).filter(Boolean).length * 1.3).toString();
    }
    
    // 1. Immediately push user message so it is instantly rendered on screen
    const userMsg = {
      role: "user",
      text: cleanPrompt,
      senderName: "User",
      tokensCount: tokensCountStr
    };
    this.messages.push(userMsg);
    this.commitActiveChatHistory();
    
    // 2. Immediately push assistant placeholder card
    const botMsg = {
      role: "assistant",
      text: "",
      senderName: this.selectedModelPath.split("/").pop() || "Assistant",
      thoughtText: ""
    };
    this.messages.push(botMsg);
    this.requestUpdate();
    
    const botIndex = this.messages.length - 1;
    
    // 3. Auto-load weights if engine doesn't exist
    if (!this.engine || !this.activeConversation) {
      this.statusText = "Loading model weights & compiling shaders...";
      this.messages[botIndex].text = "*[Compiling WebGPU shaders & loading model weights...]*";
      this.requestUpdate();

      try {
        await this.loadModelWeights();
      } catch (loadErr) {
        console.error("[LiteRT-LM] Auto-load weights error:", loadErr);
      }

      if (!this.engine || !this.activeConversation) {
        this.messages[botIndex].text = `*[Model initialization failed: ${this.statusText || 'Engine not ready'}]*`;
        this.isGenerating = false;
        this.commitActiveChatHistory();
        this.requestUpdate();
        return;
      }

      // Clear the temporary compilation message once engine is ready
      this.messages[botIndex].text = "";
      this.requestUpdate();
    }
    
    let accumulatedText = "";
    let accumulatedThought = "";
    let isFirstToken = true;
    const startInferenceTime = performance.now();
    let firstTokenTime = 0;
    let tokensCounter = 0;
    
    let sentenceBuffer = "";
    
    try {
      // Check LiteRTConfig for RAG feature
      const isRagActive = typeof window !== 'undefined' && window.LiteRTConfig ? window.LiteRTConfig.get('rag') : true;
      let finalPrompt = isRagActive && window.getRagPrompt ? window.getRagPrompt(cleanPrompt) : cleanPrompt;
      
      // Inject language constraint instruction
      finalPrompt += `\n\n[Instruction: Respond ONLY in ${this.chatLanguage}.]`;
      
      const stream = (await this.activeConversation.sendMessageStreaming(finalPrompt));
      const reader = stream.getReader();
      this.activeReader = reader;
      
      while (true) {
        if (this.isCancelled) {
          console.log("[LiteRT-LM] Stream loop cancelled.");
          break;
        }
        
        const { done, value } = await reader.read();
        if (done) break;
        
        if (value) {
          // Check for thought/CoT channel tokens
          if (value.channels && typeof value.channels.thought === 'string') {
            accumulatedThought += value.channels.thought;
            this.messages[botIndex] = {
              ...this.messages[botIndex],
              thoughtText: accumulatedThought
            };
          }
          
          // Check for standard generation content across multiple shape variations
          let contentText = "";
          if (typeof value === "string") {
            contentText = value;
          } else if (typeof value.content === "string") {
            contentText = value.content;
          } else if (Array.isArray(value.content)) {
            for (const item of value.content) {
              if (typeof item === "string") contentText += item;
              else if (item && typeof item.text === "string") contentText += item.text;
            }
          } else if (typeof value.text === "string") {
            contentText = value.text;
          }
          
          if (contentText) {
            accumulatedText += contentText;
            this.messages[botIndex] = {
              ...this.messages[botIndex],
              text: accumulatedText
            };
            
            sentenceBuffer = this._extractAndQueueSentences(sentenceBuffer + contentText, false);
          }
        }
        
        if (isFirstToken && (accumulatedThought.length > 0 || accumulatedText.length > 0)) {
          firstTokenTime = performance.now();
          isFirstToken = false;
        }
        tokensCounter++;
        const currentElapsedSec = (performance.now() - (firstTokenTime || startInferenceTime)) / 1000;
        if (currentElapsedSec > 0.15) {
          this.liveTokensPerSec = Math.round(tokensCounter / currentElapsedSec);
        }
        this.requestUpdate();
      }
      
      this.liveTokensPerSec = 0;
      this._extractAndQueueSentences(sentenceBuffer, true);
      
      const endInferenceTime = performance.now();
      const totalTimeSec = (endInferenceTime - startInferenceTime) / 1000;
      const prefillTimeSec = (firstTokenTime - startInferenceTime) / 1000;
      const decodeTimeSec = (endInferenceTime - firstTokenTime) / 1000;
      
      const prefillSpeed = prefillTimeSec > 0 ? (tokensCounter / prefillTimeSec).toFixed(1) : "0.0";
      const decodeSpeed = decodeTimeSec > 0 ? (tokensCounter / decodeTimeSec).toFixed(1) : "0.0";
      
      this.messages[botIndex] = {
        ...this.messages[botIndex],
        prefillSpeed: `${prefillSpeed} tk/s`,
        decodeSpeed: `${decodeSpeed} tk/s`,
        tokensCount: tokensCounter.toString()
      };
      this.statusText = "Generation completed.";
    } catch (err) {
      console.error(err);
      this.statusText = `Generation failed: ${err.message || err}`;
      if (this.isCancelled) {
        accumulatedText += "\n\n*[Generation stopped by user]*";
        this.messages[botIndex] = {
          ...this.messages[botIndex],
          text: accumulatedText
        };
      }
    } finally {
      this.isGenerating = false;
      if (this.isCancelled) {
        try {
          if (this.activeConversation) {
            try { this.activeConversation.delete(); } catch (_) {}
            this.activeConversation = null;
          }
          
          const litertlm = await this.importCore();
          this.activeConversation = await this.engine.createConversation({
            sessionConfig: {
              maxOutputTokens: this.maxOutputTokens,
              samplerParams: this.getSamplerParams(litertlm)
            },
            preface: {
              extra_context: {
                enable_thinking: this.enableThinking
              }
            }
          });
        } catch (err) {
          console.error("[LiteRT-LM] Failed to rebuild conversation session:", err);
        }
      }
      this.commitActiveChatHistory();
    }
  }

  stopGeneration() {
    this.speechQueue.stop();
    if (this.isGenerating && this.activeConversation) {
      this.isCancelled = true;
      try {
        if (this.activeReader) {
          this.activeReader.cancel();
        }
      } catch (_) {}
      this.activeConversation.cancelProcess();
    }
  }

  stopSpeechOnly() {
    this.speechQueue.stop();
    this.isSpeechMutedForCurrentResponse = true;
    this.requestUpdate();
  }

  _extractAndQueueSentences(buffer, isFinal = false) {
    const isTtsAllowed = typeof window !== 'undefined' && window.LiteRTConfig ? window.LiteRTConfig.get('voiceTts') : true;
    if (!this.enableVoiceResponse || !isTtsAllowed || this.isSpeechMutedForCurrentResponse) {
      return isFinal ? "" : buffer;
    }
    let boundaryRegex = /[.!?](\s+|\n|$)/g;
    let match;
    let lastIndex = 0;
    while ((match = boundaryRegex.exec(buffer)) !== null) {
      const sentenceEnd = match.index + 1;
      const sentence = buffer.slice(lastIndex, sentenceEnd).trim();
      if (sentence.length > 0) {
        this.speechQueue.add(sentence);
      }
      lastIndex = boundaryRegex.lastIndex;
    }
    if (isFinal) {
      const remaining = buffer.slice(lastIndex).trim();
      if (remaining.length > 0) {
        this.speechQueue.add(remaining);
      }
      return "";
    }
    return lastIndex > 0 ? buffer.slice(lastIndex) : buffer;
  }

  getChatInputElement() {
    if (typeof document === 'undefined') return null;
    return document.getElementById("chat-input-textarea") ||
           document.getElementById("terminal-prompt-input") ||
           document.querySelector(".typewriter-textarea") ||
           document.querySelector("textarea");
  }

  initSpeechRecognition() {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[LiteRT-LM] SpeechRecognition is not supported in this browser.");
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = LANGUAGE_CODES[this.chatLanguage] || 'en-US';

    rec.onstart = () => {
      this.isListening = true;
      this.statusText = "Listening... Speak into your microphone.";
      this.requestUpdate();
    };

    rec.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = 0; i < event.results.length; ++i) {
        const item = event.results[i];
        const isFinal = Boolean(item.isFinal || (item[0] && item[0].isFinal));
        const transcriptText = item[0] ? item[0].transcript : '';
        if (isFinal) {
          finalTranscript += transcriptText;
        } else {
          interimTranscript += transcriptText;
        }
      }
      const textarea = this.getChatInputElement();
      if (textarea) {
        textarea.value = (this._transcriptPrefix || '') + finalTranscript + interimTranscript;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    rec.onerror = (e) => {
      console.error("[LiteRT-LM] Speech recognition error:", e);
      this.isListening = false;
      this._hadRecognitionError = true;
      const errCode = e.error || 'unknown';
      this.statusText = `Voice input failed: ${errCode}`;
      this.requestUpdate();
    };

    rec.onend = () => {
      this.isListening = false;
      this.requestUpdate();
      
      if (this._hadRecognitionError) {
        this._hadRecognitionError = false;
        return;
      }

      const textarea = this.getChatInputElement();
      if (textarea && textarea.value.trim().length > 0) {
        const text = textarea.value.trim();
        textarea.value = "";
        this.sendMessage(text);
      }
    };

    this.recognition = rec;
  }

  toggleListening() {
    if (!this.recognition) {
      this.initSpeechRecognition();
    }
    if (!this.recognition) {
      this.statusText = "Speech recognition is not supported in this browser.";
      this.requestUpdate();
      return;
    }

    if (this.isListening) {
      try {
        this.recognition.stop();
      } catch (err) {
        console.warn("[LiteRT-LM] Failed to stop recognition:", err);
      }
      this.isListening = false;
      this.requestUpdate();
    } else {
      this._hadRecognitionError = false;
      const textarea = this.getChatInputElement();
      if (textarea && textarea.value.trim().length > 0) {
        this._transcriptPrefix = textarea.value.trim() + " ";
      } else {
        this._transcriptPrefix = "";
      }

      this.recognition.lang = LANGUAGE_CODES[this.chatLanguage] || 'en-US';
      this.speechQueue.stop();
      try {
        this.recognition.start();
        this.isListening = true;
        this.statusText = "Listening... Speak into your microphone.";
        this.requestUpdate();
      } catch (err) {
        if (err.name === 'InvalidStateError') {
          this.isListening = true;
          this.requestUpdate();
        } else {
          console.error("[LiteRT-LM] Failed to start recognition:", err);
          this.statusText = `Voice input failed: ${err.message || err}`;
          this.isListening = false;
          this.requestUpdate();
        }
      }
    }
  }

  async importCore() {
    return await import('https://cdn.jsdelivr.net/npm/@litert-lm/core@0.13.1/+esm');
  }

  addLog(message) {
    if (window.ragIndex) {
      window.ragIndex.addLog(message);
    } else {
      console.log(message);
    }
  }
}
