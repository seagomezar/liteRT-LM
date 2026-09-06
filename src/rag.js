/**
 * Local RAG System for LiteRT-LM Chat
 * High-performance, fully in-browser Document Retrieval-Augmented Generation.
 * Features:
 * - Multilingual Unicode tokenization (supports accented Latin, Asian, and European alphabets)
 * - BM25 / Normalized TF-IDF relevance scoring
 * - LocalStorage persistence of indexed documents
 * - PDF, Markdown, TXT, CSV, and JSON parsing
 * - Detailed citation snippets and prompt augmentation
 */

import { LiteRTConfig } from './config.js';

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'cant', 'cannot',
  'could', 'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down', 'during', 'each', 'few',
  'for', 'from', 'further', 'had', 'hadnt', 'has', 'hasnt', 'have', 'havent', 'having', 'he', 'hed', 'hell', 'hes',
  'her', 'here', 'heres', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive',
  'if', 'in', 'into', 'is', 'isnt', 'it', 'its', 'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself',
  'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out',
  'over', 'own', 'same', 'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such',
  'than', 'that', 'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these',
  'they', 'theyd', 'theyll', 'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
  'very', 'was', 'wasnt', 'we', 'wed', 'well', 'were', 'weve', 'werent', 'what', 'whats', 'when', 'whens', 'where',
  'wheres', 'which', 'while', 'who', 'whos', 'whom', 'why', 'whys', 'with', 'wont', 'would', 'wouldnt', 'you',
  'youd', 'youll', 'youre', 'youve', 'your', 'yours', 'yourself', 'yourselves',
  // Multilingual common stopwords
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en', 'para', 'por', 'con', 'que', 'como', 'su',
  'le', 'les', 'des', 'du', 'et', 'dans', 'sur', 'pour', 'qui', 'avec', 'und', 'der', 'die', 'das', 'den', 'dem', 'mit'
]);

const RAG_STORAGE_KEY = "litertlm-rag-documents";

/**
 * Robust multilingual tokenizer using Unicode property escapes
 */
export function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

export class LocalRAGIndex {
  constructor(options = {}) {
    this.documents = new Map(); // filename -> { text, timestamp, size }
    this.chunks = [];           // list of { id, filename, text, tokens, length }
    this.idf = new Map();       // term -> IDF value
    this.avgChunkLength = 0;
    this.enabled = true;
    this.listeners = [];
    this.logs = [];
    this.autoPersist = options.autoPersist === true;

    // Sync with LiteRTConfig if available
    if (LiteRTConfig) {
      this.enabled = LiteRTConfig.get('rag');
      LiteRTConfig.subscribe((cfg) => {
        const shouldEnable = Boolean(cfg.rag);
        if (this.enabled !== shouldEnable) {
          this.enabled = shouldEnable;
          this.addLog(shouldEnable ? 'RAG Engine activated by configuration.' : 'RAG Engine deactivated by configuration.');
          this.notifyUpdate();
        }
      });
    }

    // Hydrate persisted documents from localStorage if autoPersist is true
    if (this.autoPersist) {
      this.loadFromStorage();
    }
  }

  enable() {
    this.enabled = true;
    if (LiteRTConfig) LiteRTConfig.set('rag', true);
    this.addLog('RAG System enabled.');
    this.notifyUpdate();
  }

  disable() {
    this.enabled = false;
    if (LiteRTConfig) LiteRTConfig.set('rag', false);
    this.addLog('RAG System disabled.');
    this.notifyUpdate();
  }

