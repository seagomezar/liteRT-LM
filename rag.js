/**
 * LiteRT-LM Local RAG System Entrypoint
 * Bridges to the modular, persistent RAG engine in src/rag.js.
 */
import { LocalRAGIndex, ragIndex, tokenize } from './src/rag.js';

export { LocalRAGIndex, ragIndex, tokenize };

// Maintain global attachment for non-module consumers
if (typeof window !== 'undefined') {
  window.LocalRAGIndex = LocalRAGIndex;
  window.ragIndex = ragIndex;
  window.getRagPrompt = (q) => ragIndex.getRagPrompt(q);
}
