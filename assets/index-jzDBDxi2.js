/**
 * LiteRT-LM WebGPU Chat Application Entrypoint.
 * Boots the application by registering clean Lit UI components,
 * binding the Feature Config manager, RAG engine, and ChatStateManager globally.
 */
import { LiteRTConfig } from '../src/config.js';
import { ragIndex, LocalRAGIndex } from '../src/rag.js';
import { ChatStateManager } from '../src/state.js';

// Expose core singletons globally before components load & register
if (typeof window !== 'undefined') {
  window.LiteRTConfig = LiteRTConfig;
  window.ragIndex = ragIndex;
  window.LocalRAGIndex = LocalRAGIndex;
  window.ChatStateManager = ChatStateManager;
}

import '../src/components.js';

console.log('[LiteRT-LM] Analog Precision Terminal bootstrapped successfully via ES Modules.');
