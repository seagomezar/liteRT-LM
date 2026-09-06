import test from 'node:test';
import assert from 'node:assert/strict';
import { FeatureConfigManager, DEFAULT_FEATURES, FEATURE_METADATA } from '../src/config.js';

test('FeatureConfigManager Unit Tests', async (t) => {
  // Mock localStorage for Node test environment
  const storageMap = new Map();
  global.window = {
    localStorage: {
      getItem: (key) => storageMap.get(key) || null,
      setItem: (key, val) => storageMap.set(key, String(val)),
      removeItem: (key) => storageMap.delete(key),
      clear: () => storageMap.clear()
    }
  };

  await t.test('initializes with all default features enabled', () => {
    storageMap.clear();
    const manager = new FeatureConfigManager();
    const all = manager.getAll();
    assert.deepEqual(all, DEFAULT_FEATURES);
    assert.equal(manager.get('avatar'), true);
    assert.equal(manager.get('rag'), true);
    assert.equal(manager.get('voiceTts'), true);
    assert.equal(manager.get('nonexistent'), false);
  });

  await t.test('sets and toggles individual feature flags', () => {
    storageMap.clear();
    const manager = new FeatureConfigManager();

    manager.set('avatar', false);
    assert.equal(manager.get('avatar'), false);

    const toggled = manager.toggle('avatar');
    assert.equal(toggled, true);
    assert.equal(manager.get('avatar'), true);

    manager.toggle('rag');
    assert.equal(manager.get('rag'), false);
  });

  await t.test('setMultiple updates batch preferences and ignores unknown keys', () => {
    storageMap.clear();
    const manager = new FeatureConfigManager();

    manager.setMultiple({
      avatar: false,
      codePreview: false,
      unknownKey: true
    });

    assert.equal(manager.get('avatar'), false);
    assert.equal(manager.get('codePreview'), false);
    assert.equal(manager.get('rag'), true);
    assert.equal(manager.get('unknownKey'), false);
  });

  await t.test('subscribes listeners and notifies on changes', () => {
    storageMap.clear();
    const manager = new FeatureConfigManager();
    let notificationCount = 0;
    let latestState = null;

    const unsubscribe = manager.subscribe((state) => {
      notificationCount++;
      latestState = state;
    });

    manager.set('thinkingToggle', false);
    assert.equal(notificationCount, 1);
    assert.equal(latestState.thinkingToggle, false);

    manager.toggle('thinkingToggle');
    assert.equal(notificationCount, 2);
    assert.equal(latestState.thinkingToggle, true);

    unsubscribe();
    manager.set('thinkingToggle', false);
    assert.equal(notificationCount, 2); // Unsubscribed, shouldn't fire
  });

  await t.test('persists to and reloads from localStorage', () => {
    storageMap.clear();
    const manager1 = new FeatureConfigManager();
    manager1.set('voiceStt', false);
    manager1.set('advancedTuner', false);

    // Instantiate a new manager, should rehydrate from localStorage
    const manager2 = new FeatureConfigManager();
    assert.equal(manager2.get('voiceStt'), false);
    assert.equal(manager2.get('advancedTuner'), false);
    assert.equal(manager2.get('avatar'), true);
  });

  await t.test('reset restores defaults and saves to localStorage', () => {
    storageMap.clear();
    const manager = new FeatureConfigManager();
    manager.set('avatar', false);
    manager.set('rag', false);
    assert.equal(manager.get('avatar'), false);

    manager.reset();
    assert.equal(manager.get('avatar'), true);
    assert.equal(manager.get('rag'), true);
  });

  await t.test('exports and imports configuration script', () => {
    storageMap.clear();
    const manager = new FeatureConfigManager();
    manager.set('avatar', false);

    const script = manager.exportScript();
    assert.ok(script.includes('window.LiteRTConfig.setMultiple'));
    assert.ok(script.includes('"avatar": false'));

    const newManager = new FeatureConfigManager();
    const imported = newManager.importConfig(JSON.stringify({ avatar: false, rag: false }));
    assert.equal(imported, true);
    assert.equal(newManager.get('avatar'), false);
    assert.equal(newManager.get('rag'), false);

    // Invalid json handling
    const fail = newManager.importConfig("INVALID JSON");
    assert.equal(fail, false);
  });

  await t.test('FEATURE_METADATA provides human readable labels and categories', () => {
    for (const key of Object.keys(DEFAULT_FEATURES)) {
      assert.ok(FEATURE_METADATA[key], `Metadata missing for feature ${key}`);
      assert.ok(FEATURE_METADATA[key].label);
      assert.ok(FEATURE_METADATA[key].description);
      assert.ok(FEATURE_METADATA[key].category);
    }
  });
});
