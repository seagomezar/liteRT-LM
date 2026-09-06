import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3.1.2/+esm';
import { unsafeHTML } from 'https://cdn.jsdelivr.net/npm/lit@3.1.2/directives/unsafe-html/+esm';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12.0.0/+esm';
import hljs from 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/es/highlight.min.js';
import { ChatStateManager, LANGUAGE_CODES } from './state.js';
import { LiteRTConfig, DEFAULT_FEATURES, FEATURE_METADATA } from './config.js';
import { ragIndex } from './rag.js';

// Setup marked renderer with Punch-Card code block styling
const renderer = new marked.Renderer();
renderer.code = function(arg1, infostring) {
  let codeText = "";
  let language = "";
  
  if (typeof arg1 === "object" && arg1 !== null) {
    codeText = String(arg1.text || "");
    language = String(arg1.lang || "");
  } else {
    codeText = typeof arg1 === "string" ? arg1 : String(arg1 || "");
    language = typeof infostring === "string" ? infostring : "";
  }
  
  language = language.trim().toLowerCase();
  let highlighted = "";
  
  try {
    if (language && hljs.getLanguage(language)) {
      highlighted = hljs.highlight(codeText, { language }).value;
    } else {
      const autoHighlight = hljs.highlightAuto(codeText);
      highlighted = autoHighlight.value;
      if (!language) language = autoHighlight.language || "code";
    }
  } catch (err) {
    highlighted = (codeText || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    if (!language) language = "code";
  }

  // Base64 encode the raw code so Copy & HTML preview scripts can retrieve it safely
  const base64Code = btoa(unescape(encodeURIComponent(codeText)));
  const isCodePreviewEnabled = LiteRTConfig ? LiteRTConfig.get('codePreview') : true;
  const isHtml = language === 'html' || language === 'xml';
  
  return `
    <div class="punch-card-code" data-code="${base64Code}" data-lang="${language}">
      <div class="punch-card-header">
        <span style="display:flex; align-items:center; gap:6px;">
          <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#d97706;"></span>
          PUNCH CARD // ${language.toUpperCase()}
        </span>
        <div class="punch-card-actions">
          <button class="btn-punch-action" onclick="window.copyCode(this)" title="Copy Code">PUNCH 📋</button>
          ${isCodePreviewEnabled && isHtml ? `<button class="btn-punch-action" style="background:#d97706; color:#ffffff; border-color:#b45309;" onclick="window.previewHtml(this.closest('.punch-card-code'))" title="Run in Sandbox">PREVIEW ⚡</button>` : ''}
        </div>
      </div>
      <pre class="punch-card-pre"><code class="hljs language-${language}">${highlighted}</code></pre>
    </div>
  `;
};

marked.use({ renderer });

/**
 * Phaser Scene for Procedural 2D Vintage Cathode Robot Avatar
 */
class AvatarScene extends Phaser.Scene {
  constructor() {
    super('AvatarScene');
    this.isSpeaking = false;
    this.mouth = null;
    this.eyes = [];
    this.antenna = null;
    this.head = null;
    this.timeCounter = 0;
  }

  create() {
    const cx = 120;
    const cy = 120;

    // Head base (cathode bezel)
    this.headGraphics = this.add.graphics();
    this.headGraphics.fillStyle(0x141920, 1);
    this.headGraphics.lineStyle(3, 0xd97706, 1);
    this.headGraphics.fillRoundedRect(cx - 70, cy - 70, 140, 140, 24);
    this.headGraphics.strokeRoundedRect(cx - 70, cy - 70, 140, 140, 24);

    // Antenna
    this.antennaGraphics = this.add.graphics();
    this.antennaGraphics.lineStyle(3, 0xd97706, 1);
    this.antennaGraphics.lineBetween(cx, cy - 70, cx, cy - 95);
    this.antennaTip = this.add.circle(cx, cy - 98, 7, 0xd97706);

    // Eyes (glowing sage pilot lamps)
    this.eyeLeft = this.add.circle(cx - 30, cy - 15, 11, 0x059669);
    this.eyeRight = this.add.circle(cx + 30, cy - 15, 11, 0x059669);
    this.eyeLeft.setStrokeStyle(2, 0xffffff);
    this.eyeRight.setStrokeStyle(2, 0xffffff);

    // Mouth
    this.mouthGraphics = this.add.graphics();
    this.drawMouth(0.1);

    // Blink timer loop
    this.time.addEvent({
      delay: 3500,
      callback: this.blink,
      callbackScope: this,
      loop: true
    });
  }

  drawMouth(heightPercent) {
    this.mouthGraphics.clear();
    this.mouthGraphics.fillStyle(0xd97706, 1);
    this.mouthGraphics.lineStyle(2, 0xd97706, 1);

    const cx = 120;
    const cy = 120;
    const mouthY = cy + 25;
    const mouthWidth = 42;

    if (heightPercent <= 0.15) {
      this.mouthGraphics.lineBetween(cx - mouthWidth/2, mouthY, cx + mouthWidth/2, mouthY);
    } else {
      const openHeight = 24 * heightPercent;
      this.mouthGraphics.fillEllipse(cx, mouthY, mouthWidth, openHeight);
      this.mouthGraphics.strokeEllipse(cx, mouthY, mouthWidth, openHeight);
    }
  }

  blink() {
    this.tweens.add({
      targets: [this.eyeLeft, this.eyeRight],
      scaleY: 0,
      duration: 120,
      yoyo: true,
      onComplete: () => {
        this.eyeLeft.scaleY = 1;
        this.eyeRight.scaleY = 1;
      }
    });
  }

  update(time, delta) {
    this.timeCounter += delta;

    // Idle breathing animation shift
    const idleOffset = Math.sin(this.timeCounter * 0.003) * 2.5;
    this.eyeLeft.y = 120 - 15 + idleOffset;
    this.eyeRight.y = 120 - 15 + idleOffset;
    this.antennaTip.y = 120 - 98 + idleOffset;

    const cx = 120;
    const cy = 120 + idleOffset;
    this.headGraphics.clear();
    this.headGraphics.fillStyle(0x141920, 1);
    this.headGraphics.lineStyle(3, 0xd97706, 1);
    this.headGraphics.fillRoundedRect(cx - 70, cy - 70, 140, 140, 24);
    this.headGraphics.strokeRoundedRect(cx - 70, cy - 70, 140, 140, 24);

    this.antennaGraphics.clear();
    this.antennaGraphics.lineStyle(3, 0xd97706, 1);
    this.antennaGraphics.lineBetween(cx, cy - 70, cx, cy - 95);

    // Mouth movement during speech
    if (this.isSpeaking) {
      const mouthOpenness = 0.3 + Math.abs(Math.sin(this.timeCounter * 0.015)) * 0.7;
      this.drawMouth(mouthOpenness);
      const pulseScale = 1.0 + Math.sin(this.timeCounter * 0.02) * 0.3;
      this.antennaTip.setScale(pulseScale);
    } else {
      this.drawMouth(0.1);
      this.antennaTip.setScale(1);
    }
  }
}

/**
 * LiteRTAvatar Component
 */
export class LiteRTAvatar extends LitElement {
  static properties = {
    state: { type: Object }
  };

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.state.addHost(this);
  }

  firstUpdated() {
    const config = {
      type: Phaser.AUTO,
      width: 240,
      height: 240,
      parent: this.querySelector('#avatar-phaser-container'),
      transparent: true,
      scene: AvatarScene
    };
    this.game = new Phaser.Game(config);
  }

  updated() {
    if (this.game && this.game.scene && this.game.scene.scenes[0]) {
      this.game.scene.scenes[0].isSpeaking = this.state.isSpeaking;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.game) {
      this.game.destroy(true);
    }
  }

  render() {
    if (!LiteRTConfig.get('avatar')) {
      return html``;
    }

    return html`
      <div class="avatar-cathode-frame">
        <div class="avatar-cathode-screen">
          <div id="avatar-phaser-container"></div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: 8px; padding: 0 4px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <div class="lamp-bulb ${this.state.isSpeaking ? 'active' : ''}"></div>
            <span style="font-family: var(--font-mono); font-size: 0.68rem; font-weight: 700; color: ${this.state.isSpeaking ? 'var(--sage)' : '#94a3b8'};">
              ${this.state.isSpeaking ? 'TALK // ACTIVE' : 'TALK // STANDBY'}
            </span>
          </div>
          ${this.state.isSpeaking ? html`
            <button 
              class="btn-punch-action"
              style="background: #dc2626; color: #ffffff; border-color: #991b1b;"
              @click=${() => this.state.stopSpeechOnly()}
              title="Mute Speech"
            >
              MUTE ✕
            </button>
          ` : ""}
        </div>
      </div>
    `;
  }
}
customElements.define("litert-avatar", LiteRTAvatar);

