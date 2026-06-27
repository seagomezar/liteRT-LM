import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3.1.2/+esm';
import { unsafeHTML } from 'https://cdn.jsdelivr.net/npm/lit@3.1.2/directives/unsafe-html/+esm';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12.0.0/+esm';
import hljs from 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/es/highlight.min.js';
import { ChatStateManager } from './state.js';

// Setup marked renderer with custom code block highlight integration
const renderer = new marked.Renderer();
renderer.code = function({ text, lang }) {
  const codeText = text;
  let language = lang ? lang.toLowerCase() : "";
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
    highlighted = codeText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    if (!language) language = "code";
  }

  // Base64 encode the raw code so Copy & HTML preview scripts can retrieve it safely without corruption
  const base64Code = btoa(unescape(encodeURIComponent(codeText)));
  
  return `
    <div class="code-container" data-code="${base64Code}" data-lang="${language}">
      <pre class="code-content-pre"><code class="hljs language-${language}">${highlighted}</code></pre>
    </div>
  `;
};

marked.use({ renderer });

/**
 * Phaser Scene for the procedural 2D cartoon avatar.
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

    // Head base (cute rounded rectangle with teal/blue border)
    this.headGraphics = this.add.graphics();
    this.headGraphics.fillStyle(0x151d30, 1);
    this.headGraphics.lineStyle(3, 0x00c99e, 1);
    this.headGraphics.fillRoundedRect(cx - 70, cy - 70, 140, 140, 30);
    this.headGraphics.strokeRoundedRect(cx - 70, cy - 70, 140, 140, 30);

    // Antenna
    this.antennaGraphics = this.add.graphics();
    this.antennaGraphics.lineStyle(4, 0x00c99e, 1);
    this.antennaGraphics.lineBetween(cx, cy - 70, cx, cy - 95);
    this.antennaTip = this.add.circle(cx, cy - 100, 8, 0x00c99e);

    // Eyes (glowing blue circles that blink)
    this.eyeLeft = this.add.circle(cx - 30, cy - 15, 12, 0x3b82f6);
    this.eyeRight = this.add.circle(cx + 30, cy - 15, 12, 0x3b82f6);
    this.eyeLeft.setStrokeStyle(2, 0xffffff);
    this.eyeRight.setStrokeStyle(2, 0xffffff);

    // Mouth graphics
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
    this.mouthGraphics.fillStyle(0x00c99e, 1);
    this.mouthGraphics.lineStyle(3, 0x00c99e, 1);

    const cx = 120;
    const cy = 120;
    const mouthY = cy + 25;
    const mouthWidth = 40;

    if (heightPercent <= 0.15) {
      this.mouthGraphics.lineBetween(cx - mouthWidth/2, mouthY, cx + mouthWidth/2, mouthY);
    } else {
      const openHeight = 25 * heightPercent;
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
    const idleOffset = Math.sin(this.timeCounter * 0.003) * 3;
    this.eyeLeft.y = 120 - 15 + idleOffset;
    this.eyeRight.y = 120 - 15 + idleOffset;
    this.antennaTip.y = 120 - 100 + idleOffset;

    const cx = 120;
    const cy = 120 + idleOffset;
    this.headGraphics.clear();
    this.headGraphics.fillStyle(0x151d30, 1);
    this.headGraphics.lineStyle(3, 0x00c99e, 1);
    this.headGraphics.fillRoundedRect(cx - 70, cy - 70, 140, 140, 30);
    this.headGraphics.strokeRoundedRect(cx - 70, cy - 70, 140, 140, 30);

    this.antennaGraphics.clear();
    this.antennaGraphics.lineStyle(4, 0x00c99e, 1);
    this.antennaGraphics.lineBetween(cx, cy - 70, cx, cy - 95);

    // Dynamic mouth shapes/flaps when speaking
    if (this.isSpeaking) {
      const mouthOpenness = 0.3 + Math.abs(Math.sin(this.timeCounter * 0.015)) * 0.7;
      this.drawMouth(mouthOpenness);
      const pulseScale = 1.0 + Math.sin(this.timeCounter * 0.02) * 0.3;
      this.antennaTip.setScale(pulseScale);
    } else {
      this.drawMouth(0.1);
      this.antennaTip.setScale(1.0);
    }
  }
}

/**
 * LiteRTAvatar Component
 * Manages the Phaser JS instance lifecycle and updates speaking state.
 */
