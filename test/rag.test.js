import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalRAGIndex, tokenize } from '../src/rag.js';

test('Enhanced RAG Engine Unit Tests', async (t) => {
  const storageMap = new Map();
  global.window = {
    localStorage: {
      getItem: (key) => storageMap.get(key) || null,
      setItem: (key, val) => storageMap.set(key, String(val)),
      removeItem: (key) => storageMap.delete(key),
      clear: () => storageMap.clear()
    }
  };

  await t.test('multilingual Unicode tokenization handles accented letters and international characters', () => {
    // Spanish with accents
    const spanishTokens = tokenize("El diseño y la programación con Inteligencia Artificial!");
    assert.ok(spanishTokens.includes("diseño"), "Should preserve Spanish ñ in 'diseño'");
    assert.ok(spanishTokens.includes("programación"), "Should preserve Spanish ó in 'programación'");
    assert.ok(spanishTokens.includes("inteligencia"));
    assert.ok(spanishTokens.includes("artificial"));
    assert.ok(!spanishTokens.includes("el"), "Stop word 'el' should be filtered out");
    assert.ok(!spanishTokens.includes("la"), "Stop word 'la' should be filtered out");

    // German with umlauts
    const germanTokens = tokenize("Künstliche Intelligenz für Geräte");
    assert.ok(germanTokens.includes("künstliche"), "Should preserve German ü in 'künstliche'");
    assert.ok(germanTokens.includes("intelligenz"));
  });

  await t.test('indexes documents and calculates BM25 scores correctly', () => {
    storageMap.clear();
    const rag = new LocalRAGIndex();
    rag.autoPersist = false;

    rag.addDocument('ai_notes.txt', 'LiteRT-LM is a local on-device LLM runner that executes Gemma on WebGPU.');
    rag.addDocument('cooking.txt', 'Baking sourdough bread requires flour, water, salt, and sourdough starter fermentation.');

    assert.equal(rag.documents.size, 2);
    assert.ok(rag.chunks.length >= 2);

    // Search for LLM query
    const resultsLLM = rag.search('LiteRT WebGPU execution', 3);
    assert.ok(resultsLLM.length > 0);
    assert.equal(resultsLLM[0].chunk.filename, 'ai_notes.txt');
    assert.ok(resultsLLM[0].score > 0);

    // Search for cooking query
    const resultsFood = rag.search('sourdough fermentation flour', 3);
    assert.ok(resultsFood.length > 0);
    assert.equal(resultsFood[0].chunk.filename, 'cooking.txt');
  });

  await t.test('getRagPrompt augments query when matches exist and leaves untouched when empty or disabled', () => {
    storageMap.clear();
    const rag = new LocalRAGIndex();
    rag.autoPersist = false;

    // When empty
    const rawQuery = "How to run Gemma on WebGPU?";
    assert.equal(rag.getRagPrompt(rawQuery), rawQuery);

    // After indexing relevant document
    rag.addDocument('spec.md', 'Gemma 4 models run efficiently on modern WebGPU browsers with LiteRT-LM.');
    const augmented = rag.getRagPrompt(rawQuery);
    assert.ok(augmented.includes('Context from uploaded documents:'));
    assert.ok(augmented.includes('spec.md'));
    assert.ok(augmented.includes(rawQuery));

    // When disabled
    rag.disable();
    assert.equal(rag.getRagPrompt(rawQuery), rawQuery);
  });

  await t.test('persists documents to localStorage and hydrates on reload', () => {
    storageMap.clear();
    const rag1 = new LocalRAGIndex({ autoPersist: true });
    rag1.addDocument('persistent.txt', 'This document should survive page reloads and browser refreshes in offline storage.');
    assert.equal(rag1.documents.size, 1);

    // Create second instance - simulating reload
    const rag2 = new LocalRAGIndex({ autoPersist: true });
    assert.equal(rag2.documents.size, 1);
    assert.ok(rag2.documents.has('persistent.txt'));
    const results = rag2.search('browser refreshes offline', 1);
    assert.ok(results.length > 0);
    assert.equal(results[0].chunk.filename, 'persistent.txt');

    // Remove document and verify storage update
    rag2.removeDocument('persistent.txt');
    assert.equal(rag2.documents.size, 0);

    const rag3 = new LocalRAGIndex({ autoPersist: true });
    assert.equal(rag3.documents.size, 0);
  });

  await t.test('clearAll removes all documents from memory and storage', () => {
    storageMap.clear();
    const rag = new LocalRAGIndex({ autoPersist: true });
    rag.addDocument('doc1.txt', 'First document content');
    rag.addDocument('doc2.txt', 'Second document content');
    assert.equal(rag.documents.size, 2);

    rag.clearAll();
    assert.equal(rag.documents.size, 0);
    assert.equal(rag.chunks.length, 0);
    assert.equal(rag.search('document').length, 0);
  });

  await t.test('activity logs rotate smoothly', () => {
    const rag = new LocalRAGIndex();
    for (let i = 0; i < 30; i++) {
      rag.addLog(`Event ${i}`);
    }
    assert.ok(rag.logs.length <= 25);
    assert.ok(rag.logs[0].includes('Event 29'));
  });
});
