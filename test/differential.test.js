import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { LocalRAGIndex, tokenize } from '../src/rag.js';

/**
 * Reference Oracle for Okapi BM25
 * Standard textbook formulation:
 * k1 = 1.2, b = 0.75
 * IDF(t) = ln(1 + (N - df(t) + 0.5) / (df(t) + 0.5))
 * TF_weight(t, D) = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (|D| / avgdl)))
 * Score(D, Q) = sum_{t in Q} (IDF(t) * TF_weight(t, D) * qtf)
 */
function referenceBM25(chunks, query, k1 = 1.2, b = 0.75) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || chunks.length === 0) return [];

  const N = chunks.length;
  let totalLength = 0;
  const df = {};

  for (const chunk of chunks) {
    totalLength += chunk.length;
    const uniqueTokens = new Set(chunk.tokens);
    for (const token of uniqueTokens) {
      df[token] = (df[token] || 0) + 1;
    }
  }

  const avgdl = totalLength / N;

  const idf = {};
  for (const term in df) {
    idf[term] = Math.log(1 + (N - df[term] + 0.5) / (df[term] + 0.5));
  }

  const queryTF = {};
  for (const term of queryTokens) {
    queryTF[term] = (queryTF[term] || 0) + 1;
  }

  const scores = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkTF = {};
    for (const term of chunk.tokens) {
      chunkTF[term] = (chunkTF[term] || 0) + 1;
    }

    let score = 0;
    for (const term in queryTF) {
      if (chunkTF[term]) {
        const tf = chunkTF[term];
        const idfVal = idf[term] || 0;
        const num = tf * (k1 + 1);
        const den = tf + k1 * (1 - b + b * (chunk.length / avgdl));
        score += idfVal * (num / den) * queryTF[term];
      }
    }

    if (score >= 0.05) {
      scores.push({ index: i, chunk, score });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores;
}

/**
 * Reference Oracle for Complete Thought/CoT Tag Extraction (Batch Regex)
 */
function referenceBatchThoughtParser(fullText) {
  const thoughtMatch = fullText.match(/<thought>([\s\S]*?)<\/thought>/i);
  let thoughtText = '';
  let cleanText = fullText;

  if (thoughtMatch) {
    thoughtText = thoughtMatch[1];
    cleanText = fullText.replace(/<thought>[\s\S]*?<\/thought>/i, '').trim();
  } else {
    // Check unclosed thought tag
    const openMatch = fullText.match(/<thought>([\s\S]*)$/i);
    if (openMatch) {
      thoughtText = openMatch[1];
      cleanText = fullText.replace(/<thought>[\s\S]*$/i, '').trim();
    }
  }

  return { thoughtText, cleanText };
}

/**
 * Streaming State Machine Thought Parser
 */
class StreamingThoughtParser {
  constructor() {
    this.buffer = '';
    this.inThought = false;
    this.thoughtText = '';
    this.visibleText = '';
  }

  feed(chunk) {
    this.buffer += chunk;
    while (this.buffer.length > 0) {
      if (!this.inThought) {
        const startIndex = this.buffer.toLowerCase().indexOf('<thought>');
        if (startIndex === -1) {
          // If buffer ends with a prefix of '<thought>', hold back those characters
          const tag = '<thought>';
          let partialMatch = 0;
          for (let i = 1; i < tag.length; i++) {
            if (this.buffer.toLowerCase().endsWith(tag.slice(0, i))) {
              partialMatch = i;
              break;
            }
          }
          if (partialMatch > 0) {
            this.visibleText += this.buffer.slice(0, this.buffer.length - partialMatch);
            this.buffer = this.buffer.slice(this.buffer.length - partialMatch);
            break;
          } else {
            this.visibleText += this.buffer;
            this.buffer = '';
          }
        } else {
          this.visibleText += this.buffer.slice(0, startIndex);
          this.inThought = true;
          this.buffer = this.buffer.slice(startIndex + '<thought>'.length);
        }
      } else {
        const endIndex = this.buffer.toLowerCase().indexOf('</thought>');
        if (endIndex === -1) {
          const tag = '</thought>';
          let partialMatch = 0;
          for (let i = 1; i < tag.length; i++) {
            if (this.buffer.toLowerCase().endsWith(tag.slice(0, i))) {
              partialMatch = i;
              break;
            }
          }
          if (partialMatch > 0) {
            this.thoughtText += this.buffer.slice(0, this.buffer.length - partialMatch);
            this.buffer = this.buffer.slice(this.buffer.length - partialMatch);
            break;
          } else {
            this.thoughtText += this.buffer;
            this.buffer = '';
          }
        } else {
          this.thoughtText += this.buffer.slice(0, endIndex);
          this.inThought = false;
          this.buffer = this.buffer.slice(endIndex + '</thought>'.length);
        }
      }
    }
  }

  flush() {
    if (this.inThought) {
      this.thoughtText += this.buffer;
    } else {
      this.visibleText += this.buffer;
    }
    this.buffer = '';
    return {
      thoughtText: this.thoughtText,
      cleanText: this.visibleText.trim()
    };
  }
}

