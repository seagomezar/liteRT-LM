# Small Models and Good Tooling: Running AI in the Browser / Modelos pequeños y buen diseño: la IA en el navegador

---

## English Version

Technical discourse surrounding modern artificial intelligence almost universally presumes a single infrastructure archetype: obtain an API key, pay by the token block, and transmit all user telemetry to a remote server farm. Commercial literature is saturated with repetitive headlines promising ten wild things you can do with the latest frontier model, while systematically brushing aside operational costs, network latency, and the data governance hazards inherent in relying on rented infrastructure.

The implicit assumption that nothing useful can be engineered outside a datacenter housing hundreds of billions of parameters is flawed. When Chrome began shipping built-in on-device AI capabilities (first with Gemini Nano and subsequently by standardizing low-level WebGPU access alongside open weights like Gemma), it became clear that the next operational frontier in production software is not merely cloud scaling, but client-side decentralized inference.

### Client-Side Architecture: WebGPU and Compact Weights

Running a language model inside the browser without server mediation is no longer a theoretical exercise. With compact architectures around two billion parameters (2B) and weight footprints under 1.9 GB, commodity client hardware is capable of sustaining interactive inference at tens of tokens per second.

The technical linchpin is WebGPU. Unlike legacy WebGL workarounds, WebGPU directly exposes compute shader pipelines written in WGSL to the underlying GPU or NPU. The LiteRT runtime compiles tensor operations, matrix multiplications, and attention key-value cache (KV-cache) management directly into hardware shaders, all while operating strictly within the security sandbox of the browser tab.

![LiteRT-LM MK-IV Analog Terminal](../assets/analog_terminal_final.png)

### System Design vs. Raw Parameter Count

There is a valid reservation to address: a 2B parameter model does not match the abstract reasoning depth of 70B+ networks or proprietary frontier clusters. When a lightweight model is left facing an unconstrained, empty text area, it frequently outputs generic or hallucinated text.

Yet the overwhelming majority of daily software tasks do not require solving theoretical puzzles. They demand querying user files, extracting structured fields from raw records, transcribing audio notes, validating operational data, or rendering interface mockups for instant review.

In these domains, the bottleneck is rarely parameter volume; the real bottleneck is system design. A compact model augmented by structured tooling, localized context injection, and intentional interface boundaries consistently outperforms an over-parameterized cloud model bottlenecked by network requests.

![Modular Switchboard & Feature Preferences](../assets/terminal_switchboard.png)

### Modularity and Execution Environment Control

During the engineering of the LiteRT-LM MK-IV terminal, a modular system architecture was prioritized. Every functional subsystem (visual rendering, indexation engine, speech pipeline, sandboxed code runner, and offline storage cache) operates cleanly decoupled from the core inference loop.

Through the modular switchboard configuration modal, users can dynamically toggle individual modules to tailor the runtime footprint to their specific hardware capacity:

- **Real-time parameter tuning:** Direct analog-style faders controlling Temperature, Top-K, Top-P, and context window lengths up to 4096 or 8192 tokens.
- **Live generation telemetry:** Continuous measurement of tokens-per-second (TK/S) throughput generated across the local GPU pipeline.
- **Sandboxed code execution preview:** Isolated iframe container enforcing secure origins to render and verify model-generated HTML, SVG, or JavaScript instantly.
- **Native bidirectional voice channel:** Real-time microphone dictation via SpeechRecognition and sentence-level local speech synthesis via SpeechSynthesis, supporting multiple languages with zero third-party API dependencies.

![Document RAG Cabinet](../assets/terminal_rag_cabinet.png)

### In-Memory Document Retrieval: RAG Without Remote Databases

A persistent design misstep in client AI architecture is the assumption that Retrieval-Augmented Generation (RAG) requires remote vector databases, third-party embedding endpoints, or complex backend infrastructure. When handling a single user's working materials (technical manuals, financial balance sheets, legal briefs, or raw datasets), that architecture introduces needless friction and violates strict privacy standards.

The LiteRT-LM RAG Cabinet addresses this by operating an indexation engine directly in browser memory. The workflow operates as follows:

- **Direct multiformat ingestion:** Users drop PDF, Markdown, TXT, CSV, or JSON documents into the terminal without transmitting a single byte over the network.
- **Structured sliding window chunking:** Content is segmented using a 400-character window with a 100-character overlap to safeguard syntactic continuity across boundaries.
- **Lexical scoring via Okapi BM25:** The engine computes term frequencies and inverse document frequencies normalized by passage length, ranking candidate chunks with exact mathematical relevance against the prompt query.
- **High-precision context injection:** Highest-scoring passages are formatted and inserted directly into Gemma's context window. The model does not need to memorize facts; it merely synthesizes and answers based on the retrieved context.

This targeted retrieval structure drastically suppresses hallucinations in compact models, making the system suitable for sensitive medical, legal, or proprietary enterprise records.

![Laboratory Manual & WebGPU Specification](../assets/terminal_laboratory_manual.png)