export class LiteRTAvatar extends LitElement {
  static properties = {
    state: { type: Object }
  };

  constructor() {
    super();
    this.game = null;
    this.scene = null;
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.state.addHost(this);
    setTimeout(() => this.initPhaser(), 80);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.game) {
      this.game.destroy(true);
      this.game = null;
    }
  }

  initPhaser() {
    const container = this.querySelector('#phaser-avatar-container');
    if (!container || this.game || typeof Phaser === 'undefined') return;

    this.scene = new AvatarScene();
    const config = {
      type: Phaser.AUTO,
      width: 240,
      height: 200,
      parent: container,
      transparent: true,
      scene: [this.scene]
    };

    this.game = new Phaser.Game(config);
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    if (this.scene) {
      this.scene.isSpeaking = !!this.state.isSpeaking;
    }
  }

  render() {
    return html`
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; padding: 8px 0; border-bottom: 1px solid var(--border); background-color: var(--bg-card);">
        <div id="phaser-avatar-container" style="width: 240px; height: 200px; display: flex; align-items: center; justify-content: center;">
          ${typeof Phaser === 'undefined' ? html`<span style="color: var(--text-muted); font-size: 0.8rem;">Loading Phaser avatar...</span>` : ''}
        </div>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          <div class="status-indicator ${this.state.isSpeaking ? 'ready' : 'loading'}" style="width: 8px; height: 8px; margin: 0; background-color: ${this.state.isSpeaking ? 'var(--teal)' : '#64748b'};"></div>
          <span style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: ${this.state.isSpeaking ? 'var(--teal)' : 'var(--text-muted)'}; font-weight: bold;">
            ${this.state.isSpeaking ? 'Avatar Status: Speaking' : 'Avatar Status: Idle'}
          </span>
          ${this.state.isSpeaking ? html`
            <button 
              id="btn-stop-audio"
              class="btn-stop-audio"
              style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #ef4444; font-size: 0.65rem; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-weight: bold; transition: all 0.15s; margin-left: 4px;"
              @click=${() => this.state.stopSpeechOnly()}
              title="Stop speaking current response"
            >
              Stop Audio
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
 * Styled dropdown component representing options inside a custom container.
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
    return this; // Light DOM rendering for full CSS sharing
  }

  connectedCallback() {
    super.connectedCallback();
    this._onOutsideClick = this.onOutsideClick.bind(this);
    document.addEventListener("click", this._onOutsideClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("click", this._onOutsideClick);
  }

  onOutsideClick(e) {
    if (!this.contains(e.target)) {
      this.isOpen = false;
    }
  }

  toggleDropdown(e) {
    e.stopPropagation();
    this.isOpen = !this.isOpen;
  }

  handleItemSelect(e, val) {
    e.stopPropagation();
    this.value = val;
    this.isOpen = false;
    this.dispatchEvent(new CustomEvent("change", { detail: val }));
  }

  render() {
    const selectedItem = MODEL_LIST.find(m => m.path === this.value);
    const label = selectedItem ? selectedItem.name : "Select a model";

    return html`
      <div style="position: relative; width: 100%;">
        <button
          class="dropdown-button ${this.isOpen ? 'open' : ''}"
          style="display: flex; justify-content: space-between; align-items: center; width: 100%; box-sizing: border-box;"
          @click=${this.toggleDropdown}
        >
          ${label}
        </button>
        
        <div class="dropdown-content ${this.isOpen ? 'show' : ''}" style="width: 100%;">
          ${MODEL_LIST.map(m => {
            const isCached = window.ragIndex?.enabled && window.ragIndex; // Checks placeholders
            return html`
              <div class="dropdown-item" @click=${(e) => this.handleItemSelect(e, m.path)}>
                <span class="model-name">${m.name}</span>
                <span class="download-badge" style="font-size: 0.6rem; color: var(--text-muted); opacity: 0.65;">
                  ${m.size}
                </span>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }
}
customElements.define("custom-dropdown", CustomDropdown);


