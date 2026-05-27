import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(join(__dirname, 'public')));

const server = createServer(app);
const wss = new WebSocketServer({ server });

function getNlshPath() {
  const candidates = [
    join(__dirname, '..', 'nlsh'),
    join(__dirname, '..'),
  ];
  for (const p of candidates) {
    if (existsSync(join(p, 'package.json'))) return p;
  }
  return join(__dirname, '..', 'nlsh');
}

wss.on('connection', (ws) => {
  let agent = null;
  let timeout = null;
  const AGENT_TIMEOUT = 5 * 60 * 1000;

  function startAgent(intent) {
    if (agent) killAgent();

    const nlshDir = getNlshPath();
    const agentScript = join(__dirname, 'agent.mjs');

    agent = spawn('node', [agentScript, intent], {
      cwd: nlshDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    agent.stdout.on('data', (data) => {
      const text = data.toString();
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'output', data: text }));
      }
    });

    agent.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (!text || ws.readyState !== 1) return;
      try {
        const msg = JSON.parse(text);
        if (msg.type === 'input') {
          ws.send(JSON.stringify({ type: 'input', prompt: msg.prompt }));
        } else if (msg.type === 'done') {
          ws.send(JSON.stringify({ type: 'done', failed: !!msg.failed, message: msg.message }));
        } else if (msg.type === 'error') {
          ws.send(JSON.stringify({ type: 'error', message: msg.message }));
        }
      } catch {
        // ignore non-JSON stderr
      }
    });

    agent.on('error', (err) => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    });

    agent.on('close', (code) => {
      if (code !== 0 && code !== null && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'error', message: `Agent exited with code ${code}` }));
      }
      agent = null;
    });

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'output', data: '\r\n  \x1b[33m\u26A0 Session timed out after 5 minutes\x1b[0m\r\n' }));
      }
      killAgent();
    }, AGENT_TIMEOUT);
  }

  function killAgent() {
    if (agent) {
      try { agent.kill(); } catch {}
      agent = null;
    }
    if (timeout) { clearTimeout(timeout); timeout = null; }
  }

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'intent') {
        startAgent(msg.data);
      } else if (msg.type === 'input') {
        if (agent && agent.stdin.writable) {
          agent.stdin.write(msg.data + '\n');
        }
      }
    } catch {}
  });

  ws.on('close', () => killAgent());
  ws.on('error', () => killAgent());
});

wss.on('error', () => {});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. Try a different port:\n    PORT=3001 node server.js\n`);
    process.exit(1);
  } else {
    console.error('\n  Server error:', err.message);
  }
});

process.on('uncaughtException', (err) => {
  console.error('\n  Unexpected error:', err.message);
});

server.listen(PORT, () => {
  console.log(`\n  nlsh demo running at http://localhost:${PORT}\n`);
});
