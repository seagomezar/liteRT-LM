# Small Models and Good Tooling: Running AI in the Browser / Modelos pequeños y buen diseño: la IA en el navegador

---

## English Version

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

---

## Versión en Español

Los artículos que prometen diez cosas salvajes que puedes hacer con el último modelo de lenguaje siempre dan por sentada la misma arquitectura: conseguir una clave de API, pagar por cada bloque de tokens y enviar los datos a un servidor remoto. La premisa implícita es que, si no estás consultando un modelo gigante alojado en un centro de datos, no puedes construir nada útil.

Dejé de creer en esa idea cuando Chrome empezó a incorporar APIs de IA directamente en el navegador. Empezó con Gemini Nano para ofrecer funciones locales a coste cero, y con WebGPU y modelos abiertos como Gemma, la base técnica es mucho más sólida. Con un modelo de unos 2.000 millones de parámetros y una descarga inferior a 2 GB, no necesitas un servidor en la nube.

Es verdad que un modelo de 2B no razona hoy con la profundidad de los modelos más grandes del mercado. Pero los modelos compactos mejoran con cada generación, y eventualmente alcanzarán la capacidad que hoy vemos en sistemas mucho más pesados. Además, la mayoría de los problemas de software cotidiano no exigen resolver dilemas teóricos complejos; exigen buscar en documentos, estructurar datos, transcribir audio o generar interfaces sencillas.

En esas tareas, los modelos pequeños funcionan bien si se les acompaña con el tooling adecuado y un diseño pensado para ellos.

Dejar un modelo pequeño frente a un cuadro de texto en blanco suele terminar en respuestas vagas o alucinadas. La utilidad aparece cuando el navegador asume el trabajo de soporte:

Un motor de recuperación en memoria (RAG) con Okapi BM25 puede segmentar un archivo PDF, un CSV o una nota en texto plano dentro de la memoria RAM del navegador. Cuando el usuario hace una pregunta, el sistema busca los fragmentos relevantes y se los entrega al modelo como contexto directo. La precisión mejora de inmediato y el archivo nunca sale del ordenador del usuario.

El canal de audio funciona con las APIs nativas del navegador: transcripción por micrófono y síntesis de voz, sin recurrir a servicios externos de pago. Cuando el modelo genera código en HTML o SVG, un visor en un iframe aislado permite comprobar el resultado visual en el acto.

El peso del modelo ronda los 1,9 GB. Mediante la API CacheStorage del navegador, se descarga una sola vez. A partir de ese momento, la aplicación puede ejecutarse sin conexión a internet.

Las herramientas de consola como Ollama son útiles para programadores, pero tienen un límite claro de distribución. Un usuario común en un entorno legal, administrativo o médico no va a abrir un terminal ni a configurar controladores de GPU. El navegador resuelve ese obstáculo: basta con abrir un enlace para que WebGPU aproveche la gráfica local dentro de un entorno seguro, sin instalaciones ni permisos de administrador.

Construí el terminal LiteRT-LM MK-IV como un banco de pruebas para reunir estas piezas bajo una interfaz inspirada en instrumental analógico. El código está publicado en GitHub y la aplicación puede probarse directamente en GitHub Pages:

- Aplicación: https://seagomezar.github.io/liteRT-LM/
- Código fuente: https://github.com/seagomezar/liteRT-LM