/**
 * LiteRTSidebar Component
 * Renders LLM model selection, parameter sliders, cache actions, and wraps the RAG index panel.
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
  }

  getTotalCacheSize() {
    let sizeBytes = 0;
    for (const [_, size] of this.state.cachedModels) {
      sizeBytes += size;
    }
    return `${(sizeBytes / 1e9).toFixed(2)} GB`;
  }

  handleModelChange(e) {
    const newPath = e.detail;
    if (this.state.selectedModelPath !== newPath) {
      this.state.selectedModelPath = newPath;
      this.state.saveSettings();
      this.state.loadModelWeights();
    }
  }

  handleRemoveCached(e, path) {
    e.stopPropagation();
    this.state.deleteModelFromCache(path);
  }

  handleSliderInput(e, property) {
    const target = e.target;
    let val;
    if (target.type === "checkbox") {
      val = target.checked;
    } else if (target.type === "number") {
      val = parseFloat(target.value);
    } else {
      val = target.value;
    }
    
    this.state[property] = val;
    this.state.saveSettings();
  }

  dismissSidebar() {
    const sidebar = document.querySelector(".sidebar");
    const overlay = document.querySelector(".sidebar-overlay");
    sidebar?.classList.remove("open");
    overlay?.classList.remove("open");
  }

  render() {
    return html`
      <!-- Model Selection Group -->
      <div class="control-group">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h2 class="section-title" style="margin: 0; border: none; padding: 0;">Model Selection</h2>
          <button id="btn-dismiss-sidebar" class="btn-dismiss-sidebar" aria-label="Dismiss Configurations" @click=${this.dismissSidebar}>Done</button>
        </div>
        
        <custom-dropdown
          .value=${this.state.selectedModelPath}
          @change=${this.handleModelChange}
        >
        </custom-dropdown>
        
        <!-- Caching Info & Actions -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 0.65rem; color: var(--text-muted);">
          <span>Total Cached: <b style="color: var(--teal); font-family: ui-monospace, monospace;">${this.getTotalCacheSize()}</b></span>
          ${this.state.cachedModels.size > 0 ? html`
            <button class="clear-all-btn" title="Clear all model cache" @click=${() => this.state.clearAllCache()}>Clear all</button>
          ` : ""}
        </div>
      </div>

      <!-- Inference Settings Sliders -->
      <div class="control-group" style="border-top: 1px solid var(--border); padding-top: 8px;">
        <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px;">
          <label for="chat-language" style="font-size: 0.65rem;">Agent Language</label>
          <select 
            id="chat-language" 
            .value=${this.state.chatLanguage} 
            style="padding: 8px 4px; font-size: 0.72rem; width: 100%; box-sizing: border-box;" 
            @change=${e => this.handleSliderInput(e, "chatLanguage")}
          >
            <option value="English">English</option>
            <option value="Spanish">Spanish (Español)</option>
            <option value="French">French (Français)</option>
            <option value="German">German (Deutsch)</option>
            <option value="Chinese">Chinese (中文)</option>
            <option value="Japanese">Japanese (日本語)</option>
            <option value="Portuguese">Portuguese (Português)</option>
            <option value="Italian">Italian (Italiano)</option>
          </select>
        </div>

        <div style="display: flex; gap: 10px; margin-bottom: 6px;">
          <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
            <label for="context-length" style="font-size: 0.65rem;">Context Length</label>
            <input 
              type="number" 
              id="context-length" 
              .value=${String(this.state.contextLength)} 
              min="256" max="8192" step="256" 
              style="padding: 8px 4px; font-size: 0.72rem; width: 100%; box-sizing: border-box; text-align: center;" 
              @input=${e => this.handleSliderInput(e, "contextLength")}
            >
          </div>
          <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
            <label for="max-output-tokens" style="font-size: 0.65rem;">Max Gen</label>
            <input 
              type="number" 
              id="max-output-tokens" 
              .value=${String(this.state.maxOutputTokens)} 
              min="1" max="4096" step="64" 
              style="padding: 8px 4px; font-size: 0.72rem; width: 100%; box-sizing: border-box; text-align: center;" 
              @input=${e => this.handleSliderInput(e, "maxOutputTokens")}
            >
          </div>
        </div>

        <div style="display: flex; gap: 6px; align-items: flex-end;">
          <div style="flex: 1.2; display: flex; flex-direction: column; gap: 4px;">
            <label for="sampler-type" style="font-size: 0.65rem;">Sampler</label>
            <select 
              id="sampler-type" 
              .value=${this.state.samplerType} 
              style="padding: 8px 2px; font-size: 0.7rem; width: 100%; box-sizing: border-box;" 
              @change=${e => this.handleSliderInput(e, "samplerType")}
            >
              <option value="greedy">Greedy</option>
              <option value="top_k">Top-K</option>
              <option value="top_p">Top-P</option>
            </select>
          </div>
          <div style="flex: 0.9; display: flex; flex-direction: column; gap: 4px;">
            <label for="temperature" style="font-size: 0.65rem;">Temp</label>
            <input 
              type="number" 
              id="temperature" 
              .value=${String(this.state.temperature)} 
              min="0.0" max="2.0" step="0.1" 
              style="padding: 8px 2px; font-size: 0.7rem; width: 100%; box-sizing: border-box; text-align: center;" 
              @input=${e => this.handleSliderInput(e, "temperature")}
            >
          </div>
          <div style="flex: 0.9; display: flex; flex-direction: column; gap: 4px;">
            <label for="top-p" style="font-size: 0.65rem;">Top-P</label>
            <input 
              type="number" 
              id="top-p" 
              .value=${String(this.state.topP)} 
              min="0.0" max="1.0" step="0.05" 
              style="padding: 8px 2px; font-size: 0.7rem; width: 100%; box-sizing: border-box; text-align: center;" 
              @input=${e => this.handleSliderInput(e, "topP")}
            >
          </div>
          <div style="flex: 0.9; display: flex; flex-direction: column; gap: 4px;">
            <label for="top-k" style="font-size: 0.65rem;">Top-K</label>
            <input 
              type="number" 
              id="top-k" 
              .value=${String(this.state.topK)} 
              min="1" max="256" step="4" 
              style="padding: 8px 2px; font-size: 0.7rem; width: 100%; box-sizing: border-box; text-align: center;" 
              @input=${e => this.handleSliderInput(e, "topK")}
            >
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; border-top: 1px dashed rgba(255, 255, 255, 0.1); padding-top: 8px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <input 
              type="checkbox" 
              id="enable-thinking" 
              .checked=${this.state.enableThinking} 
              style="margin: 0; cursor: pointer;" 
              @change=${e => this.handleSliderInput(e, "enableThinking")}
            >
            <label for="enable-thinking" style="font-size: 0.68rem; text-transform: none; cursor: pointer;">Enable Thinking (CoT)</label>
          </div>
          <button 
            style="background: none; border: none; color: var(--teal); font-size: 0.65rem; cursor: pointer; padding: 2px 4px; font-weight: bold;" 
            @click=${() => this.state.handleResetSettings()}
          >
            Reset
          </button>
        </div>
      </div>

      <!-- App Status Footer -->
      <div class="sidebar-status-footer">
        <div class="status-card">
          <div class="status-header">
            <span class="status-indicator ${this.state.isModelLoading ? 'loading' : (this.state.engine ? 'ready' : '')}"></span>
            <span>Status:</span>
          </div>
          <div class="status-text">${this.state.statusText}</div>
          ${this.state.statusCacheText ? html`<div class="status-text" style="color:#eab308; margin-top:4px;">${this.state.statusCacheText}</div>` : ""}
          
          ${this.state.isModelLoading ? html`
            <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
              ${Array.from(this.state.downloadProgresses.entries()).map(([filename, progress]) => {
                const speed = this.state.downloadSpeeds.get(filename) || "";
                return html`
                  <div style="font-size: 0.62rem; display: flex; justify-content: space-between; color: var(--teal);">
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px;">${filename}</span>
                    <span>${progress}%</span>
                  </div>
                  <div style="width: 100%; height: 4px; background-color: var(--border); border-radius: 2px; overflow: hidden;">
                    <div style="width: ${progress}%; height: 100%; background-color: var(--teal); transition: width 0.1s;"></div>
                  </div>
                  <div style="font-size: 0.58rem; color: var(--text-muted); text-align: right; margin-top: 2px;">
                    ${speed}
                  </div>
                `;
              })}
              ${this.state.downloadAbortController ? html`
                <button class="btn btn-secondary" style="width: 100%; font-size: 0.7rem; padding: 4px 8px; height: 22px; line-height: 1; color: #ef4444; border-color: rgba(239, 68, 68, 0.35);" @click=${() => this.state.cancelDownload()}>
                  Cancel Download
                </button>
              ` : ""}
            </div>
          ` : ""}

          <!-- Performance Metrics -->
          <div class="metrics-container" style="margin-top: 6px; display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--border); padding-top: 8px;">
            <div class="metric-row" style="display: flex; justify-content: space-between; font-size: 0.75rem; font-family: inherit;">
              <span style="color: var(--text-muted);">Load Time:</span>
              <span id="metric-load" class="metric-val" style="color: var(--teal); font-weight: bold;">${this.state.metricLoadTime}</span>
            </div>
          </div>
        </div>
        
        <!-- Placeholder for RAG System panel injected dynamically -->
        <div id="rag-sidebar-panel"></div>
      </div>
    `;
  }
}
customElements.define("litert-sidebar", LiteRTSidebar);


/**
 * LiteRTChatWindow Component
 * Renders chat history messages bubble timeline and prompt action items.
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
    this._onTextareaKeyDown = this.onTextareaKeyDown.bind(this);
  }

  firstUpdated() {
    // Expose global hooks for code copy and HTML preview
    window.previewHtml = (element) => {
      const b64 = element.getAttribute("data-code");
      if (b64) {
        try {
          const rawCode = decodeURIComponent(escape(atob(b64)));
          const iframe = document.getElementById("preview-iframe");
          const overlay = document.getElementById("preview-overlay");
          if (iframe && overlay) {
            iframe.srcdoc = rawCode;
            overlay.style.display = "flex";
          }
        } catch (err) {
          console.error("[LiteRT-LM] HTML decode failed:", err);
        }
      }
    };

    window.copyCodeBlock = (element) => {
      const b64 = element.getAttribute("data-code");
      if (b64) {
        try {
          const rawCode = decodeURIComponent(escape(atob(b64)));
          navigator.clipboard.writeText(rawCode).then(() => {
            element.textContent = "Copied!";
            setTimeout(() => { element.textContent = "Copy"; }, 2000);
          }).catch(err => console.error("[LiteRT-LM] Copy failed:", err));
        } catch (err) {
          console.error("[LiteRT-LM] Decode failed:", err);
        }
      }
    };
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    this.autoScrollToBottom();
    this.initializeCodeBlocks();
  }

  autoScrollToBottom() {
    const chatContainer = this.querySelector(".chat-messages");
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  initializeCodeBlocks() {
    // Process code blocks inside markdown replies to inject modern headers
    this.querySelectorAll(".code-container").forEach(container => {
      if (container.querySelector(".code-header")) return;
      
      const b64 = container.getAttribute("data-code") || "";
      const lang = container.getAttribute("data-lang") || "";
      
      const headerDiv = document.createElement("div");
      headerDiv.className = "code-header";
      
      const langSpan = document.createElement("span");
      langSpan.className = "code-lang";
      langSpan.textContent = lang;
      headerDiv.appendChild(langSpan);
      
      const actionsDiv = document.createElement("div");
      actionsDiv.style.display = "flex";
      actionsDiv.style.gap = "6px";
      
      // If language is html, add a Live Preview trigger
      if (lang === "html" || lang === "xml") {
        const previewBtn = document.createElement("button");
        previewBtn.className = "btn-preview-code";
        previewBtn.textContent = "Preview";
        previewBtn.setAttribute("data-code", b64);
        previewBtn.addEventListener("click", () => window.previewHtml(previewBtn));
        actionsDiv.appendChild(previewBtn);
      }
      
      const copyBtn = document.createElement("button");
      copyBtn.className = "btn-copy-code";
      copyBtn.textContent = "Copy";
      copyBtn.setAttribute("data-code", b64);
      copyBtn.addEventListener("click", () => window.copyCodeBlock(copyBtn));
      actionsDiv.appendChild(copyBtn);
      
      headerDiv.appendChild(actionsDiv);
      container.insertBefore(headerDiv, container.firstChild);
    });
  }

  onTextareaKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.handleSend();
    }
  }

  handleSend() {
    const textarea = this.querySelector("#chat-input-textarea");
    if (textarea && textarea.value.trim() && !this.state.isGenerating) {
      const text = textarea.value.trim();
      textarea.value = "";
      this.state.sendMessage(text);
    }
  }

  handleStarterClick(text) {
    if (!this.state.isGenerating) {
      this.state.sendMessage(text);
    }
  }

  render() {
    return html`
      <litert-avatar .state=${this.state}></litert-avatar>
      <div class="chat-messages">
        ${this.state.messages.length === 0 ? html`
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; color: var(--text-muted); gap: 12px; opacity: 0.75; text-align: center; padding: 24px;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--teal);"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <h3 style="margin: 0; color: #ffffff;">LiteRT-LM Local WebGPU Chat</h3>
            <p style="font-size: 0.85rem; max-width: 320px; margin: 0; line-height: 1.4;">
              Chat runs 100% locally in your browser with WebGPU acceleration. No data leaves your machine.
            </p>
          </div>
        ` : this.state.messages.map((m, idx) => {
          const isUser = m.role === "user";
          return html`
            <div class="message-bubble ${isUser ? 'user' : 'assistant'}">
              <span class="message-sender ${isUser ? 'user' : 'assistant'}">
                ${m.senderName || (isUser ? 'User' : 'Assistant')}
              </span>
              
              <!-- Thought block (CoT) -->
              ${!isUser && m.thoughtText ? html`
                <details class="thought-details" ?open=${true}>
                  <summary class="thought-summary">Thought Process</summary>
                  <div class="thought-content">
                    ${m.thoughtText.split('\n').map(p => html`<p>${p}</p>`)}
                  </div>
                </details>
              ` : ""}

              <!-- Message contents -->
              <div class="message-content">
                ${isUser ? html`
                  <div class="message-user-text">${m.text}</div>
                ` : html`
                  <div>${unsafeHTML(marked.parse(m.text || ""))}</div>
                `}
              </div>

              <!-- Message footer & action speeds metrics -->
              <div class="message-actions">
                ${!isUser && m.decodeSpeed ? html`
                  <span class="message-stats">
                    pref: <b>${m.prefillSpeed || '-'}</b>
                    dec: <b>${m.decodeSpeed || '-'}</b>
                    tokens: <b>${m.tokensCount || '-'}</b>
                  </span>
                ` : ""}

                ${isUser ? html`
                  <button class="btn-action" @click=${() => this.state.rewindConversation(idx)}>Edit</button>
                ` : html`
                  <button class="btn-action" @click=${() => this.state.redoResponse(idx)}>Retry</button>
                `}
              </div>
            </div>
          `;
        })}
      </div>

      <!-- Quick starter prompts -->
      ${this.state.messages.length === 0 ? html`
        <div class="starters-container">
          <button class="btn-starter" ?disabled=${this.state.isModelLoading || this.state.isGenerating} @click=${() => this.handleStarterClick("Explain WebGPU in simple terms.")}>Explain WebGPU</button>
          <button class="btn-starter" ?disabled=${this.state.isModelLoading || this.state.isGenerating} @click=${() => this.handleStarterClick("Write a clean HTML page with canvas particle effects.")}>Particle Effect HTML</button>
          <button class="btn-starter" ?disabled=${this.state.isModelLoading || this.state.isGenerating} @click=${() => this.handleStarterClick("Build a CSS-only glowing button container.")}>CSS Glow Button</button>
        </div>
      ` : ""}

      <!-- Input timeline row -->
      <div class="chat-input-container">
        <button 
          class="btn ${this.state.isListening ? 'btn-stop' : 'btn-secondary'}" 
          style="height: 40px; width: 40px; min-width: 40px; padding: 0; border-radius: 8px; margin-bottom: 4px; display: inline-flex; align-items: center; justify-content: center;"
          title=${this.state.isListening ? "Stop listening" : "Start voice input"}
          ?disabled=${this.state.isModelLoading || this.state.isGenerating}
          @click=${() => this.state.toggleListening()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${this.state.isListening ? html`
              <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
            ` : html`
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            `}
          </svg>
        </button>

        <div class="input-textarea-wrapper">
          <textarea
            id="chat-input-textarea"
            aria-label="Chat input message"
            placeholder=${this.state.isModelLoading ? "Loading model weights..." : (this.state.isListening ? "Listening..." : "Type your message here... (Enter to send)")}
            ?disabled=${this.state.isModelLoading || this.state.isListening}
            @keydown=${this._onTextareaKeyDown}
          ></textarea>
        </div>
        ${this.state.isGenerating ? html`
          <button class="btn btn-stop btn-input-send" @click=${() => this.state.stopGeneration()}>Stop</button>
        ` : html`
          <button 
            class="btn btn-primary btn-input-send" 
            ?disabled=${this.state.isModelLoading || this.state.isListening}
            @click=${this.handleSend}
          >
            Send
          </button>
        `}
      </div>
    `;
  }
}
customElements.define("litert-chat-window", LiteRTChatWindow);


/**
 * LiteRTLMChatApp Top-Level Shell Component
 * Coordinates sidebar toggles, headers, overlays, and mounts the conversation context.
 */
