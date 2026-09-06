/**
 * LiteRT-LM Application Configuration Script
 * Allows users to enable/disable functionalities and customize features.
 * Persists preferences in localStorage and provides reactive event listeners for UI components.
 */

export const DEFAULT_FEATURES = {
  avatar: true,          // Procedural 2D animated cathode robot avatar
  rag: true,             // Document RAG knowledge hub and context injection
  voiceTts: true,        // Speech synthesis voice playback
  voiceStt: true,        // Speech recognition microphone input
  codePreview: true,     // Fullscreen HTML/CSS/JS sandbox preview iframe
  modelCache: true,      // CacheStorage offline model manager and metrics
  thinkingToggle: true,  // Deep reasoning thinking process toggle & visibility
  advancedTuner: true,   // Precision rotary/fader sliders for temperature, top-k, top-p, context
  learnMoreDrawer: true  // Architectural guide and documentation drawer
};

export const FEATURE_METADATA = {
  avatar: {
    label: "Cathode Robot Avatar",
    description: "Procedural 2D animated avatar with real-time idle breathing and speech flapping",
    category: "Interface"
  },
  rag: {
    label: "Document RAG Hub",
    description: "In-memory local TF-IDF document indexing and contextual prompt augmentation",
    category: "Intelligence"
  },
  voiceTts: {
    label: "Voice Synthesis (TTS)",
    description: "Sentence-by-sentence local speech synthesis using browser audio voices",
    category: "Audio"
  },
  voiceStt: {
    label: "Speech Recognition (STT)",
    description: "Microphone dictation input with live continuous speech-to-text",
    category: "Audio"
  },
  codePreview: {
    label: "Live Code Sandbox Preview",
    description: "Interactive sandboxed iframe runner for generated HTML, CSS, and JavaScript",
    category: "Developer"
  },
  modelCache: {
    label: "Model Storage Cache",
    description: "Offline model weight caching in browser CacheStorage with purge controls",
    category: "System"
  },
  thinkingToggle: {
    label: "Deep Thinking Mode",
    description: "Chain-of-thought reasoning stream capture and collapsible thinking card",
    category: "Intelligence"
  },
  advancedTuner: {
    label: "Precision Parameter Tuners",
    description: "Hardware faders for Temperature, Top-K, Top-P, and Context Length limits",
    category: "System"
  },
  learnMoreDrawer: {
    label: "Documentation Drawer",
    description: "Collapsible laboratory reference manual and architecture documentation",
    category: "Interface"
  }
};

const STORAGE_KEY = "litertlm-feature-config";

export class FeatureConfigManager {
  constructor() {
    this.features = { ...DEFAULT_FEATURES };
    this.listeners = new Set();
    this.load();
  }

  load() {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          this.features = { ...DEFAULT_FEATURES, ...parsed };
        }
      } catch (err) {
        console.warn("[Config] Failed to read stored preferences:", err);
      }
    }
  }

  save() {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.features));
      } catch (err) {
        console.warn("[Config] Failed to save preferences:", err);
      }
    }
    this.notify();
  }

  get(featureName) {
    if (!(featureName in this.features)) {
      return false;
    }
    return Boolean(this.features[featureName]);
  }

  set(featureName, isEnabled) {
    if (featureName in DEFAULT_FEATURES) {
      this.features[featureName] = Boolean(isEnabled);
      this.save();
    }
  }

  toggle(featureName) {
    if (featureName in DEFAULT_FEATURES) {
      this.set(featureName, !this.get(featureName));
      return this.get(featureName);
    }
    return false;
  }

  setMultiple(preferences) {
    if (typeof preferences === "object" && preferences !== null) {
      for (const [key, val] of Object.entries(preferences)) {
        if (key in DEFAULT_FEATURES) {
          this.features[key] = Boolean(val);
        }
      }
      this.save();
    }
  }

  getAll() {
    return { ...this.features };
  }

  reset() {
    this.features = { ...DEFAULT_FEATURES };
    this.save();
  }

  subscribe(listener) {
    if (typeof listener === "function") {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    return () => {};
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.getAll());
      } catch (err) {
        console.error("[Config] Listener error:", err);
      }
    }
  }

  /**
   * Generates a reusable JavaScript snippet that users can run in console or config script
   */
  exportScript() {
    return `// LiteRT-LM Custom Configuration Script
if (window.LiteRTConfig) {
  window.LiteRTConfig.setMultiple(${JSON.stringify(this.features, null, 2)});
  console.log('[LiteRT-LM] Configuration profile successfully loaded.');
}`;
  }

  importConfig(jsonOrObj) {
    try {
      const data = typeof jsonOrObj === "string" ? JSON.parse(jsonOrObj) : jsonOrObj;
      this.setMultiple(data);
      return true;
    } catch (err) {
      console.error("[Config] Import failed:", err);
      return false;
    }
  }
}

export const LiteRTConfig = new FeatureConfigManager();

// Global exposure for scripts and console control
if (typeof window !== "undefined") {
  window.LiteRTConfig = LiteRTConfig;
}