// Model list config
const MODEL_LIST = [
  {
    name: "Gemma 4 E2B",
    filename: "gemma-4-E2B-it-web.litertlm",
    path: "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm",
    size: "1.9 GB"
  },
  {
    name: "Gemma 4 E4B",
    filename: "gemma-4-E4B-it-web.litertlm",
    path: "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.litertlm",
    size: "2.8 GB"
  }
];

/**
 * CustomDropdown Component
 */
export class CustomDropdown extends LitElement {
  static properties = {
    value: { type: String },
    isOpen: { type: Boolean, state: true }
  };

  constructor() {
    super();
    this.isOpen = false;
    this.value = "";
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this._handleOutsideClick = (e) => {
      if (!this.contains(e.target)) {
        this.isOpen = false;
      }
    };
    document.addEventListener("click", this._handleOutsideClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("click", this._handleOutsideClick);
  }

  toggleOpen(e) {
    e.stopPropagation();
    this.isOpen = !this.isOpen;
  }

  selectOption(optPath) {
    this.value = optPath;
    this.isOpen = false;
    this.dispatchEvent(new CustomEvent("change", { detail: { value: optPath } }));
  }

  render() {
    const selectedModel = MODEL_LIST.find(m => m.path === this.value) || {
      name: this.value ? this.value.split("/").pop() : "Select Model...",
      size: ""
    };

    return html`
      <div style="position: relative; width: 100%;">
        <div 
          class="btn-tactile" 
          style="width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 7px 10px;"
          @click=${this.toggleOpen}
        >
          <div style="display: flex; flex-direction: column; align-items: flex-start; overflow: hidden;">
            <span style="font-weight: 700; font-family: var(--font-mono); font-size: 0.78rem;">${selectedModel.name}</span>
            ${selectedModel.size ? html`<span style="font-size: 0.65rem; color: var(--text-muted);">${selectedModel.size}</span>` : ""}
          </div>
          <span style="font-size: 0.65rem; color: var(--amber-dark);">▼</span>
        </div>

        ${this.isOpen ? html`
          <div style="position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--bg-card); border: 2px solid var(--border-strong); border-radius: var(--radius-sm); z-index: 1000; box-shadow: 0 6px 16px rgba(0,0,0,0.15); display: flex; flex-direction: column;">
            ${MODEL_LIST.map(m => html`
              <div 
                style="padding: 8px 10px; border-bottom: 1px solid var(--border); cursor: pointer; display: flex; justify-content: space-between; align-items: center;"
                @click=${() => this.selectOption(m.path)}
              >
                <div>
                  <div style="font-weight: 700; font-family: var(--font-mono); font-size: 0.78rem;">${m.name}</div>
                  <div style="font-size: 0.65rem; color: var(--text-muted);">${m.size}</div>
                </div>
                ${this.value === m.path ? html`<span style="color: var(--sage); font-weight: bold;">✓</span>` : ""}
              </div>
            `)}
          </div>
        ` : ""}
      </div>
    `;
  }
}
customElements.define("custom-dropdown", CustomDropdown);

/**
 * LiteRTSidebar Component
 * Hardware Rack containing Model Tuning Rack, Cache Manager, Audio Rack, RAG Hub, and Conversation Ledger.
 */
export class LiteRTSidebar extends LitElement {
  static properties = {
    state: { type: Object }
  };

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.state.addHost(this);
    this._unsubConfig = LiteRTConfig.subscribe(() => this.requestUpdate());
    if (ragIndex) {
      ragIndex.addListener(() => this.requestUpdate());
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubConfig) this._unsubConfig();
  }

