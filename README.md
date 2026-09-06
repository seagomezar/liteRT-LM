# LiteRT-LM MK-IV Analog Terminal

[![Deploy to GitHub Pages](https://github.com/seagomezar/liteRT-LM/actions/workflows/deploy.yml/badge.svg)](https://github.com/seagomezar/liteRT-LM/actions/workflows/deploy.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

An on-device, WebGPU-accelerated Large Language Model (LLM) terminal interface built with **Google LiteRT-LM (`@litert-lm/core`)**, LitElement, Phaser 3, and an **Analog Precision** vintage industrial aesthetic.

All model inference, tokenization, KV caching, and document retrieval (RAG) run **100% locally on your device's GPU** inside the browser—zero external cloud inference calls.

---

## ⚡ Browser Requirements & Flags

LiteRT-LM uses the browser's **WebGPU** interface and WGSL compute shaders. For optimal performance:

### 1. Browser & Hardware Acceleration
* **Recommended Browsers**: Google Chrome (v113+) or Microsoft Edge (v113+).
* **Hardware Acceleration**: Must be **enabled**.
  * Go to `chrome://settings/system` (or `edge://settings/system`).
  * Ensure **"Use graphics acceleration when available"** is turned **ON**.
* **Check WebGPU Status**:
  * Visit `chrome://gpu` and verify that **WebGPU** is listed as `Hardware accelerated`.

### 2. Recommended Chrome / Edge Flags (`chrome://flags`)
If you experience shader compilation warnings or WebGPU is disabled on your system:

| Flag | Recommended Value | Reason |
| :--- | :--- | :--- |
| `chrome://flags/#enable-webgpu-developer-features` | **Enabled** | Unlocks experimental WGSL shader extensions, including **Subgroups**, which LiteRT-LM uses for fast SIMD cross-lane communication. |
| `chrome://flags/#enable-unsafe-webgpu` | **Enabled** *(optional)* | Bypasses GPU driver blocklists on older Intel/AMD/NVIDIA graphics cards or Linux environments. |
| `chrome://flags/#ignore-gpu-blocklist` | **Enabled** *(optional)* | Overrides Chrome's software fallback if your GPU driver version is on an internal blocklist. |

### 3. Secure Context Requirement
WebGPU and the Web Speech API (Microphone transcription) **strictly require a Secure Context**:
* ✅ `https://your-domain.github.io/liteRT-LM/`
* ✅ `http://localhost:8080/` or `http://127.0.0.1:8080/`
* ❌ `http://192.168.x.x` or plain `http://` domain (WebGPU and Mic will be disabled by browser security policies).

### 4. Memory (RAM / VRAM) & Disk Space
* **RAM/VRAM**: At least **4 GB to 8 GB** of free system memory is recommended.
* **Storage Quota**: The default model `gemma-4-E2B-it-web.litertlm` is **~1.9 GB**. Chrome requires enough quota in `CacheStorage` to persist model weights. Do not use strict Incognito mode if you want offline model caching.

---

## 🚀 Initial App Setup & First Prompt

1. **Launch the Application**:
   * Open the app in your browser (e.g. `http://localhost:8080` or the GitHub Pages URL).
2. **First Transmission**:
   * Type your prompt into the **typewriter ribbon** at the bottom (or press the **MIC 🎙** button for voice speech-to-text).
   * Press **Enter** or click **TRANSMIT ↵**.
3. **Weight Download & Compilation**:
   * Your prompt appears immediately in the chat ledger as `OPERATOR // STATION`.
   * An assistant placeholder card displays:
     `*[Compiling WebGPU shaders & loading model weights...]*`
   * The terminal checks if weights exist in browser cache (`litertlm-models`).
   * If not cached, it streams the download of `gemma-4-E2B-it-web.litertlm` (~1.9 GB) from Hugging Face with live download MB/s progress.
   * Shaders compile in your GPU memory. Once ready, the top `MDL` pilot lamp lights up green.
4. **Offline Local Loading (Alternative)**:
   * If you have already downloaded a `.litertlm` model file locally, click **📁 LOAD LOCAL .LITERTLM FILE** in the **MODEL TUNER RACK** (left sidebar). This loads and compiles the weights instantly without internet.

---

## ⚙️ Modular Feature Switchboard

Click the **⚙ CONFIG** button in the top navigation bar to open the vintage patchbay modal. You can toggle any subsystem dynamically without refreshing the page:

* **Cathode Avatar**: 2D procedural robot face with real-time lip sync during TTS speech.
* **Document RAG Cabinet**: Ingest PDFs, Markdown, TXT, CSV, or JSON for Okapi BM25 prompt augmentation.
* **Voice TTS / STT**: Speech synthesis audio output and continuous microphone transcription.
* **Code Preview**: Interactive sandbox for HTML/SVG generated code blocks.
* **Offline Model Cache**: CacheStorage persistence toggle and cache purger.
* **Thinking Process**: CoT reasoning collapsible accordion.
* **Export Script**: Download or copy your configuration profile as a portable JavaScript snippet.

---

## 🛠️ Local Development & Testing

```bash
# Clone the repository
git clone https://github.com/seagomezar/liteRT-LM.git
cd liteRT-LM

# Install dependencies
npm install

# Run automated unit test suite (64 tests)
npm test

# Start local development server
npm start
# Open http://localhost:8080 in Chrome / Edge
```

---

## 📄 Architecture & Tech Stack

* **Inference Engine**: [`@litert-lm/core`](https://ai.google.dev/edge/litert-lm/js) (WebGPU / WGSL / WASM)
* **UI Components**: [LitElement 3.1.2](https://lit.dev/)
* **Procedural Avatar**: [Phaser 3.80.1](https://phaser.io/)
* **RAG Engine**: Pure in-memory Okapi BM25 ranking with Unicode tokenization
* **Markdown & Syntax**: Marked v12 + Highlight.js (Punch-card styling)