export class LiteRTLMChatApp extends LitElement {
  static properties = {
    isSidebarOpen: { type: Boolean, state: true },
    state: { type: Object, state: true },
    editingConvId: { type: String, state: true },
    editingTitleValue: { type: String, state: true }
  };

  constructor() {
    super();
    this.state = new ChatStateManager();
    this.state.addHost(this);
    this.isSidebarOpen = false;
    this.editingConvId = null;
    this.editingTitleValue = '';
  }

  connectedCallback() {
    super.connectedCallback();
    const overlay = document.querySelector(".sidebar-right-overlay");
    if (overlay) {
      overlay.addEventListener("click", () => {
        const drawer = document.querySelector(".sidebar-right");
        drawer?.classList.remove("open");
        overlay.classList.remove("open");
      });
    }
  }

  createRenderRoot() {
    return this;
  }

  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
    const sidebar = this.querySelector(".sidebar");
    const overlay = this.querySelector(".sidebar-overlay");
    if (this.isSidebarOpen) {
      sidebar?.classList.add("open");
      overlay?.classList.add("open");
    } else {
      sidebar?.classList.remove("open");
      overlay?.classList.remove("open");
    }
  }

  toggleLearnMore() {
    const drawer = document.querySelector(".sidebar-right");
    const overlay = document.querySelector(".sidebar-right-overlay");
    drawer?.classList.toggle("open");
    overlay?.classList.toggle("open");
  }

  startNewChat() {
    this.state.startNewConversation();
  }

  handleSavedClick(id) {
    this.state.selectConversation(id);
  }

  handleDeleteConv(e, id) {
    e.stopPropagation();
    this.state.deleteConversation(id);
  }

  startRename(e, id, title) {
    e.stopPropagation();
    this.editingConvId = id;
    this.editingTitleValue = title;
    setTimeout(() => {
      const input = this.querySelector('.rename-input');
      if (input) {
        input.focus();
        input.select();
      }
    }, 50);
  }

  handleRenameKeyDown(e, id) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.saveRename(id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.cancelRename();
    }
  }

  handleSaveRenameClick(e, id) {
    e.stopPropagation();
    this.saveRename(id);
  }

  handleCancelRenameClick(e) {
    e.stopPropagation();
    this.cancelRename();
  }

  saveRename(id) {
    if (this.editingConvId === id) {
      const val = this.editingTitleValue.trim();
      if (val) {
        this.state.renameConversation(id, val);
      }
      this.cancelRename();
    }
  }

  cancelRename() {
    this.editingConvId = null;
    this.editingTitleValue = '';
  }


  render() {
    return html`
      <header>
        <div style="display: flex; align-items: center; gap: 12px;">
          <button class="btn-toggle-sidebar" aria-label="Toggle configurations sidebar" @click=${this.toggleSidebar}>☰</button>
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="./assets/LiteRT_Logo_Symbol-only_RGB_Color_Teal.png" alt="LiteRT Logo" style="height: 24px; width: auto;">
            <div>
              <h1>LiteRT-LM.js Chat</h1>
              <div class="header-subtitle">Fully Local WebGPU Inference</div>
            </div>
          </div>
        </div>
        <button class="btn-toggle-learn-more" @click=${this.toggleLearnMore}>Learn More</button>
      </header>

      <div class="app-container">
        <!-- Overlay backdrop for mobile configuration drawer -->
        <div class="sidebar-overlay" @click=${this.toggleSidebar}></div>

        <!-- Sidebar left panel drawer -->
        <aside class="sidebar">
          <litert-sidebar .state=${this.state}></litert-sidebar>
          
          <!-- Saved History List -->
          <div class="control-group" style="display: flex; flex-direction: column; border-top: 1px solid var(--border); padding-top: 8px;">
            <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">Saved Conversations</span>
            <button class="conv-item new-chat-item" @click=${this.startNewChat}>+ New Chat</button>
            <div class="conversations-list">
              ${this.state.conversationsList.map(c => {
                const isActive = this.state.activeSavedConvId === c.id;
                const isEditing = this.editingConvId === c.id;
                return html`
                  <div class="conv-item ${isActive ? 'active' : ''} ${isEditing ? 'editing' : ''}" @click=${() => this.handleSavedClick(c.id)}>
                    ${isEditing ? html`
                      <input 
                        class="rename-input" 
                        aria-label="Rename conversation"
                        .value=${this.editingTitleValue}
                        @click=${(e) => e.stopPropagation()}
                        @input=${(e) => this.editingTitleValue = e.target.value}
                        @keydown=${(e) => this.handleRenameKeyDown(e, c.id)}
                        style="flex: 1; min-width: 0; margin-right: 4px;"
                      />
                      <div style="display: flex; gap: 2px;">
                        <button class="btn-rename-save" title="Save" @click=${(e) => this.handleSaveRenameClick(e, c.id)}>✓</button>
                        <button class="btn-rename-cancel" title="Cancel" @click=${(e) => this.handleCancelRenameClick(e)}>✕</button>
                      </div>
                    ` : html`
                      <span class="conv-title">${c.title}</span>
                      <div class="conv-actions">
                        <button class="btn-rename-conv" title="Rename conversation" @click=${(e) => this.startRename(e, c.id, c.title)}>✎</button>
                        <button class="btn-delete-conv" title="Delete conversation" @click=${(e) => this.handleDeleteConv(e, c.id)}>✕</button>
                      </div>
                    `}
                  </div>
                `;
              })}
            </div>
          </div>
        </aside>

        <!-- Main Chat Window timeline panel -->
        <main class="chat-panel">
          <litert-chat-window .state=${this.state}></litert-chat-window>
        </main>
      </div>
    `;
  }
}
customElements.define("litert-lm-chat-app", LiteRTLMChatApp);