### Storage Persistence and Air-Gapped Execution

A browser-based AI system cannot expect users to re-download 1.9 GB on every tab visit. LiteRT-LM employs the browser's CacheStorage API under the litertlm-models container to persist binary weights across sessions.

Upon initial initialization, the model weights are retrieved and cached. From that moment forward, the application operates entirely offline. In addition, the system provides a local file loader allowing users to import offline .litertlm binary weight files straight from disk via the File System Access API, facilitating offline experimentation without requiring local HTTP servers.

### The Distribution Advantage: The Web vs. The Terminal

Command-line tools like Ollama or llama.cpp represent significant engineering achievements and are foundational tools for developers. However, their reliance on terminal configuration creates an insurmountable distribution barrier for general enterprise users.

A financial compliance officer, a clinical physician in a rural hospital, or an administrative investigator will not open bash terminals, troubleshoot CUDA path variables, or acquire IT root privileges to run local models. The web browser dissolves this hurdle: navigating to a simple URL executes WebGPU hardware-accelerated models inside a verified, secure sandbox without administrative installations.

### Summary and Project Resources

The future of applied artificial intelligence does not belong solely to opaque, cloud-hosted behemoths billing per token. Combining small open-weight models, native WebGPU acceleration, and intentional interface engineering makes private, zero-marginal-cost edge AI accessible to everyone.

The LiteRT-LM MK-IV terminal is available as an interactive testbed, and its complete source code is public on GitHub:

- **Live Interactive Terminal:** https://seagomezar.github.io/liteRT-LM/
- **Open Source Repository:** https://github.com/seagomezar/liteRT-LM

---

## Versión en Español

Los artículos técnicos sobre inteligencia artificial contemporánea casi siempre parten del mismo supuesto de infraestructura: conseguir una clave de API, pagar por cada bloque de tokens consumido y enviar cualquier dato del usuario a un centro de procesamiento remoto. La literatura promocional abunda en titulares repetitivos del estilo diez cosas salvajes que puedes hacer con el último modelo, ignorando sistemáticamente los costes operativos, la latencia de red y los riesgos de gobernanza que implica depender de una nube ajena.

La suposición implícita de que nada útil puede construirse fuera de un clúster de cientos de miles de millones de parámetros es falsa. Cuando Chrome comenzó a desplegar APIs de IA integradas directamente en el cliente (primero con Gemini Nano y luego facilitando el acceso de bajo nivel a WebGPU con pesos abiertos como Gemma), quedó claro que la frontera del software de producción no está únicamente en la escala del cómputo remoto, sino en la descentralización de la inferencia.

### La arquitectura del cliente: WebGPU y modelos compactos

Ejecutar un modelo de lenguaje en el navegador sin intermediación de servidores ya no es una prueba de concepto teórica. Con modelos optimizados de unos 2.000 millones de parámetros (2B) y pesos que rondan 1,9 GB de descarga, el hardware del propio usuario es suficiente para sostener inferencia interactiva a decenas de tokens por segundo.

La clave técnica reside en WebGPU. A diferencia de las aproximaciones antiguas basadas en WebGL, WebGPU expone capacidades de cómputo paralelo (compute shaders) en lenguaje WGSL directamente a la GPU o NPU del dispositivo. El compilador en tiempo de ejecución de LiteRT compila las operaciones tensoriales, la multiplicación de matrices y la gestión de la memoria de claves y valores (KV-cache) en shaders nativos de la tarjeta gráfica, manteniendo el aislamiento y la seguridad que impone la sandbox del navegador.

![Terminal Analógica LiteRT-LM MK-IV](../assets/analog_terminal_final.png)

### Diseño de sistemas vs. tamaño de parámetros

Existe una objeción comprensible: un modelo de 2B no razona hoy con la sofisticación abstracta de un modelo de 70B o de las arquitecturas de frontera cerradas. Si se expone un modelo pequeño ante una caja de texto vacía sin estructura, el resultado suele ser impreciso o superficial.

Sin embargo, la inmensa mayoría de las tareas de software cotidiano no exigen resolver teoremas matemáticos ni redactar disertaciones complejas. Exigen consultar documentos propios, extraer campos de un archivo estructurado, transcribir dictados de voz, comprobar la coherencia de un dato o generar fragmentos de código para previsualización inmediata.

En estos contextos, el cuello de botella rara vez es la capacidad bruta del modelo; el cuello de botella es el diseño del sistema que lo rodea. Un modelo pequeño respaldado por una interfaz deliberada, con herramientas locales de soporte y flujos acotados, supera en utilidad real y velocidad a un modelo masivo consumido a través de una API saturada.

![Conmutador Modular de Preferencias](../assets/terminal_switchboard.png)

### Modularidad y control del entorno de ejecución

En el desarrollo del terminal LiteRT-LM MK-IV se adoptó una filosofía modular explícita. Cada subsistema del software (la renderización visual, el motor de indexación, el pipeline de síntesis de audio, el sandbox de previsualización de código y la caché de almacenamiento) opera desacoplado del bucle principal de inferencia.

