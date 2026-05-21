// bridge-server.mjs — 小路 ↔ 西奥多 WebSocket 中转站
// 启动: node bridge-server.mjs
// 默认端口 18901，环境变量 BRIDGE_PORT 可覆盖

import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import fs from 'node:fs';

const PORT = parseInt(process.env.PORT || process.env.BRIDGE_PORT || '18901');
const LOG = process.env.BRIDGE_LOG || 'C:\\Users\\hp\\.cc-connect\\logs\\bridge.log';
const clients = new Map();
const inbox = new Map();

function log(line) {
  const t = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const entry = `[${t}] ${line}\n`;
  fs.appendFileSync(LOG, entry);
  console.log(entry.trim());
}

// --- HTTP debug endpoint (仅本地) ---
const DEBUG_PORT = parseInt(process.env.DEBUG_PORT || '0');
if (DEBUG_PORT) {
  createServer((req, res) => {
    if (req.url === '/debug') {
      const state = {
        clients: [...clients.keys()],
        inbox: Object.fromEntries([...inbox].map(([k, v]) => [k, v.length])),
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  }).listen(DEBUG_PORT, '127.0.0.1');
}

// --- WebSocket ---
const wss = new WebSocketServer({ port: PORT });
log(`listening ws://0.0.0.0:${PORT}${DEBUG_PORT ? `  debug http://127.0.0.1:${DEBUG_PORT}/debug` : ''}`);

wss.on('connection', (ws, req) => {
  let name = null;
  const ip = req.socket.remoteAddress;
  log(`new connection from ${ip}`);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // --- 注册（不碰收件箱） ---
      if (msg.type === 'hello') {
        name = msg.name;
        clients.set(name, ws);
        ws.send(JSON.stringify({ type: 'ok', name }));
        log(`${name} registered (ip=${ip})`);
        return;
      }

      // --- 显式拉取收件箱 ---
      if (msg.type === 'get_inbox' && name) {
        const queued = inbox.get(name) || [];
        log(`${name} get_inbox → ${queued.length} messages`);
        ws.send(JSON.stringify({ type: 'inbox', messages: queued }));
        if (queued.length) inbox.delete(name);
        return;
      }

      // --- 发送消息 ---
      if (msg.type === 'send' && name) {
        const { to, text } = msg;
        const envelope = { from: name, to, text, time: Date.now() };
        const target = clients.get(to);

        if (target && target.readyState === 1) {
          target.send(JSON.stringify({ type: 'message', ...envelope }));
          log(`${name} → ${to} (live)`);
        } else {
          if (!inbox.has(to)) inbox.set(to, []);
          inbox.get(to).push(envelope);
          log(`${name} → ${to} (inbox, now ${inbox.get(to).length} msgs)`);
        }

        ws.send(JSON.stringify({ type: 'ack', to }));
        return;
      }
    } catch {
      ws.send(JSON.stringify({ type: 'error', text: 'invalid json' }));
    }
  });

  ws.on('close', () => {
    if (name) {
      clients.delete(name);
      log(`${name} disconnected`);
    }
  });
});