  handleModelSelect(e) {
    this.state.selectedModelPath = e.detail.value;
    this.state.saveSettings();
    this.state.requestUpdate();
  }

  handleLocalFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (file) {
      this.state.loadModelFromFile(file);
    }
  }

  handleFaderInput(e, prop) {
    const val = parseFloat(e.target.value);
    this.state[prop] = isNaN(val) ? e.target.value : val;
    this.state.saveSettings();
    this.state.requestUpdate();
  }

  handleRagFileUpload(e) {
    const files = e.target.files;
    if (files) {
      for (const file of files) {
        ragIndex.ingestFile(file).catch(err => {
          console.error(err);
          ragIndex.addLog(`Error ingesting "${file.name}": ${err.message}`);
        });
      }
    }
  }

  render() {
    const isAvatar = LiteRTConfig.get('avatar');
    const isAdvancedTuner = LiteRTConfig.get('advancedTuner');
    const isModelCache = LiteRTConfig.get('modelCache');
    const isVoiceTts = LiteRTConfig.get('voiceTts');
    const isRag = LiteRTConfig.get('rag');

    return html`
      <div style="display: flex; flex-direction: column; gap: 14px;">
        
        <!-- Animated Cathode Avatar -->
        ${isAvatar ? html`<litert-avatar .state=${this.state}></litert-avatar>` : ''}

        <!-- Model Selection & Tuning Rack -->
        <div class="hardware-card">
          <div class="hardware-card-title">
            <span>Model Tuner Rack</span>
            <span class="hardware-tag">WEBGPU</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">
              Weights Target
            </label>
            <custom-dropdown 
              .value=${this.state.selectedModelPath} 
              @change=${this.handleModelSelect}
            ></custom-dropdown>

            <!-- Load Local .litertlm File -->
            <input 
              type="file" 
              id="local-model-file" 
              accept=".litertlm" 
              style="display: none;" 
              @change=${this.handleLocalFileSelect}
            />
            <button 
              class="btn-tactile" 
              style="font-size: 0.7rem; justify-content: center;"
              @click=${() => this.querySelector('#local-model-file').click()}
            >
              📂 LOAD LOCAL .LITERTLM FILE
            </button>
          </div>

          ${isAdvancedTuner ? html`
            <!-- Hardware Sliders & Nixie Readouts -->
            <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 6px; border-top: 1px dashed var(--border); padding-top: 10px;">
              
              <div class="fader-control">
                <div class="fader-header">
                  <span>Temperature</span>
                  <span class="nixie-badge">${this.state.temperature.toFixed(2)}</span>
                </div>
                <input 
                  type="range" 
                  class="hardware-slider" 
                  min="0" max="2" step="0.05" 
                  .value=${String(this.state.temperature)}
                  @input=${e => this.handleFaderInput(e, 'temperature')}
                />
              </div>

              <div class="fader-control">
                <div class="fader-header">
                  <span>Top-K Sampling</span>
                  <span class="nixie-badge">${this.state.topK}</span>
                </div>
                <input 
                  type="range" 
                  class="hardware-slider" 
                  min="1" max="128" step="1" 
                  .value=${String(this.state.topK)}
                  @input=${e => this.handleFaderInput(e, 'topK')}
                />
              </div>

              <div class="fader-control">
                <div class="fader-header">
                  <span>Top-P Sampling</span>
                  <span class="nixie-badge">${this.state.topP.toFixed(2)}</span>
                </div>
                <input 
                  type="range" 
                  class="hardware-slider" 
                  min="0.1" max="1" step="0.05" 
                  .value=${String(this.state.topP)}
                  @input=${e => this.handleFaderInput(e, 'topP')}
                />
              </div>

              <div class="fader-control">
                <div class="fader-header">
                  <span>Context Length</span>
                  <span class="nixie-badge">${this.state.contextLength}</span>
                </div>
                <input 
                  type="range" 
                  class="hardware-slider" 
                  min="1024" max="8192" step="512" 
                  .value=${String(this.state.contextLength)}
                  @input=${e => this.handleFaderInput(e, 'contextLength')}
                />
              </div>
            </div>
          ` : ""}
        </div>

        ${isModelCache ? html`
          <!-- Vacuum-Tube Model Cache Storage -->
          <div class="hardware-card">
            <div class="hardware-card-title">
              <span>Cache Storage</span>
              <span class="hardware-tag">OFFLINE</span>
            </div>
            <div class="vacuum-meter">
              <div style="display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 0.68rem;">
                <span style="color: #94a3b8;">STORAGE STATUS:</span>
                <span style="color: #38bdf8;">${this.state.cachedModels.size} MODEL(S)</span>
              </div>
              <div class="tube-bar-track">
                <div class="tube-bar-fill" style="width: ${this.state.cachedModels.size > 0 ? '65%' : '0%'};"></div>
              </div>
            </div>
            <button 
              class="btn-tactile" 
              style="color: #ef4444; border-color: rgba(239, 68, 68, 0.4); justify-content: center; font-size: 0.68rem;"
              @click=${() => this.state.clearAllCache()}
            >
              PURGE CACHE STORAGE ✕
            </button>
          </div>
        ` : ""}

        ${isVoiceTts ? html`
          <!-- Audio & Language Rack -->
          <div class="hardware-card">
            <div class="hardware-card-title">
              <span>Voice & Multilingual</span>
              <span class="hardware-tag">AUDIO</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.72rem; font-weight: 600; text-transform: uppercase;">Voice Output:</span>
              <div class="toggle-switch-wrapper">
                <label class="retro-toggle">
                  <input 
                    type="checkbox" 
                    .checked=${this.state.enableVoiceResponse} 
                    @change=${(e) => {
                      this.state.enableVoiceResponse = e.target.checked;
                      this.state.saveSettings();
                      this.state.requestUpdate();
                    }}
                  />
                  <span class="retro-toggle-slider"></span>
                </label>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
              <label style="font-size: 0.68rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted);">
                Language Channel
              </label>
              <select 
                class="btn-tactile" 
                style="width: 100%; font-family: var(--font-mono); font-size: 0.75rem;"
                .value=${this.state.chatLanguage}
                @change=${(e) => {
                  this.state.chatLanguage = e.target.value;
                  this.state.saveSettings();
                  this.state.requestUpdate();
                }}
              >
                ${Object.keys(LANGUAGE_CODES).map(lang => html`<option value="${lang}">${lang}</option>`)}
              </select>
            </div>
          </div>
        ` : ""}

        ${isRag ? html`
          <!-- Document RAG Hub & Knowledge Base -->
          <div class="hardware-card">
            <div class="hardware-card-title">
              <span>Document RAG Cabinet</span>
              <div class="toggle-switch-wrapper">
                <label class="retro-toggle">
                  <input 
                    type="checkbox" 
                    .checked=${ragIndex.enabled} 
                    @change=${(e) => {
                      if (e.target.checked) ragIndex.enable();
                      else ragIndex.disable();
                    }}
                  />
                  <span class="retro-toggle-slider"></span>
                </label>
              </div>
            </div>

            <!-- Ingestion Dropzone -->
            <input 
              type="file" 
              id="rag-upload-input" 
              multiple 
              accept=".pdf,.txt,.md,.csv,.json" 
              style="display: none;" 
              @change=${this.handleRagFileUpload}
            />
            <div 
              style="border: 2px dashed var(--border-strong); border-radius: var(--radius-sm); padding: 10px; text-align: center; background: var(--bg-inset); cursor: pointer;"
              @click=${() => this.querySelector('#rag-upload-input').click()}
            >
              <div style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700; color: var(--text-ink);">
                + INGEST PAPERS / MICROFILM
              </div>
              <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 2px;">
                PDF, Markdown, TXT, CSV, JSON
              </div>
            </div>

            <!-- Stats -->
            <div style="display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 0.68rem; color: var(--text-muted);">
              <span>ARCHIVES: <b style="color: var(--text-ink);">${ragIndex.documents.size}</b></span>
              <span>CHUNKS: <b style="color: var(--text-ink);">${ragIndex.chunks.length}</b></span>
            </div>

            <!-- Indexed Documents List -->
            <div style="display: flex; flex-direction: column; gap: 4px; max-height: 110px; overflow-y: auto;">
              ${Array.from(ragIndex.documents.entries()).map(([filename, doc]) => html`
                <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-inset); padding: 4px 8px; border-radius: 2px; font-family: var(--font-mono); font-size: 0.68rem;">
                  <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">${filename}</span>
                  <button 
                    style="background: none; border: none; color: #ef4444; font-weight: bold; cursor: pointer; padding: 0 4px;"
                    @click=${() => ragIndex.removeDocument(filename)}
                  >✕</button>
                </div>
              `)}
            </div>

            <!-- Ticker Tape Activity Log -->
            <div style="background: #141920; border: 1px solid #2d3748; border-radius: var(--radius-sm); padding: 6px 8px; font-family: var(--font-mono); font-size: 0.62rem; color: #94a3b8; max-height: 80px; overflow-y: auto; white-space: pre-wrap;">
              ${ragIndex.logs.length > 0 ? ragIndex.logs.join('\n') : "SYSTEM READY. AWAITING INGESTION."}
            </div>
          </div>
        ` : ""}

      </div>
    `;
  }
}
customElements.define("litert-sidebar", LiteRTSidebar);