A través del panel de configuración modular, el usuario puede activar o desactivar cada subsistema de acuerdo con las restricciones de hardware del equipo:

- **Ajuste de hiperparámetros en tiempo real:** Control directo sobre Temperatura, Top-K, Top-P y longitud de ventana de contexto (hasta 4096 o 8192 tokens) mediante faders calibrados.
- **Telemetría de generación instantánea:** Monitorización continua de la tasa de tokens por segundo (TK/S) generada sobre la GPU local.
- **Sandbox de código en vivo:** Contenedor iframe con políticas de aislamiento de seguridad para renderizar HTML, SVG o JavaScript producido por el modelo en el acto.
- **Canal de audio bidireccional nativo:** Dictado por micrófono mediante SpeechRecognition y síntesis de voz en local por oraciones completas mediante SpeechSynthesis, con selector multilingüe y sin llamadas a APIs externas.

![Gabinete Documental RAG en Memoria](../assets/terminal_rag_cabinet.png)

### Recuperación documental en memoria: RAG sin bases de datos remotas

Uno de los mayores errores en aplicaciones cliente de IA es pensar que la recuperación aumentada por generación (RAG) requiere obligatoriamente una base de datos vectorial en la nube, servicios de embedding remotos o infraestructura pesada. Para el trabajo con los documentos de un usuario individual (manuales, reportes financieros, notas legales o tablas de datos), esa arquitectura introduce una complejidad y un coste innecesarios, además de violar la privacidad básica de los datos.

El Gabinete RAG de LiteRT-LM resuelve este problema implementando un motor de indexación en memoria en el hilo del navegador. El mecanismo funciona de la siguiente manera:

- **Ingestión multiformato directa:** El usuario arrastra archivos PDF, Markdown, TXT, CSV o JSON al navegador sin transferir un solo byte fuera de su máquina.
- **Segmentación estructurada:** El texto se divide en fragmentos mediante una ventana deslizante de 400 caracteres con 100 caracteres de solapamiento para preservar el contexto entre párrafos.
- **Puntuación lexical con Okapi BM25:** El motor calcula frecuencias de términos y frecuencias inversas de documentos con normalización por longitud de fragmento, ordenando los pasajes por relevancia matemática exacta ante la consulta del usuario.
- **Inyección contextual de alta precisión:** Los fragmentos más relevantes se concatenan de forma estructurada en el prompt de Gemma. El modelo no necesita memorizar los datos: solo debe estructurar y responder basándose en el extracto exacto entregado.

Este diseño elimina por completo las alucinaciones habituales de los modelos pequeños cuando se les interroga sobre datos específicos, garantizando confidencialidad absoluta para información médica, contractual o empresarial sensible.

![Manual de Laboratorio y Especificación WebGPU](../assets/terminal_laboratory_manual.png)

### Persistencia en disco y ejecución fuera de línea

Una aplicación de IA en el navegador no puede obligar al usuario a descargar 1,9 GB en cada recarga de página. LiteRT-LM utiliza la API CacheStorage del navegador bajo el contenedor litertlm-models para almacenar los pesos del modelo localmente de forma persistente.

En la primera visita se descargan y verifican los pesos comprimidos. Una vez registrados en la caché local, la aplicación puede funcionar completamente desconectada de internet. Adicionalmente, el sistema incluye soporte para cargar archivos de pesos binarios .litertlm directamente desde el almacenamiento local del usuario mediante la API de selección de archivos, permitiendo experimentar con checkpoints personalizados sin requerir ningún servidor HTTP.

### La barrera de distribución: por qué la web supera a la consola

Herramientas de línea de comandos como Ollama o llama.cpp representan avances técnicos notables y son indispensables en el flujo de trabajo de los desarrolladores. Sin embargo, tienen un techo de distribución insalvable para el público no especializado.

Un analista financiero, un médico en una clínica rural o un funcionario público no van a abrir una terminal de Linux, ni a lidiar con variables de entorno, ni a compilar controladores CUDA, ni a solicitar privilegios de administrador para instalar dependencias de bajo nivel. El navegador web elimina esa fricción de raíz: basta con abrir una URL en un navegador moderno para que el motor WebGPU acceda a la aceleración por hardware dentro de un entorno seguro y con aislamiento de procesos.

### Conclusión y banco de pruebas

El futuro del software inteligente no pertenece exclusivamente a modelos gigantescos alojados en centros de datos con facturación por token. La combinación de modelos abiertos compactos, aceleración WebGPU en el estándar web y un diseño riguroso de interfaces y herramientas permite construir herramientas potentes, privadas y gratuitas para el usuario final.

El terminal LiteRT-LM MK-IV está disponible como banco de pruebas interactivo y su código fuente es completamente abierto:

- **Terminal interactivo en vivo:** https://seagomezar.github.io/liteRT-LM/
- **Repositorio de código abierto:** https://github.com/seagomezar/liteRT-LM

