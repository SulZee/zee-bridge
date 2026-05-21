// bridge-server.mjs — 小路 ↔ 西奥多 WebSocket 中转站
// Deno Deploy 兼容
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const PORT = parseInt(Deno.env.get("PORT") || "18901");
const clients = new Map();
const inbox = new Map();

function log(line) {
  const t = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  console.log(`[${t}] ${line}`);
}

// --- WebSocket ---
const activeSockets = new Set();

serve((req) => {
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("bridge ok", { status: 200 });
  }

  const { socket: ws, response } = Deno.upgradeWebSocket(req);
  let name = null;

  ws.onopen = () => {
    activeSockets.add(ws);
    log(`new connection`);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      // --- 注册 ---
      if (msg.type === "hello") {
        name = msg.name;
        clients.set(name, ws);
        ws.send(JSON.stringify({ type: "ok", name }));
        log(`${name} registered`);
        return;
      }

      // --- 显式拉取收件箱 ---
      if (msg.type === "get_inbox" && name) {
        const queued = inbox.get(name) || [];
        log(`${name} get_inbox → ${queued.length} messages`);
        ws.send(JSON.stringify({ type: "inbox", messages: queued }));
        if (queued.length) inbox.delete(name);
        return;
      }

      // --- 发送消息 ---
      if (msg.type === "send" && name) {
        const { to, text } = msg;
        const envelope = { from: name, to, text, time: Date.now() };
        if (!inbox.has(to)) inbox.set(to, []);
        inbox.get(to).push(envelope);
        log(`${name} → ${to} (inbox, now ${inbox.get(to).length} msgs)`);
        ws.send(JSON.stringify({ type: "ack", to }));
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", text: "invalid json" }));
    }
  };

  ws.onclose = () => {
    activeSockets.delete(ws);
    if (name) {
      clients.delete(name);
      log(`${name} disconnected`);
    }
  };

  return response;
}, { port: PORT });

log(`listening ws://0.0.0.0:${PORT}`);