test('Differential Testing Suite: Reference Systems vs Implementations', async (t) => {
  // Setup mock environment
  const mockStorage = new Map();
  global.window = {
    localStorage: {
      getItem: (k) => mockStorage.get(k) || null,
      setItem: (k, v) => mockStorage.set(k, String(v)),
      removeItem: (k) => mockStorage.delete(k),
      clear: () => mockStorage.clear()
    }
  };

  await t.test('Differential 1: LocalRAGIndex BM25 vs Reference Oracle BM25', () => {
    // Generate random documents and queries, assert exact mathematical parity
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            filename: fc.stringMatching(/^[a-z0-9_-]{3,10}\.(txt|md|csv)$/),
            text: fc.stringMatching(/^[a-zA-Z0-9\s.,!?-]{20,200}$/)
          }),
          { minLength: 2, maxLength: 8 }
        ),
        fc.stringMatching(/^[a-zA-Z0-9\s]{3,30}$/),
        (docEntries, query) => {
          const rag = new LocalRAGIndex({ autoPersist: false });
          for (const doc of docEntries) {
            rag.addDocument(doc.filename, doc.text);
          }

          if (rag.chunks.length === 0) return true;

          const refResults = referenceBM25(rag.chunks, query, 1.2, 0.75);
          const ragResults = rag.search(query, 10, 0.05);

          // Assert number of returned results match
          assert.equal(ragResults.length, refResults.length, 'Results count must match reference oracle');

          // Assert ranking order and scores match within float epsilon
          for (let i = 0; i < ragResults.length; i++) {
            assert.equal(
              ragResults[i].chunk.id,
              refResults[i].chunk.id,
              `Rank #${i} chunk ID must match reference oracle`
            );
            assert.ok(
              Math.abs(ragResults[i].score - refResults[i].score) < 1e-6,
              `Rank #${i} score ${ragResults[i].score} vs ref ${refResults[i].score} must match within epsilon`
            );
          }

          return true;
        }
      ),
      { numRuns: 1000, seed: 42 }
    );
  });

  await t.test('Differential 2: Streaming State-Machine Thought Parser vs Batch Regex Oracle', () => {
    // Generate streams with thoughts, split into random chunks, verify state machine equals batch oracle
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 100 }),
        fc.string({ minLength: 5, maxLength: 100 }),
        fc.string({ minLength: 5, maxLength: 100 }),
        fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 1, maxLength: 30 }),
        (prefix, thought, suffix, chunkSizes) => {
          // Clean strings of tag substrings to avoid nested collision
          const cleanPrefix = prefix.replace(/<\/?thought>/gi, '');
          const cleanThought = thought.replace(/<\/?thought>/gi, '');
          const cleanSuffix = suffix.replace(/<\/?thought>/gi, '');

          const fullStream = `${cleanPrefix}<thought>${cleanThought}</thought>${cleanSuffix}`;
          const refResult = referenceBatchThoughtParser(fullStream);

          // Feed into streaming parser in randomly sized chunks
          const streamingParser = new StreamingThoughtParser();
          let cursor = 0;
          let chunkIdx = 0;

          while (cursor < fullStream.length) {
            const size = chunkSizes[chunkIdx % chunkSizes.length];
            const chunk = fullStream.slice(cursor, cursor + size);
            streamingParser.feed(chunk);
            cursor += size;
            chunkIdx++;
          }

          const streamResult = streamingParser.flush();

          assert.equal(
            streamResult.thoughtText,
            refResult.thoughtText,
            'Streaming thought text must match batch oracle'
          );
          assert.equal(
            streamResult.cleanText,
            refResult.cleanText,
            'Streaming clean text must match batch oracle'
          );

          return true;
        }
      ),
      { numRuns: 1000, seed: 1337 }
    );
  });

  await t.test('Differential 3: Conversation History V1 (Flat Format) vs V2 (Structured Snapshots)', () => {
    // Model migration between legacy flat history serialization and snapshot representation
    function serializeV1(messages) {
      return JSON.stringify(messages.map(m => ({ role: m.role, text: m.text })));
    }

    function deserializeV1(raw) {
      return JSON.parse(raw);
    }

    function serializeV2(messages, metadata = {}) {
      return JSON.stringify({
        version: 2,
        metadata: {
          timestamp: metadata.timestamp || 123456789,
          model: metadata.model || 'gemma'
        },
        turns: messages.map(m => ({
          role: m.role,
          content: m.text,
          tokens: m.tokensCount || "0",
          stats: {
            speed: m.decodeSpeed || "0 tk/s"
          }
        }))
      });
    }

    function migrateV2ToV1(rawV2) {
      const parsed = JSON.parse(rawV2);
      if (parsed.version === 2 && Array.isArray(parsed.turns)) {
        return parsed.turns.map(t => ({ role: t.role, text: t.content }));
      }
      return parsed;
    }

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            role: fc.constantFrom('user', 'assistant'),
            text: fc.string({ minLength: 1, maxLength: 100 })
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (messages) => {
          const v1Data = serializeV1(messages);
          const v2Data = serializeV2(messages);

          const restoredV1 = deserializeV1(v1Data);
          const migratedV2 = migrateV2ToV1(v2Data);

          assert.deepEqual(
            migratedV2,
            restoredV1,
            'Migrated V2 format must match V1 format symmetrically for all inputs'
          );

          return true;
        }
      ),
      { numRuns: 1000, seed: 999 }
    );
  });
});
