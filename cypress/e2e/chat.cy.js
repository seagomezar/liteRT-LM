describe("LiteRT-LM WebGPU Chat UI E2E Ground Truth Tests", () => {
  beforeEach(() => {
    // Visit the app
    cy.visit("/");

    // Mock confirm dialogs to always return true
    cy.on("window:confirm", () => true);

    // Get the state manager instance from the Lit component shell to stub engine compilation and downloads
    cy.get("litert-lm-chat-app").then(($el) => {
      const app = $el[0];
      const state = app.state;

      // Stub loadModelWeights to succeed instantly without downloading 2GB models
      cy.stub(state, "loadModelWeights").callsFake(() => {
        state.isModelLoading = false;
        state.statusText = "Model loaded and ready.";
        state.requestUpdate();
        return Promise.resolve();
      });

      // Stub sendMessage to execute instant mocked inference stream
      cy.stub(state, "sendMessage").callsFake((prompt) => {
        state.isGenerating = true;
        state.statusText = "Thinking...";
        state.messages.push({
          role: "user",
          text: prompt,
          senderName: "User",
          tokensCount: "5",
        });
        state.requestUpdate();

        setTimeout(() => {
          state.messages.push({
            role: "assistant",
            text: "This is a **mocked response** for: " + prompt,
            senderName: "Bot",
            thoughtText: "Stubbed thinking phase.",
            decodeSpeed: "45 tk/s",
            prefillSpeed: "120 tk/s",
            tokensCount: "15",
          });
          state.isGenerating = false;
          state.statusText = "Generation completed.";
          state.requestUpdate();
          state.commitActiveChatHistory();
        }, 50);
      });
    });
  });

  it("renders analog precision terminal structure and starter elements", () => {
    cy.get(".terminal-header").should("contain", "LITERT-LM MK-IV");
    cy.get(".sidebar").should("be.visible");
    cy.get(".chat-scroll-area").should("contain", "LITERT-LM ON-DEVICE TERMINAL");
    cy.get("#chat-input-textarea").should("be.visible");
    cy.get("litert-avatar").should("be.visible");
    cy.get(".vu-meter-dial").should("be.visible");
    cy.get("#btn-voice-stt").should("be.visible");
    cy.get('button:contains("TRANSMIT ↵")').should("be.visible");
  });

  it("updates hardware tuner sliders and state properties", () => {
    // Temperature slider
    cy.get(".fader-control input.hardware-slider").first().as("tempSlider");
    cy.get("@tempSlider").invoke("val", "0.8").trigger("input");
    cy.get("litert-lm-chat-app").then(($el) => {
      assert.strictEqual($el[0].state.temperature, 0.8);
    });

    // Verify state persists in localStorage
    cy.window().then((win) => {
      const settings = JSON.parse(
        win.localStorage.getItem("litertlm-chat-settings") || "{}"
      );
      assert.strictEqual(settings.temperature, 0.8);
    });
  });

  it("interacts with custom model selection dropdown", () => {
    cy.get("custom-dropdown .btn-tactile").click();
    cy.get("custom-dropdown").should("contain", "Gemma 4 E4B");
    cy.contains("Gemma 4 E4B").click();
    cy.get("litert-lm-chat-app").then(($el) => {
      assert.ok($el[0].state.selectedModelPath.toLowerCase().includes("gemma-4-e4b"));
    });
  });

  it("submits prompt from ribbon dock and displays message card with CoT reasoning", () => {
    cy.get("#chat-input-textarea").type("Explain WebGPU compute pipelines{enter}");
    cy.get(".message-card.operator").should("contain", "Explain WebGPU compute pipelines");

    // The retrying assertion below waits for the mocked async response
    cy.get(".message-card.assistant").should(
      "contain",
      "This is a mocked response"
    );
    cy.get("details summary").should("contain", "COGNITIVE PROCESS");
    cy.get(".message-header .nixie-badge").should("contain", "45 tk/s");
  });

  it("toggles laboratory manual reference drawer", () => {
    cy.contains("MANUAL ?").click();
    cy.get(".sidebar-right").should("have.class", "open");

    // Click CLOSE button in drawer
    cy.contains("CLOSE ✕").click();
    cy.get(".sidebar-right").should("not.have.class", "open");
  });

  it("opens modular switchboard modal and toggles preferences", () => {
    cy.contains("⚙ CONFIG").click();
    cy.get(".switchboard-modal").should("be.visible");
    cy.get(".switchboard-header").should("contain", "MODULAR SWITCHBOARD");

    // Toggle a feature tile
    cy.get(".switchboard-tile").first().click();

    // Close modal
    cy.get(".switchboard-header button").click();
    cy.get(".switchboard-modal").should("not.exist");
  });

  it("manages document RAG cabinet indexing and file deletion", () => {
    cy.get("#rag-upload-input").selectFile(
      {
        contents: Cypress.Buffer.from(
          "Hardware specification code: retro-titan-88",
        ),
        fileName: "specs.txt",
        mimeType: "text/plain",
      },
      { force: true }
    );

    // Validate index updated in UI
    cy.get("litert-sidebar").should("contain", "specs.txt");
    cy.contains("ARCHIVES:").parent().should("contain", "1");

    // Delete document using the remove button
    cy.contains("specs.txt").parent().find("button:contains('✕')").click();
    cy.contains("ARCHIVES:").parent().should("contain", "0");
  });

  it("supports uploading and parsing PDF files into RAG cabinet", () => {
    // Stub the dynamic loadPdfJS method
    cy.window().then((win) => {
      cy.stub(win.ragIndex, "loadPdfJS").callsFake(() => {
        return Promise.resolve({
          getDocument: () => ({
            promise: Promise.resolve({
              numPages: 1,
              getPage: () =>
                Promise.resolve({
                  getTextContent: () =>
                    Promise.resolve({
                      items: [
                        { str: "Quantum" },
                        { str: "Telemetry" },
                        { str: "Manifest" },
                      ],
                    }),
                }),
            }),
          }),
        });
      });
    });

    // Upload PDF file
    cy.get("#rag-upload-input").selectFile(
      {
        contents: Cypress.Buffer.from("%PDF-1.4 ... mock pdf content ..."),
        fileName: "telemetry.pdf",
        mimeType: "application/pdf",
      },
      { force: true }
    );

    // Validate index updating with the PDF file
    cy.get("litert-sidebar").should("contain", "telemetry.pdf");
    cy.contains("ARCHIVES:").parent().should("contain", "1");
  });

  it("manages session archives: new chat, switching sessions, and deletion", () => {
    cy.get("#chat-input-textarea").type("First Session Log{enter}");
    cy.get(".message-card.operator").should("contain", "First Session Log");

    // Start new chat
    cy.contains("+ NEW").click();
    cy.get(".message-card").should("not.exist");
    cy.get(".chat-scroll-area").should("contain", "LITERT-LM ON-DEVICE TERMINAL");

    // Click back to first session
    cy.contains("First Session Log").click();
    cy.get(".message-card.operator").should("contain", "First Session Log");

    // Delete session
    cy.contains("First Session Log").parent().find("button:contains('✕')").click();
    cy.contains("First Session Log").should("not.exist");
  });

  it("supports selecting chat language channel and persisting changes", () => {
    cy.get("litert-sidebar select").should("have.value", "English");

    // Change language to Spanish
    cy.get("litert-sidebar select").select("Spanish");

    // Assert state matches
    cy.get("litert-lm-chat-app").then(($el) => {
      assert.strictEqual($el[0].state.chatLanguage, "Spanish");
    });

    // Verify it persists in localStorage settings
    cy.window().then((win) => {
      const settings = JSON.parse(
        win.localStorage.getItem("litertlm-chat-settings") || "{}"
      );
      assert.strictEqual(settings.chatLanguage, "Spanish");
    });
  });

  it("supports stopping speech audio playback without interrupting generation", () => {
    cy.get("litert-lm-chat-app").then(($el) => {
      const state = $el[0].state;
      state.isSpeaking = true;
      state.stopSpeechOnly();

      assert.strictEqual(state.isSpeechMutedForCurrentResponse, true);
      assert.strictEqual(state.isSpeaking, false);
    });
  });

  it("supports halting generation stream via HALT button", () => {
    cy.get("litert-lm-chat-app").then(($el) => {
      const state = $el[0].state;
      // Put state in generating mode
      state.isGenerating = true;
      state.requestUpdate();
    });

    // HALT button should render and be clickable
    cy.get('button:contains("HALT ✕")').should("be.visible").click();

    // Verify state was cancelled
    cy.get("litert-lm-chat-app").then(($el) => {
      const state = $el[0].state;
      assert.strictEqual(state.isGenerating, false);
      assert.strictEqual(state.isCancelled, true);
    });
  });
});
