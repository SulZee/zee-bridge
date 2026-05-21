// bridge-server.mjs — 小路 ↔ 西奥多 WebSocket 中转站
// Deno Deploy 兼容版

const clients = new Map();
const inbox = new Map();

function log(line) {
  const t = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  console.log(`[${t}] ${line}`);
}

Deno.serve((req) => {
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("bridge ok");
  }

  const { socket: ws, response } = Deno.upgradeWebSocket(req);
  let name = null;

  ws.onopen = () => {
    log("new connection");
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "hello") {
        name = msg.name;
        clients.set(name, ws);
        ws.send(JSON.stringify({ type: "ok", name }));
        log(`${name} registered`);
        return;
      }

      if (msg.type === "get_inbox" && name) {
        const queued = inbox.get(name) || [];
        log(`${name} get_inbox -> ${queued.length} messages`);
        ws.send(JSON.stringify({ type: "inbox", messages: queued }));
        if (queued.length) inbox.delete(name);
        return;
      }

      if (msg.type === "send" && name) {
        const { to, text } = msg;
        const envelope = { from: name, to, text, time: Date.now() };
        if (!inbox.has(to)) inbox.set(to, []);
        inbox.get(to).push(envelope);
        log(`${name} -> ${to} (inbox ${inbox.get(to).length})`);
        ws.send(JSON.stringify({ type: "ack", to }));
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", text: "invalid json" }));
    }
  };

  ws.onclose = () => {
    if (name) {
      clients.delete(name);
      log(`${name} disconnected`);
    }
  };

  return response;
});

console.log("bridge server ready");