/**
 * LiteRTLearnMore Component
 * Renders local educational documentation drawer.
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
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 class="section-title" style="margin: 0; border: none; padding: 0;">Learn More</h2>
        <button class="btn-dismiss-right-drawer" @click=${this.closeLearnMore}>Done</button>
      </div>
      <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; padding-right: 4px; font-size: 0.85rem; line-height: 1.5; color: #cbd5e1;">
        <div>
          <h3 style="margin-top: 0; color: #ffffff;">About LiteRT-LM.js</h3>
          <p>
            LiteRT-LM.js is a zero-dependency, ultra-fast local inference engine that runs Large Language Models directly on your graphics hardware via WebGPU.
          </p>
        </div>
        <div>
          <h3 style="color: #ffffff;">WebGPU Acceleration</h3>
          <p>
            By utilizing the browser's WebGPU API, LiteRT-LM compiles model weights dynamically into GPU shaders, providing high token generation speeds entirely on-device. No data is sent to external servers.
          </p>
        </div>
        <div>
          <h3 style="color: #ffffff;">Local Document RAG</h3>
          <p>
            The built-in Retrieval-Augmented Generation (RAG) system tokenizes and indexes text files locally in-memory using TF-IDF. Relevant text snippets are automatically injected into the model prompt when asking questions.
          </p>
        </div>
        <div>
          <h3 style="color: #ffffff;">Model Caching</h3>
          <p>
            Models are securely cached using the browser's Cache Storage API. Once downloaded, the application works fully offline.
          </p>
        </div>
      </div>
    `;
  }
}
customElements.define("litert-learn-more", LiteRTLearnMore);
