# Modelos pequeños y buen diseño: la IA en el navegador

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
