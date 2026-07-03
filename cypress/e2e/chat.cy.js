describe('LiteRT-LM WebGPU Chat UI E2E Tests', () => {
  beforeEach(() => {
    // Visit the app
    cy.visit('/');

    // Mock confirm dialogs to always return true
    cy.on('window:confirm', () => true);

    // Get the state manager instance from the Lit component shell to stub engine compilation and downloads
    cy.get('litert-lm-chat-app').then(($el) => {
      const app = $el[0];
      const state = app.state;

      // Stub loadModelWeights to succeed instantly without downloading 2GB models
      cy.stub(state, 'loadModelWeights').callsFake(() => {
        state.isModelLoading = false;
        state.statusText = 'Model loaded and ready.';
        state.requestUpdate();
        return Promise.resolve();
      });

      // Stub sendMessage to execute instant mocked inference stream
      cy.stub(state, 'sendMessage').callsFake((prompt) => {
        state.isGenerating = true;
        state.statusText = 'Thinking...';
        state.messages.push({
          role: 'user',
          text: prompt,
          senderName: 'User',
          tokensCount: '5'
        });
        state.requestUpdate();

        setTimeout(() => {
          state.messages.push({
            role: 'assistant',
            text: 'This is a **mocked response** for: ' + prompt,
            senderName: 'Bot',
            thoughtText: 'Stubbed thinking phase.',
            decodeSpeed: '45 tk/s',
            prefillSpeed: '120 tk/s',
            tokensCount: '15'
          });
          state.isGenerating = false;
          state.statusText = 'Generation completed.';
          state.requestUpdate();
          state.commitActiveChatHistory();
        }, 50);
      });
    });
  });

  it('renders landing page structure and starter elements', () => {
    cy.get('header').should('contain', 'LiteRT-LM.js Chat');
    cy.get('.sidebar').should('be.visible');
    cy.get('.chat-messages').should('contain', 'LiteRT-LM Local WebGPU Chat');
    cy.get('#chat-input-textarea').should('be.visible');
    cy.get('.starters-container').should('be.visible');
    cy.get('litert-avatar').should('be.visible');
    cy.get('#phaser-avatar-container').should('be.visible');
    cy.get('button[title="Start voice input"]').should('be.visible');
  });

  it('updates inference settings inputs and toggles thinking CoT', () => {
    // Context length input
    cy.get('#context-length').clear().type('2048').trigger('input');
    cy.get('litert-lm-chat-app').then(($el) => {
      assert.strictEqual($el[0].state.contextLength, 2048);
    });

    // Temperature slider
    cy.get('#temperature').clear().type('0.8').trigger('input');
    cy.get('litert-lm-chat-app').then(($el) => {
      assert.strictEqual($el[0].state.temperature, 0.8);
    });

    // Sampler select
    cy.get('#sampler-type').select('top_p');
    cy.get('litert-lm-chat-app').then(($el) => {
      assert.strictEqual($el[0].state.samplerType, 'top_p');
    });

    // Toggle CoT
    cy.get('#enable-thinking').uncheck();
    cy.get('litert-lm-chat-app').then(($el) => {
      assert.strictEqual($el[0].state.enableThinking, false);
    });
  });

  it('interacts with custom model selection dropdown', () => {
    cy.get('custom-dropdown button').click();
    cy.get('custom-dropdown .dropdown-content').should('have.class', 'show');
    cy.get('custom-dropdown .dropdown-item').eq(1).click();
    cy.get('custom-dropdown button').should('contain', 'Gemma 4 E4B');
  });

  it('submits a quick starter prompt and displays conversation message bubbles', () => {
    cy.contains('Explain WebGPU').click();
    cy.get('.message-bubble.user').should('contain', 'Explain WebGPU');

    // The retrying assertion below waits for the mocked async response;
    // no fixed cy.wait needed.
    cy.get('.message-bubble.assistant').should('contain', 'This is a mocked response');
    cy.get('.thought-details').should('contain', 'Stubbed thinking phase.');
    cy.get('.message-stats').should('contain', 'dec: 45 tk/s');
  });

  it('submits custom query from textarea and triggers retry/edit flows', () => {
    cy.get('#chat-input-textarea').type('Hello local bot{enter}');
    cy.get('.message-bubble.user').should('contain', 'Hello local bot');

    cy.get('.message-bubble.assistant').should('be.visible');

    // Click retry
    cy.contains('Retry').click();
    cy.get('.message-bubble.assistant').should('be.visible');

    // Click edit (rewind)
    cy.contains('Edit').click();
    cy.get('.message-bubble.assistant').should('not.exist');
  });

  it('toggles learn more drawer', () => {
    cy.contains('Learn More').click();
    cy.get('.sidebar-right').should('have.class', 'open');
    cy.get('.sidebar-right-overlay').should('have.class', 'open');

    // Click backdrop overlay to dismiss
    cy.get('.sidebar-right-overlay').click({ force: true });
    cy.get('.sidebar-right').should('not.have.class', 'open');
  });

  it('manages document hub indexing and files upload', () => {
    // Check Document count
    cy.get('#rag-doc-count').should('contain', '0');

    cy.get('#rag-file-input').selectFile({
      contents: Cypress.Buffer.from('This is a secret key code: antigravity-999'),
      fileName: 'config.txt',
      mimeType: 'text/plain'
    }, { force: true });

    // Validate index updating
    cy.get('#rag-doc-count').should('contain', '1');
    cy.get('#rag-chunk-count').should('not.contain', '0');
    cy.get('#rag-doc-list').should('contain', 'config.txt');

    // Query with RAG keyword
    cy.get('#chat-input-textarea').type('What is the secret key code?{enter}');
    cy.get('.message-bubble.user').should('contain', 'What is the secret key code?');

    // Delete document
    cy.get('.delete-doc-btn').click();
    cy.get('#rag-doc-count').should('contain', '0');

    // Clear logs
    cy.contains('Clear Logs').click();
    cy.get('#rag-logs').should('contain', 'No logs.');
  });

  it('supports uploading and parsing PDF files', () => {
    // Stub the dynamic loadPdfJS method
    cy.window().then((win) => {
      cy.stub(win.ragIndex, 'loadPdfJS').callsFake(() => {
        return Promise.resolve({
          getDocument: () => ({
            promise: Promise.resolve({
              numPages: 1,
              getPage: () => Promise.resolve({
                getTextContent: () => Promise.resolve({
                  items: [
                    { str: 'This' },
                    { str: 'is' },
                    { str: 'mocked' },
                    { str: 'PDF' },
                    { str: 'content' }
                  ]
                })
              })
            })
          })
        });
      });
    });

    cy.get('#rag-doc-count').should('contain', '0');

    // Select/upload a PDF file
    cy.get('#rag-file-input').selectFile({
      contents: Cypress.Buffer.from('%PDF-1.4 ... mock pdf content ...'),
      fileName: 'document.pdf',
      mimeType: 'application/pdf'
    }, { force: true });

    // Validate index updating with the PDF file
    cy.get('#rag-doc-count').should('contain', '1');
    cy.get('#rag-doc-list').should('contain', 'document.pdf');
    cy.get('#rag-logs').should('contain', 'Document added: "document.pdf"');
  });

  it('starts new conversations and toggles items list', () => {
    cy.get('#chat-input-textarea').type('Thread 1 message{enter}');

    cy.get('.conversations-list').should('contain', 'Thread 1 message');
    
    // Start new chat
    cy.contains('+ New Chat').click();
    cy.get('.message-bubble').should('not.exist');

    // Click back to conversation 1
    cy.get('.conv-item').not('.new-chat-item').first().click();
    cy.get('.message-bubble.user').should('contain', 'Thread 1 message');

    // Delete conversation
    cy.get('.btn-delete-conv').first().click();
    cy.get('.conv-item').not('.new-chat-item').should('not.exist');
  });

  it('supports renaming conversations in the sidebar and persisting changes', () => {
    cy.get('#chat-input-textarea').type('Chat to rename{enter}');

    // Initial check
    cy.get('.conversations-list').should('contain', 'Chat to rename');

    // Click rename button (pencil icon)
    cy.get('.btn-rename-conv').first().click();

    // Check that the rename input field appears and type new title
    cy.get('.rename-input')
      .should('be.visible')
      .should('have.value', 'Chat to rename')
      .clear()
      .type('Renamed Chat Title');

    // Click checkmark/save button
    cy.get('.btn-rename-save').click();

    // Verify the list has updated
    cy.get('.conversations-list').should('contain', 'Renamed Chat Title');
    cy.get('.conversations-list').should('not.contain', 'Chat to rename');

    // Let's test the Escape key cancellation
    cy.get('.btn-rename-conv').first().click();
    cy.get('.rename-input')
      .clear()
      .type('Should Cancel This');
    cy.get('.rename-input').type('{esc}');

    // Verify it wasn't saved and reverted back to the previous name
    cy.get('.conversations-list').should('contain', 'Renamed Chat Title');
    cy.get('.conversations-list').should('not.contain', 'Should Cancel This');

    // Let's test Enter key saving
    cy.get('.btn-rename-conv').first().click();
    cy.get('.rename-input')
      .clear()
      .type('Save via Enter Key{enter}');
    
    // Verify it saved
    cy.get('.conversations-list').should('contain', 'Save via Enter Key');
  });

  it('supports selecting chat language and persisting changes', () => {
    // Assert default value is English
    cy.get('#chat-language').should('have.value', 'English');

    // Change language to Spanish
    cy.get('#chat-language').select('Spanish');
    
    // Assert state matches
    cy.get('litert-lm-chat-app').then(($el) => {
      assert.strictEqual($el[0].state.chatLanguage, 'Spanish');
    });

    // Verify it persists in localStorage settings
    cy.window().then((win) => {
      const settings = JSON.parse(win.localStorage.getItem('litertlm-chat-settings'));
      assert.strictEqual(settings.chatLanguage, 'Spanish');
    });
  });

  it('supports stopping speech audio playback without interrupting generation', () => {
    // Force speaking state to true so "Stop Audio" button renders
    cy.get('litert-lm-chat-app').then(($el) => {
      const state = $el[0].state;
      state.isSpeaking = true;
      state.requestUpdate();
    });

    // Check that Stop Audio button is visible
    cy.get('#btn-stop-audio').should('be.visible').click();

    // Check that Speech is stopped and muted flag is active in state
    cy.get('litert-lm-chat-app').then(($el) => {
      const state = $el[0].state;
      assert.strictEqual(state.isSpeechMutedForCurrentResponse, true);
      assert.strictEqual(state.isSpeaking, false);
    });
  });
});