/**
 * LiteRTChatWindow Component
 * Manila Card conversation timeline and Typewriter Ribbon prompt dock.
 */
export class LiteRTChatWindow extends LitElement {
  static properties = {
    state: { type: Object }
  };

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.state.addHost(this);
    this._unsubConfig = LiteRTConfig.subscribe(() => this.requestUpdate());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubConfig) this._unsubConfig();
  }

  firstUpdated() {
    // Global hooks for code copy and HTML preview
    window.previewHtml = (element) => {
      const b64 = element.getAttribute("data-code");
      if (b64) {
        const decoded = decodeURIComponent(escape(atob(b64)));
        const overlay = document.getElementById("preview-overlay");
        const iframe = document.getElementById("preview-iframe");
        const closeBtn = document.getElementById("btn-close-preview");
        if (overlay && iframe && closeBtn) {
          iframe.srcdoc = decoded;
          overlay.style.display = "flex";
          closeBtn.onclick = () => {
            overlay.style.display = "none";
            iframe.srcdoc = "";
          };
        }
      }
    };

    window.copyCode = (button) => {
      const container = button.closest(".punch-card-code");
      const b64 = container.getAttribute("data-code");
      if (b64) {
        const decoded = decodeURIComponent(escape(atob(b64)));
        navigator.clipboard.writeText(decoded).then(() => {
          const original = button.textContent;
          button.textContent = "COPIED ✓";
          setTimeout(() => { button.textContent = original; }, 1500);
        });
      }
    };
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    const scrollArea = this.querySelector('.chat-scroll-area');
    if (scrollArea) {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }

  handlePromptSubmit(e) {
    e.preventDefault();
    const textarea = this.querySelector('#chat-input-textarea') || this.querySelector('#terminal-prompt-input');
    if (!textarea) return;
    const text = textarea.value.trim();
    if (text) {
      textarea.value = "";
      this.state.sendMessage(text);
    }
  }

  handleTextareaKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handlePromptSubmit(e);
    }
  }

  render() {
    const isSttEnabled = LiteRTConfig.get('voiceStt');
    const isThinkingEnabled = LiteRTConfig.get('thinkingToggle');
    const isRagEnabled = LiteRTConfig.get('rag');

    return html`
      <div style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
        
        <!-- Conversation Cards Timeline -->
        <div class="chat-scroll-area">
          ${this.state.messages.length === 0 ? html`
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60%; text-align: center; gap: 12px; color: var(--text-muted);">
              <div style="font-family: var(--font-serif); font-size: 1.3rem; font-weight: 700; color: var(--text-ink);">
                LITERT-LM ON-DEVICE TERMINAL
              </div>
              <div style="font-size: 0.85rem; max-width: 480px; line-height: 1.6;">
                Local WebGPU Large Language Model Runner. Model weights compile in your browser memory and execute offline without external network calls.
              </div>
              <div class="pilot-lamp-group" style="margin-top: 8px;">
                <span class="pilot-lamp"><span class="lamp-bulb active"></span> READY</span>
                <span class="pilot-lamp"><span class="lamp-bulb active"></span> WEBGPU</span>
                <span class="pilot-lamp"><span class="lamp-bulb active"></span> PRIVACY</span>
              </div>
            </div>
          ` : this.state.messages.map((msg, index) => html`
            <div class="message-card ${msg.role === 'user' ? 'operator' : 'assistant'}">
              <div class="message-header">
                <span>${msg.role === 'user' ? 'OPERATOR // STATION' : `MK-IV // ${msg.senderName || 'ASSISTANT'}`}</span>
                ${msg.decodeSpeed ? html`<span class="nixie-badge">${msg.decodeSpeed}</span>` : ""}
              </div>

              ${msg.thoughtText && isThinkingEnabled ? html`
                <details style="background: var(--bg-inset); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 12px; margin-bottom: 6px; font-size: 0.82rem;">
                  <summary style="font-family: var(--font-mono); font-weight: 700; color: var(--amber-dark); cursor: pointer;">
                    COGNITIVE PROCESS (CoT Reasoning)
                  </summary>
                  <div style="margin-top: 6px; font-family: var(--font-mono); color: var(--text-muted); white-space: pre-wrap; line-height: 1.5;">
                    ${msg.thoughtText}
                  </div>
                </details>
              ` : ""}

              <div class="message-body">
                ${unsafeHTML(marked.parse(msg.text || ""))}
              </div>
            </div>
          `)}
        </div>

        <!-- Typewriter Ribbon Input Dock -->
        <div class="typewriter-input-dock">
          <form class="input-ribbon-row" @submit=${this.handlePromptSubmit}>
            
            <div class="typewriter-textarea-wrap">
              <textarea 
                id="chat-input-textarea"
                class="typewriter-textarea terminal-prompt-input"
                placeholder="Enter prompt into terminal ribbon... (Press Enter to transmit, Shift+Enter for new line)"
                @keydown=${this.handleTextareaKeyDown}
              ></textarea>
              <div class="ribbon-tag-bar">
                <span>STATUS: ${this.state.isGenerating ? 'PROCESSING...' : (this.state.isListening ? '🔴 LISTENING & TRANSCRIBING... (SPEAK INTO MIC)' : (this.state.statusText || 'AWAITING DISPATCH'))}</span>
                ${isRagEnabled && ragIndex && ragIndex.documents.size > 0 ? html`
                  <span style="color: var(--amber-dark); font-weight: bold;">RAG ARCHIVES ACTIVE (${ragIndex.documents.size} DOCS)</span>
                ` : ""}
              </div>
            </div>

            <!-- Voice STT Mic Key -->
            ${isSttEnabled ? html`
              <button 
                type="button" 
                id="btn-voice-stt"
                class="btn-typewriter-key ${this.state.isListening ? 'listening-pulse' : ''}"
                style="${this.state.isListening ? 'background: #dc2626; border-color: #991b1b; color: #ffffff;' : ''}"
                @click=${() => this.state.toggleListening()}
                title="${this.state.isListening ? 'Stop voice input' : 'Start voice input'}"
                aria-label="${this.state.isListening ? 'Stop voice input' : 'Start voice input'}"
              >
                ${this.state.isListening ? 'REC ●' : 'MIC 🎙'}
              </button>
            ` : ""}

            <!-- Transmit Key -->
            <button 
              type="submit" 
              class="btn-typewriter-key"
              style="background: linear-gradient(180deg, #d97706 0%, #b45309 100%); border-color: #78350f; color: #ffffff;"
              ?disabled=${this.state.isGenerating}
            >
              TRANSMIT ↵
            </button>

            ${this.state.isGenerating ? html`
              <button 
                type="button" 
                class="btn-typewriter-key"
                style="background: #dc2626; border-color: #991b1b; color: #ffffff;"
                @click=${() => this.state.stopGeneration()}
              >
                HALT ✕
              </button>
            ` : ""}

          </form>
        </div>

      </div>
    `;
  }
}
customElements.define("litert-chat-window", LiteRTChatWindow);

