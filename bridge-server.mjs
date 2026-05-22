import { WebSocketServer } from "ws";
import { createServer } from "http";

const inbox = new Map();
const clients = new Map();

function getInbox(name) {
  const msgs = inbox.get(name) || [];
  inbox.delete(name);
  return msgs;
}

function addToInbox(name, msg) {
  const msgs = inbox.get(name) || [];
  msgs.push(msg);
  inbox.set(name, msgs);
}

const PORT = parseInt(process.env.PORT || "8080");
const server = createServer();

new WebSocketServer({ server }).on("connection", (ws) => {
  let registeredName = "";

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === "register" && data.name) {
        registeredName = data.name;
        clients.set(data.name, ws);
        ws.send(JSON.stringify({ type: "registered", name: data.name }));
      }
    } catch { /* ignore */ }
  });

  ws.on("close", () => { if (registeredName) clients.delete(registeredName); });
  ws.on("error", () => { if (registeredName) clients.delete(registeredName); });
});

server.on("request", (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/send") {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", () => {
      try {
        const { from, to, content } = JSON.parse(body);
        if (!from || !to || !content) {
          res.writeHead(400).end(JSON.stringify({ error: "missing from/to/content" }));
          return;
        }
        const msg = { id: Date.now().toString(36) + Math.random().toString(36).slice(2), from, to, content, time: new Date().toISOString() };
        addToInbox(to, msg);
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, id: msg.id }));
      } catch {
        res.writeHead(400).end(JSON.stringify({ error: "invalid json" }));
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/inbox") {
    const name = url.searchParams.get("name");
    if (!name) {
      res.writeHead(400).end(JSON.stringify({ error: "missing name" }));
      return;
    }
    const msgs = getInbox(name);
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ messages: msgs }));
    return;
  }

  res.writeHead(200).end("zee-bridge ok");
});

server.listen(PORT, () => console.log(`bridge on :${PORT}`));
