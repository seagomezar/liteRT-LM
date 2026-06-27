// Local RAG System for LiteRT-LM Chat
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
  'youd', 'youll', 'youre', 'youve', 'your', 'yours', 'yourself', 'yourselves'
]);

export function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

export class LocalRAGIndex {
  constructor() {
    this.documents = new Map(); // filename -> fullText
    this.chunks = [];           // list of { id, filename, text, tokens }
    this.idf = new Map();       // term -> IDF value
    this.enabled = true;
    this.listeners = [];
    this.logs = [];             // Search logs for visual feedback
  }

  enable() {
    this.enabled = true;
    this.addLog('RAG System enabled.');
    this.notifyUpdate();
  }

  disable() {
    this.enabled = false;
    this.addLog('RAG System disabled.');
    this.notifyUpdate();
  }

  addListener(callback) {
    this.listeners.push(callback);
  }

  notifyUpdate() {
    for (const callback of this.listeners) {
      try { callback(); } catch (err) { console.error(err); }
    }
  }

  addDocument(filename, text) {
    if (this.documents.has(filename)) {
      this.removeDocument(filename); // Overwrite if it already exists
    }
    
    this.documents.set(filename, text);

    // Text chunking: 400 characters sliding window with 100 character overlap
    const chunkSize = 400;
    const overlap = 100;
    let index = 0;
    const docChunks = [];

    while (index < text.length) {
      const chunkText = text.substring(index, index + chunkSize).trim();
      if (chunkText.length > 10) {
        docChunks.push({
          id: `${filename}-${index}`,
          filename,
          text: chunkText,
          tokens: tokenize(chunkText)
        });
      }
      index += chunkSize - overlap;
      if (index >= text.length - overlap) break;
    }

    this.chunks = [...this.chunks, ...docChunks];
    this.recalculateIDF();
    this.addLog(`Document added: "${filename}" (${docChunks.length} chunks indexed)`);
    this.notifyUpdate();
  }

  removeDocument(filename) {
    if (!this.documents.has(filename)) return;
    this.documents.delete(filename);
    this.chunks = this.chunks.filter(c => c.filename !== filename);
    this.recalculateIDF();
    this.addLog(`Document removed: "${filename}"`);
    this.notifyUpdate();
  }

  clearAll() {
    this.documents.clear();
    this.chunks = [];
    this.idf.clear();
    this.addLog('All documents cleared.');
    this.notifyUpdate();
  }

  recalculateIDF() {
    this.idf.clear();
    const N = this.chunks.length;
    if (N === 0) return;

    const df = {};
    for (const chunk of this.chunks) {
      const uniqueTerms = new Set(chunk.tokens);
      for (const term of uniqueTerms) {
        df[term] = (df[term] || 0) + 1;
      }
    }

    for (const term in df) {
      // Standard BM25-friendly IDF formulation
      this.idf.set(term, Math.log(1 + (N - df[term] + 0.5) / (df[term] + 0.5)));
    }
  }

  search(query, k = 3) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || this.chunks.length === 0) return [];

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
          const tfVal = chunkTF[term] / chunk.tokens.length; // Normalized Term Frequency
          const idfVal = this.idf.get(term) || 0;
          score += tfVal * idfVal * queryTF[term];
        }
      }

      if (score > 0) {
        results.push({ chunk, score });
      }
    }

    // Sort by descending score
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  getRagPrompt(query) {
    if (!this.enabled || this.documents.size === 0) {
      return query;
    }
    const matches = this.search(query, 3);
    if (matches.length === 0) {
      this.addLog(`Query: "${query}" -> No matching contexts found.`);
      return query;
    }

    // Print matching details to logs
    const logInfo = matches.map(m => `[Score: ${m.score.toFixed(3)}] ${m.chunk.filename}: "${m.chunk.text.substring(0, 45)}..."`).join('\n');
    this.addLog(`Query: "${query}"\n${logInfo}`);
    this.notifyUpdate();

    const contextText = matches
      .map((m, i) => `[Source Document: ${m.chunk.filename} (Match Score: ${m.score.toFixed(4)})]\n${m.chunk.text}`)
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
}

// In environment with window, bind globally
if (typeof window !== 'undefined') {
  window.ragIndex = new LocalRAGIndex();
  window.getRagPrompt = (query) => window.ragIndex.getRagPrompt(query);
  console.log('[RAG] Local RAG engine initialized successfully and hooked to window.getRagPrompt.');
}
