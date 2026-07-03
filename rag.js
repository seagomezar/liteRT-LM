// RAG UI glue for LiteRT-LM Chat.
//
// The RAG core (tokenizer, LocalRAGIndex, TF-IDF search) lives in ./src/rag.js,
// which is the single source of truth exercised by the unit tests. Importing it
// here for its side effect binds `window.ragIndex` and `window.getRagPrompt`, so
// this file only owns the sidebar UI and PDF ingestion built on top of that core.
import "./src/rag.js";

// Injects RAG UI Panel into sidebar when the container elements are added to DOM
function initializeRagUI(panel) {
  panel.dataset.initialized = "true";

  panel.innerHTML = `
    <div class="rag-container" style="border-top: 1px solid var(--border); padding-top: 12px; margin-top: 12px; display: flex; flex-direction: column; gap: 10px;">
      <div class="rag-header" style="display: flex; justify-content: space-between; align-items: center; user-select: none;">
        <h2 class="section-title" style="margin: 0; border: none; padding-bottom: 0; font-size: 0.85rem; color: var(--teal); display: flex; align-items: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Document RAG Hub
        </h2>
        <div style="display: flex; align-items: center; gap: 8px;">
          <label class="switch" for="rag-toggle" style="position: relative; display: inline-block; width: 32px; height: 18px; margin: 0;">
            <span style="display: none;">Enable Document RAG Hub</span>
            <input type="checkbox" id="rag-toggle" aria-label="Enable Document RAG Hub" checked style="opacity: 0; width: 0; height: 0;">
            <span class="slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #334155; transition: .3s; border-radius: 18px;"></span>
          </label>
        </div>
      </div>

      <style>
        .switch input:checked + .slider {
          background-color: var(--teal);
        }
        .switch input:checked + .slider:before {
          transform: translateX(14px);
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 12px;
          width: 12px;
          left: 3px;
          bottom: 3px;
          background-color: #0b0f19;
          transition: .3s;
          border-radius: 50%;
        }

        .rag-upload-zone {
          border: 1px dashed var(--border);
          border-radius: 8px;
          padding: 12px;
          text-align: center;
          background-color: var(--bg-input);
          cursor: pointer;
          transition: border-color 0.2s, background-color 0.2s;
        }
        .rag-upload-zone:hover {
          border-color: var(--teal);
          background-color: rgba(0, 201, 158, 0.04);
        }

        .rag-doc-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 0.72rem;
          margin-bottom: 4px;
        }
        .rag-doc-item:hover {
          border-color: rgba(0, 201, 158, 0.3);
        }

        .rag-console-logs {
          background-color: #05070c;
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 8px;
          font-family: ui-monospace, monospace;
          font-size: 0.65rem;
          color: #94a3b8;
          max-height: 90px;
          overflow-y: auto;
          white-space: pre-wrap;
        }
      </style>

      <div class="rag-content" style="display: flex; flex-direction: column; gap: 8px;">
        <!-- Drag & drop zone -->
        <div id="rag-drop-zone" class="rag-upload-zone">
          <label for="rag-file-input" style="font-size: 0.7rem; color: var(--text-muted); font-weight: 500; cursor: pointer; display: block; width: 100%; height: 100%; text-align: center;">
            Drag & drop or <b style="color: var(--teal);">Browse</b>
          </label>
          <input type="file" id="rag-file-input" aria-label="Upload Documents" multiple accept=".txt,.md,.json,.csv,.pdf" style="display: none;">
        </div>

        <!-- Stats -->
        <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--text-muted); padding: 0 2px;">
          <span>Documents: <b id="rag-doc-count" style="color: var(--text);">0</b></span>
          <span>Total Chunks: <b id="rag-chunk-count" style="color: var(--text);">0</b></span>
        </div>

        <!-- Document List -->
        <div id="rag-doc-list" style="max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;">
        </div>

        <!-- Logs console -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em;">RAG Activity Log</span>
          <button id="rag-clear-logs" style="background: none; border: none; color: #ef4444; font-size: 0.62rem; cursor: pointer; padding: 2px;">Clear Logs</button>
        </div>
        <div id="rag-logs" class="rag-console-logs">System ready. Upload a document to start.</div>
      </div>
    </div>
  `;

  const toggle = panel.querySelector("#rag-toggle");
  const fileInput = panel.querySelector("#rag-file-input");
  const dropZone = panel.querySelector("#rag-drop-zone");
  const docList = panel.querySelector("#rag-doc-list");
  const docCount = panel.querySelector("#rag-doc-count");
  const chunkCount = panel.querySelector("#rag-chunk-count");
  const logsDiv = panel.querySelector("#rag-logs");
  const clearLogsBtn = panel.querySelector("#rag-clear-logs");

  // Sync state
  toggle.checked = window.ragIndex.enabled;

  toggle.addEventListener("change", (e) => {
    if (e.target.checked) window.ragIndex.enable();
    else window.ragIndex.disable();
  });

  dropZone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileSelect);

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "var(--teal)";
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.style.borderColor = "var(--border)";
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "var(--border)";
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  });

  clearLogsBtn.addEventListener("click", () => {
    window.ragIndex.logs = [];
    renderLogs();
  });

  function handleFileSelect(e) {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  }

  window.ragIndex.loadPdfJS = async function () {
    if (window.pdfjsLib) return window.pdfjsLib;

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js";
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      };
      script.onerror = () => {
        reject(new Error("Failed to load PDF.js from CDN."));
      };
      document.head.appendChild(script);
    });
  };

  function handleFiles(files) {
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        window.ragIndex.addLog(
          `Warning: "${file.name}" is too large (>10MB). Rejected.`,
        );
        continue;
      }
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith(".pdf")) {
        window.ragIndex.addLog(`Processing PDF: "${file.name}"...`);
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const pdfjsLib = await window.ragIndex.loadPdfJS();
            const arrayBuffer = event.target.result;
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;

            let fullText = "";
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              const pageText = textContent.items
                .map((item) => item.str)
                .join(" ");
              fullText += pageText + "\n";
            }

            if (fullText.trim().length === 0) {
              window.ragIndex.addLog(
                `Warning: No text extracted from PDF "${file.name}". Maybe it is scanned/image-only?`,
              );
            } else {
              window.ragIndex.addDocument(file.name, fullText);
            }
          } catch (err) {
            console.error(err);
            window.ragIndex.addLog(
              `Error parsing PDF "${file.name}": ${err.message}`,
            );
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target.result;
          window.ragIndex.addDocument(file.name, text);
        };
        reader.readAsText(file);
      }
    }
  }

  // Subscribe UI to index updates
  window.ragIndex.addListener(() => {
    updateUI();
  });

  function updateUI() {
    const contentDiv = panel.querySelector(".rag-content");
    if (window.ragIndex.enabled) {
      contentDiv.style.opacity = "1";
      contentDiv.style.pointerEvents = "auto";
      toggle.checked = true;
    } else {
      contentDiv.style.opacity = "0.5";
      contentDiv.style.pointerEvents = "none";
      toggle.checked = false;
    }

    docCount.textContent = window.ragIndex.documents.size;
    chunkCount.textContent = window.ragIndex.chunks.length;

    docList.innerHTML = "";
    for (const [filename, text] of window.ragIndex.documents.entries()) {
      const docChunks = window.ragIndex.chunks.filter(
        (c) => c.filename === filename,
      );
      const item = document.createElement("div");
      item.className = "rag-doc-item";
      item.innerHTML = `
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;" title="${filename}">
          ${filename} (${docChunks.length} chk)
        </span>
        <button class="delete-doc-btn" data-filename="${filename}" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.72rem; padding: 2px 4px;">✕</button>
      `;
      item.querySelector(".delete-doc-btn").addEventListener("click", (e) => {
        const fname = e.target.dataset.filename;
        window.ragIndex.removeDocument(fname);
      });
      docList.appendChild(item);
    }

    renderLogs();
  }

  function renderLogs() {
    if (window.ragIndex.logs.length === 0) {
      logsDiv.textContent = "No logs.";
    } else {
      logsDiv.textContent = window.ragIndex.logs.join("\n");
    }
  }

  updateUI();
}

// Observe DOM updates to initialize panel whenever litert-sidebar renders
function startObserver() {
  const panel = document.getElementById("rag-sidebar-panel");
  if (panel && !panel.dataset.initialized) {
    initializeRagUI(panel);
  }

  const observer = new MutationObserver(() => {
    const p = document.getElementById("rag-sidebar-panel");
    if (p && !p.dataset.initialized) {
      initializeRagUI(p);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startObserver);
} else {
  startObserver();
}
