# Small Models and Good Tooling: Running AI in the Browser

Technical discourse surrounding modern artificial intelligence almost universally presumes a single infrastructure archetype: obtain an API key, pay by the token block, and transmit all user telemetry to a remote server farm. Commercial literature is saturated with repetitive headlines promising ten wild things you can do with the latest frontier model, while systematically brushing aside operational costs, network latency, and the data governance hazards inherent in relying on rented infrastructure.

The implicit assumption that nothing useful can be engineered outside a datacenter housing hundreds of billions of parameters is flawed. When Chrome began shipping built-in on-device AI capabilities (first with Gemini Nano and subsequently by standardizing low-level WebGPU access alongside open weights like Gemma), it became clear that the next operational frontier in production software is not merely cloud scaling, but client-side decentralized inference.

## Client-Side Architecture: WebGPU and Compact Weights

Running a language model inside the browser without server mediation is no longer a theoretical exercise. With compact architectures around two billion parameters (2B) and weight footprints under 1.9 GB, commodity client hardware is capable of sustaining interactive inference at tens of tokens per second.

The technical linchpin is WebGPU. Unlike legacy WebGL workarounds, WebGPU directly exposes compute shader pipelines written in WGSL to the underlying GPU or NPU. The LiteRT runtime compiles tensor operations, matrix multiplications, and attention key-value cache (KV-cache) management directly into hardware shaders, all while operating strictly within the security sandbox of the browser tab.

![LiteRT-LM MK-IV Analog Terminal](../assets/analog_terminal_final.png)

## System Design vs. Raw Parameter Count

There is a valid reservation to address: a 2B parameter model does not match the abstract reasoning depth of 70B+ networks or proprietary frontier clusters. When a lightweight model is left facing an unconstrained, empty text area, it frequently outputs generic or hallucinated text.

Yet the overwhelming majority of daily software tasks do not require solving theoretical puzzles. They demand querying user files, extracting structured fields from raw records, transcribing audio notes, validating operational data, or rendering interface mockups for instant review.

In these domains, the bottleneck is rarely parameter volume; the real bottleneck is system design. A compact model augmented by structured tooling, localized context injection, and intentional interface boundaries consistently outperforms an over-parameterized cloud model bottlenecked by network requests.

![Modular Switchboard & Feature Preferences](../assets/terminal_switchboard.png)

## Modularity and Execution Environment Control

During the engineering of the LiteRT-LM MK-IV terminal, a modular system architecture was prioritized. Every functional subsystem (visual rendering, indexation engine, speech pipeline, sandboxed code runner, and offline storage cache) operates cleanly decoupled from the core inference loop.

Through the modular switchboard configuration modal, users can dynamically toggle individual modules to tailor the runtime footprint to their specific hardware capacity:

- **Real-time parameter tuning:** Direct analog-style faders controlling Temperature, Top-K, Top-P, and context window lengths up to 4096 or 8192 tokens.
- **Live generation telemetry:** Continuous measurement of tokens-per-second (TK/S) throughput generated across the local GPU pipeline.
- **Sandboxed code execution preview:** Isolated iframe container enforcing secure origins to render and verify model-generated HTML, SVG, or JavaScript instantly.
- **Native bidirectional voice channel:** Real-time microphone dictation via SpeechRecognition and sentence-level local speech synthesis via SpeechSynthesis, supporting multiple languages with zero third-party API dependencies.

![Document RAG Cabinet](../assets/terminal_rag_cabinet.png)

## In-Memory Document Retrieval: RAG Without Remote Databases

A persistent design misstep in client AI architecture is the assumption that Retrieval-Augmented Generation (RAG) requires remote vector databases, third-party embedding endpoints, or complex backend infrastructure. When handling a single user's working materials (technical manuals, financial balance sheets, legal briefs, or raw datasets), that architecture introduces needless friction and violates strict privacy standards.

The LiteRT-LM RAG Cabinet addresses this by operating an indexation engine directly in browser memory. The workflow operates as follows:

- **Direct multiformat ingestion:** Users drop PDF, Markdown, TXT, CSV, or JSON documents into the terminal without transmitting a single byte over the network.
- **Structured sliding window chunking:** Content is segmented using a 400-character window with a 100-character overlap to safeguard syntactic continuity across boundaries.
- **Lexical scoring via Okapi BM25:** The engine computes term frequencies and inverse document frequencies normalized by passage length, ranking candidate chunks with exact mathematical relevance against the prompt query.
- **High-precision context injection:** Highest-scoring passages are formatted and inserted directly into Gemma's context window. The model does not need to memorize facts; it merely synthesizes and answers based on the retrieved context.

This targeted retrieval structure drastically suppresses hallucinations in compact models, making the system suitable for sensitive medical, legal, or proprietary enterprise records.

![Laboratory Manual & WebGPU Specification](../assets/terminal_laboratory_manual.png)

## Storage Persistence and Air-Gapped Execution

A browser-based AI system cannot expect users to re-download 1.9 GB on every tab visit. LiteRT-LM employs the browser's CacheStorage API under the litertlm-models container to persist binary weights across sessions.

Upon initial initialization, the model weights are retrieved and cached. From that moment forward, the application operates entirely offline. In addition, the system provides a local file loader allowing users to import offline .litertlm binary weight files straight from disk via the File System Access API, facilitating offline experimentation without requiring local HTTP servers.

## The Distribution Advantage: The Web vs. The Terminal

Command-line tools like Ollama or llama.cpp represent significant engineering achievements and are foundational tools for developers. However, their reliance on terminal configuration creates an insurmountable distribution barrier for general enterprise users.

A financial compliance officer, a clinical physician in a rural hospital, or an administrative investigator will not open bash terminals, troubleshoot CUDA path variables, or acquire IT root privileges to run local models. The web browser dissolves this hurdle: navigating to a simple URL executes WebGPU hardware-accelerated models inside a verified, secure sandbox without administrative installations.

## Summary and Project Resources

The future of applied artificial intelligence does not belong solely to opaque, cloud-hosted behemoths billing per token. Combining small open-weight models, native WebGPU acceleration, and intentional interface engineering makes private, zero-marginal-cost edge AI accessible to everyone.

The LiteRT-LM MK-IV terminal is available as an interactive testbed, and its complete source code is public on GitHub:

- **Live Interactive Terminal:** https://seagomezar.github.io/liteRT-LM/
- **Open Source Repository:** https://github.com/seagomezar/liteRT-LM