/**
 * LiteRTFeatureSwitchboard Component
 * Vintage modular patchbay modal for user preferences and feature flags.
 */
export class LiteRTFeatureSwitchboard extends LitElement {
  static properties = {
    isOpen: { type: Boolean, state: true }
  };

  constructor() {
    super();
    this.isOpen = false;
  }

  createRenderRoot() {
    return this;
  }

  toggleFeature(key) {
    LiteRTConfig.toggle(key);
    this.requestUpdate();
  }

  resetDefaults() {
    LiteRTConfig.reset();
    this.requestUpdate();
  }

  copyExportScript() {
    const script = LiteRTConfig.exportScript();
    navigator.clipboard.writeText(script).then(() => {
      alert("Configuration profile script copied to clipboard!");
    });
  }

  render() {
    if (!this.isOpen) return html``;

    const features = LiteRTConfig.getAll();

    return html`
      <div class="switchboard-overlay" @click=${() => this.isOpen = false}>
        <div class="switchboard-modal" @click=${(e) => e.stopPropagation()}>
          
          <div class="switchboard-header">
            <div style="font-family: var(--font-serif); font-size: 1.1rem; font-weight: 700; letter-spacing: 0.06em;">
              MODULAR SWITCHBOARD // FEATURE PREFERENCES
            </div>
            <button 
              style="background: none; border: none; color: #ffffff; font-size: 1.2rem; cursor: pointer;"
              @click=${() => this.isOpen = false}
            >✕</button>
          </div>

          <div class="switchboard-grid">
            ${Object.keys(DEFAULT_FEATURES).map(key => {
              const meta = FEATURE_METADATA[key] || { label: key, description: "", category: "System" };
              const isChecked = Boolean(features[key]);
              return html`
                <div class="switchboard-tile" style="cursor: pointer;" @click=${() => this.toggleFeature(key)}>
                  <div>
                    <div class="switch-label-title">${meta.label}</div>
                    <div class="switch-label-desc">${meta.description}</div>
                  </div>
                  <div class="toggle-switch-wrapper">
                    <span class="lamp-bulb ${isChecked ? 'active' : ''}"></span>
                    <label class="retro-toggle" @click=${(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        .checked=${isChecked} 
                        @change=${() => this.toggleFeature(key)}
                      />
                      <span class="retro-toggle-slider"></span>
                    </label>
                  </div>
                </div>
              `;
            })}
          </div>

          <div style="background: var(--bg-inset); border-top: 2px solid var(--border-strong); padding: 14px 20px; display: flex; justify-content: space-between; align-items: center;">
            <button 
              class="btn-tactile" 
              @click=${this.resetDefaults}
            >
              RESTORE DEFAULTS
            </button>
            <div style="display: flex; gap: 8px;">
              <button 
                class="btn-tactile" 
                @click=${this.copyExportScript}
              >
                EXPORT SCRIPT 📋
              </button>
              <button 
                class="btn-tactile primary" 
                @click=${() => this.isOpen = false}
              >
                SAVE & CLOSE
              </button>
            </div>
          </div>

        </div>
      </div>
    `;
  }
}
customElements.define("litert-feature-switchboard", LiteRTFeatureSwitchboard);

/**
 * LiteRTLMChatApp Component
 * Root App Shell with Vintage Command Header, Analog VU-Meter, and Archives.
 */
export class LiteRTLMChatApp extends LitElement {
  static properties = {
    isSidebarOpen: { type: Boolean, state: true }
  };

  constructor() {
    super();
    this.isSidebarOpen = false;
    this.state = window.ChatStateManager ? new window.ChatStateManager() : new ChatStateManager();
    window.chatApp = this;
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.state.addHost(this);
    this._unsubConfig = LiteRTConfig.subscribe(() => this.requestUpdate());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubConfig) this._unsubConfig();
  }

  openSwitchboard() {
    const switchboard = this.querySelector('litert-feature-switchboard');
    if (switchboard) {
      switchboard.isOpen = true;
    }
  }

  toggleLearnMore() {
    const drawer = document.querySelector(".sidebar-right");
    const overlay = document.querySelector(".sidebar-right-overlay");
    drawer?.classList.toggle("open");
    overlay?.classList.toggle("open");
  }

  render() {
    const isLearnMoreEnabled = LiteRTConfig.get('learnMoreDrawer');
    const needleDeg = Math.min(45, Math.max(-45, -45 + (this.state.liveTokensPerSec / 100) * 90));

    return html`
      <!-- Top Command Header -->
      <header class="terminal-header">
        <div class="header-left">
          <div class="brass-plate">
            <span class="brass-plate-title">LITERT-LM MK-IV</span>
            <span class="brass-plate-tag">LOCAL TERMINAL</span>
          </div>

          <div class="header-status-cluster">
            <div class="model-badge">
              <span>MODEL:</span>
              <span style="color: var(--amber-dark);">${this.state.selectedModelPath.split("/").pop() || "READY"}</span>
            </div>

            <div class="pilot-lamp-group">
              <span class="pilot-lamp"><span class="lamp-bulb active"></span> PWR</span>
              <span class="pilot-lamp"><span class="lamp-bulb ${this.state.engine ? 'active' : 'amber'}"></span> MDL</span>
              <span class="pilot-lamp"><span class="lamp-bulb active"></span> LNK</span>
            </div>
          </div>
        </div>

        <!-- VU-Meter and Actions -->
        <div style="display: flex; align-items: center; gap: 14px;">
          
          <!-- Generation Speedometer / VU-Meter -->
          <div class="vu-meter-container">
            <div class="vu-meter-dial">
              <div class="vu-dial-arc"></div>
              <div class="vu-needle" style="transform: rotate(${needleDeg}deg);"></div>
            </div>
            <div class="vu-readout">
              <div>${this.state.liveTokensPerSec} TK/S</div>
              <div style="font-size: 0.55rem; color: #94a3b8;">GEN RATE</div>
            </div>
          </div>

          <div class="header-actions">
            <button 
              class="btn-tactile" 
              @click=${this.openSwitchboard}
              title="Feature Flags & Preferences"
            >
              ⚙ CONFIG
            </button>

            ${isLearnMoreEnabled ? html`
              <button 
                class="btn-tactile" 
                @click=${this.toggleLearnMore}
                title="Laboratory Manual"
              >
                MANUAL ?
              </button>
            ` : ""}
          </div>
        </div>
      </header>

      <!-- Main Layout -->
      <div class="app-container">
        
        <!-- Left Hardware Rack Sidebar -->
        <aside class="sidebar">
          <litert-sidebar .state=${this.state}></litert-sidebar>

          <!-- Conversation Archives Manila Ledger -->
          <div class="hardware-card" style="margin-top: 8px;">
            <div class="hardware-card-title">
              <span>Session Archives</span>
              <button 
                class="btn-punch-action" 
                style="color: var(--sage); border-color: var(--sage);"
                @click=${() => this.state.startNewConversation()}
              >
                + NEW
              </button>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 4px; max-height: 140px; overflow-y: auto;">
              ${this.state.conversationsList.map(c => html`
                <div 
                  style="display: flex; justify-content: space-between; align-items: center; background: ${this.state.activeSavedConvId === c.id ? 'var(--bg-inset)' : 'transparent'}; border: 1px solid var(--border); padding: 4px 8px; border-radius: 2px; cursor: pointer; font-family: var(--font-mono); font-size: 0.7rem;"
                  @click=${() => this.state.selectConversation(c.id)}
                >
                  <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px; font-weight: ${this.state.activeSavedConvId === c.id ? '700' : '400'};">
                    ${c.title}
                  </span>
                  <button 
                    style="background: none; border: none; color: #ef4444; cursor: pointer;"
                    @click=${(e) => {
                      e.stopPropagation();
                      this.state.deleteConversation(c.id);
                    }}
                  >✕</button>
                </div>
              `)}
            </div>
          </div>
        </aside>

        <!-- Main Chat Window timeline panel -->
        <main style="flex: 1; display: flex; flex-direction: column; height: 100%; overflow: hidden;">
          <litert-chat-window .state=${this.state}></litert-chat-window>
        </main>

      </div>

      <!-- Modular Feature Switchboard Modal -->
      <litert-feature-switchboard></litert-feature-switchboard>
    `;
  }
}
customElements.define("litert-lm-chat-app", LiteRTLMChatApp);

/**
 * LiteRTLearnMore Component
 * Laboratory manual reference drawer.
 */
export class LiteRTLearnMore extends LitElement {
  createRenderRoot() {
    return this;
  }

