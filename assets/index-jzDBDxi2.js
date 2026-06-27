/**
 * LiteRT-LM WebGPU Chat Application Entrypoint.
 * Boots the application by registering clean Lit UI components
 * and binding the ChatStateManager globally.
 */
import { ChatStateManager } from '../src/state.js';

// Expose ChatStateManager globally before components load & register
window.ChatStateManager = ChatStateManager;

import '../src/components.js';

console.log('[LiteRT-LM] Clean-room PWA bootstrapped successfully via ES Modules.');
