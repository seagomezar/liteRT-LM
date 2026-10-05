import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// 1. Start the HTTP server
const serverProcess = spawn('node', ['server.js'], {
  cwd: projectRoot,
  stdio: ['ignore', 'ignore', 'inherit']
});

// 2. Poll http://localhost:5173 until ready
function waitForServer(retries = 40) {
  return new Promise((resolve, reject) => {
    const check = (remaining) => {
      const req = http.get('http://localhost:5173', (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (remaining <= 0) {
          reject(new Error('Server failed to start within timeout'));
        } else {
          setTimeout(() => check(remaining - 1), 250);
        }
      });
      req.end();
    };
    check(retries);
  });
}

function cleanup() {
  try {
    if (process.platform === 'win32' && serverProcess.pid) {
      spawn('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t'], { stdio: 'ignore' });
    } else {
      serverProcess.kill('SIGKILL');
    }
  } catch (_) {}
}

process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('SIGTERM', () => { cleanup(); process.exit(1); });

try {
  await waitForServer();

  // 3. Run Cypress headless
  const isWin = process.platform === 'win32';
  const cypressCmd = isWin ? 'npx.cmd' : 'npx';
  const cypressArgs = ['cypress', 'run'];

  const cypressProcess = spawn(cypressCmd, cypressArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false
  });

  const exitCode = await new Promise((resolve) => {
    cypressProcess.on('close', resolve);
    cypressProcess.on('error', () => resolve(1));
  });

  cleanup();
  process.exit(exitCode || 0);
} catch (err) {
  console.error('[E2E Runner Error]', err);
  cleanup();
  process.exit(1);
}