  closeLearnMore() {
    const drawer = document.querySelector(".sidebar-right");
    const overlay = document.querySelector(".sidebar-right-overlay");
    drawer?.classList.remove("open");
    overlay?.classList.remove("open");
  }

  render() {
    return html`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid var(--border-strong); padding-bottom: 12px;">
        <div style="font-family: var(--font-serif); font-size: 1.15rem; font-weight: 700; color: var(--text-ink);">
          LABORATORY MANUAL // SPECIFICATION
        </div>
        <button class="btn-tactile" @click=${this.closeLearnMore}>CLOSE ✕</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 16px; font-size: 0.88rem; line-height: 1.6; color: var(--text-ink);">
        <div>
          <h4 style="font-family: var(--font-serif); margin: 0 0 6px 0; color: var(--amber-dark);">1. ARCHITECTURE OVERVIEW</h4>
          <p style="margin: 0;">
            LiteRT-LM compiles Large Language Model weights dynamically into GPU shaders using the browser's WebGPU interface. All token generations, KV cache caching, and matrix multiplications run purely on your hardware without server dependencies.
          </p>
        </div>

        <div>
          <h4 style="font-family: var(--font-serif); margin: 0 0 6px 0; color: var(--amber-dark);">2. DOCUMENT RAG KNOWLEDGE BASE</h4>
          <p style="margin: 0;">
            The built-in retrieval engine ingests PDF, Markdown, TXT, CSV, and JSON documents. It chunks text passages using a 400-character window with 100-character overlap, tokenizes across multilingual Unicode alphabets, and ranks passages using Okapi BM25 scores before injecting high-relevance citations into the prompt.
          </p>
        </div>

        <div>
          <h4 style="font-family: var(--font-serif); margin: 0 0 6px 0; color: var(--amber-dark);">3. OFFLINE WEIGHT PERSISTENCE</h4>
          <p style="margin: 0;">
            Model weights are stored in the browser's CacheStorage API under the "litertlm-models" cache container. Once downloaded, models operate completely offline without internet connectivity.
          </p>
        </div>

        <div>
          <h4 style="font-family: var(--font-serif); margin: 0 0 6px 0; color: var(--amber-dark);">4. MODULAR FEATURE SYSTEM</h4>
          <p style="margin: 0;">
            All system components (Avatar, Voice Audio, Code Sandbox, RAG Hub, Cache Storage) can be dynamically toggled via the CONFIG menu or programmatically through window.LiteRTConfig.
          </p>
        </div>
      </div>
    `;
  }
}
customElements.define("litert-learn-more", LiteRTLearnMore);
