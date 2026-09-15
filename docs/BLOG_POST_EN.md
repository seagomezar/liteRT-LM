# Small Models and Good Tooling: Running AI in the Browser

Articles that promise ten wild things you can do with the latest language model almost always assume the same architecture: get an API key, pay by the token, and send your data to a remote server. The unspoken assumption is that unless you query a massive model hosted in a datacenter, you cannot build anything useful.

I stopped believing that when Chrome started introducing built-in on-device APIs. It began with Gemini Nano to provide local features at zero cost, and with WebGPU and open weights like Gemma, the technical foundation is much firmer. With a model of roughly two billion parameters and a download under two gigabytes, you do not need a cloud server.

A 2B model does not reason with the depth of the largest frontier models today. That is true. But small edge models improve with each iteration, and over time they will reach the capability we see in heavier systems today. More importantly, most day-to-day software problems do not require solving complex theoretical puzzles; they require searching documents, structuring data, transcribing audio, or drafting simple interfaces.

For those tasks, small models work well when paired with the right tooling and intentional interface design.

Leaving a small model alone with an empty text prompt usually leads to vague answers or hallucinations. The practical value appears when the browser handles the supporting work:

An in-memory retrieval engine using Okapi BM25 can chunk a PDF, CSV, or plain text note directly inside browser RAM. When a user asks a question, the system finds the relevant passages and hands them to the model as direct context. Accuracy improves immediately, and the file never leaves the user's computer.

Audio runs through the browser's native APIs: microphone transcription and speech synthesis, with no external paid services. When the model outputs HTML or SVG, an isolated iframe viewer lets the user verify the visual output on the spot.

The model download is roughly 1.9 GB. Using the browser's CacheStorage API, it downloads only once. From that point on, the application runs entirely offline.

Terminal tools like Ollama are useful for developers, but they hit a clear distribution ceiling. Everyday users in legal, administrative, or medical settings will not open a command line or debug GPU drivers. The browser removes that barrier: opening a URL is enough for WebGPU to use the local graphics card inside a secure sandbox, with no installation or administrator rights required.

I built the LiteRT-LM MK-IV terminal as a working testbed to bring these pieces together in an interface inspired by analog lab instruments. The code is open on GitHub and runs directly on GitHub Pages:

- Live terminal: https://seagomezar.github.io/liteRT-LM/
- Source code: https://github.com/seagomezar/liteRT-LM