  addListener(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  notifyUpdate() {
    for (const callback of this.listeners) {
      try { callback(); } catch (err) { console.error("[RAG] Listener error:", err); }
    }
  }

  loadFromStorage() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = window.localStorage.getItem(RAG_STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw);
      if (Array.isArray(stored)) {
        this.documents.clear();
        this.chunks = [];
        for (const doc of stored) {
          if (doc.filename && doc.text) {
            this.indexDocumentInternal(doc.filename, doc.text, doc.timestamp || Date.now(), false);
          }
        }
        this.recalculateIDF();
        if (this.documents.size > 0) {
          this.addLog(`Restored ${this.documents.size} saved documents from local storage.`);
        }
      }
    } catch (err) {
      console.warn("[RAG] Could not restore documents from storage:", err);
    }
  }

  saveToStorage() {
    if (!this.autoPersist || typeof window === 'undefined' || !window.localStorage) return;
    try {
      const exportData = [];
      for (const [filename, meta] of this.documents.entries()) {
        exportData.push({
          filename,
          text: meta.text,
          timestamp: meta.timestamp || Date.now(),
          size: meta.size || meta.text.length
        });
      }
      window.localStorage.setItem(RAG_STORAGE_KEY, JSON.stringify(exportData));
    } catch (err) {
      console.warn("[RAG] Failed to persist documents to storage:", err);
    }
  }

  indexDocumentInternal(filename, text, timestamp = Date.now(), shouldSave = true) {
    // Sliding window text chunking: 400 chars with 100 char overlap
    const chunkSize = 400;
    const overlap = 100;
    let index = 0;
    const docChunks = [];

    while (index < text.length) {
      const chunkText = text.substring(index, index + chunkSize).trim();
      if (chunkText.length > 10) {
        const tokens = tokenize(chunkText);
        if (tokens.length > 0) {
          docChunks.push({
            id: `${filename}-${index}`,
            filename,
            text: chunkText,
            tokens,
            length: tokens.length
          });
        }
      }
      index += chunkSize - overlap;
      if (index >= text.length - overlap) break;
    }

    this.documents.set(filename, {
      text,
      timestamp,
      size: text.length,
      chunksCount: docChunks.length
    });

    // Replace chunks for this filename
    this.chunks = this.chunks.filter(c => c.filename !== filename).concat(docChunks);

    if (shouldSave) {
      this.recalculateIDF();
      this.saveToStorage();
    }
  }

  addDocument(filename, text) {
    if (!filename || !text) return;
    this.indexDocumentInternal(filename, text, Date.now(), true);
    const chunkCount = this.chunks.filter(c => c.filename === filename).length;
    this.addLog(`Indexed document: "${filename}" (${chunkCount} passages extracted)`);
    this.notifyUpdate();
  }

  removeDocument(filename) {
    if (!this.documents.has(filename)) return;
    this.documents.delete(filename);
    this.chunks = this.chunks.filter(c => c.filename !== filename);
    this.recalculateIDF();
    this.saveToStorage();
    this.addLog(`Expunged document: "${filename}"`);
    this.notifyUpdate();
  }

  clearAll() {
    this.documents.clear();
    this.chunks = [];
    this.idf.clear();
    this.avgChunkLength = 0;
    this.saveToStorage();
    this.addLog('All documents and passages cleared from knowledge base.');
    this.notifyUpdate();
  }

  recalculateIDF() {
    this.idf.clear();
    const N = this.chunks.length;
    if (N === 0) {
      this.avgChunkLength = 0;
      return;
    }

    let totalLength = 0;
    const df = {};

    for (const chunk of this.chunks) {
      totalLength += chunk.length;
      const uniqueTerms = new Set(chunk.tokens);
      for (const term of uniqueTerms) {
        df[term] = (df[term] || 0) + 1;
      }
    }

    this.avgChunkLength = totalLength / N;

    for (const term in df) {
      // Okapi BM25 style IDF formulation
      this.idf.set(term, Math.log(1 + (N - df[term] + 0.5) / (df[term] + 0.5)));
    }
  }

  /**
   * BM25-based similarity search
   * k1 = 1.2, b = 0.75
   */
  search(query, k = 3, minScore = 0.05) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || this.chunks.length === 0) return [];

    const k1 = 1.2;
    const b = 0.75;
    const avgLen = this.avgChunkLength || 1;

    const queryTF = {};
    for (const term of queryTokens) {
      queryTF[term] = (queryTF[term] || 0) + 1;
    }

    const results = [];
    for (const chunk of this.chunks) {
      let score = 0;
      const chunkTF = {};
      for (const term of chunk.tokens) {
        chunkTF[term] = (chunkTF[term] || 0) + 1;
      }

      for (const term in queryTF) {
        if (chunkTF[term]) {
          const tf = chunkTF[term];
          const idfVal = this.idf.get(term) || 0;
          const numerator = tf * (k1 + 1);
          const denominator = tf + k1 * (1 - b + b * (chunk.length / avgLen));
          score += idfVal * (numerator / denominator) * queryTF[term];
        }
      }

      if (score >= minScore) {
        results.push({ chunk, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  /**
   * Generates augmented prompt with context cards and source citations
   */
  getRagPrompt(query) {
    if (!this.enabled || this.documents.size === 0) {
      return query;
    }

    const matches = this.search(query, 3, 0.05);
    if (matches.length === 0) {
      this.addLog(`Prompt query: "${query.substring(0, 40)}..." -> No relevant passages found.`);
      return query;
    }

    const logInfo = matches
      .map(m => `[Score: ${m.score.toFixed(3)}] ${m.chunk.filename}: "${m.chunk.text.substring(0, 45)}..."`)
      .join('\n');
    this.addLog(`Knowledge Match for "${query.substring(0, 40)}...":\n${logInfo}`);
    this.notifyUpdate();

    const contextText = matches
      .map((m, i) => `[Source Document #${i + 1}: ${m.chunk.filename} (Confidence: ${(Math.min(1, m.score / 2) * 100).toFixed(0)}%)]\n${m.chunk.text}`)
      .join('\n\n---\n\n');

    return `Context from uploaded documents:
==================================================
${contextText}
==================================================

Based on the context above, answer the question below. If the information is not in the context, answer using your general knowledge but indicate it was not found in the documents.

Question: ${query}`;
  }

  addLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    this.logs.unshift(`[${timestamp}] ${message}`);
    if (this.logs.length > 20) this.logs.pop();
  }

  /**
   * Ingest a File object (PDF, TXT, MD, CSV, JSON)
   */
  async ingestFile(file) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      throw new Error(`File "${file.name}" exceeds 15MB limit.`);
    }

    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith('.pdf')) {
      this.addLog(`Parsing Microfilm PDF: "${file.name}"...`);
      const text = await this.extractPdfText(file);
      if (!text.trim()) {
        throw new Error(`No extractable text found in "${file.name}". It might be an image-only scan.`);
      }
      this.addDocument(file.name, text);
    } else {
      const text = await file.text();
      this.addDocument(file.name, text);
    }
  }

  async extractPdfText(file) {
    if (typeof window === 'undefined') {
      throw new Error("PDF extraction is only available in browser environments.");
    }
    const pdfjsLib = await this.loadPdfJS();
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText;
  }

  async loadPdfJS() {
    if (typeof window !== 'undefined' && window.pdfjsLib) {
      return window.pdfjsLib;
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
      script.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        } else {
          reject(new Error("pdfjsLib not found on window."));
        }
      };
      script.onerror = () => reject(new Error("Failed to load PDF.js from CDN."));
      document.head.appendChild(script);
    });
  }
}

export const ragIndex = new LocalRAGIndex({ autoPersist: true });

if (typeof window !== 'undefined') {
  window.ragIndex = ragIndex;
  window.getRagPrompt = (query) => ragIndex.getRagPrompt(query);
}
