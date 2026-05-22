type Message = {
  id: string;
  from: string;
  to: string;
  content: string;
  time: string;
};

const inbox = new Map<string, Message[]>();

function getInbox(name: string): Message[] {
  const msgs = inbox.get(name) || [];
  inbox.delete(name);
  return msgs;
}

function addToInbox(name: string, msg: Message) {
  const msgs = inbox.get(name) || [];
  msgs.push(msg);
  inbox.set(name, msgs);
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // WebSocket upgrade
  const upgrade = req.headers.get("upgrade");
  if (upgrade && upgrade.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    let registeredName = "";

    socket.onmessage = (ev) => {
      try {
        const raw = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data);
        const data = JSON.parse(raw);
        if (data.type === "register" && data.name) {
          registeredName = data.name;
          socket.send(JSON.stringify({ type: "registered", name: data.name }));
        }
      } catch { /* ignore */ }
    };
    socket.onclose = null;
    socket.onerror = null;

    return response;
  }

  // POST /send
  if (req.method === "POST" && url.pathname === "/send") {
    try {
      const body = await req.json();
      if (!body.from || !body.to || !body.content) {
        return new Response(JSON.stringify({ error: "missing from/to/content" }), { status: 400 });
      }
      const msg: Message = {
        id: crypto.randomUUID(),
        from: body.from,
        to: body.to,
        content: body.content,
        time: new Date().toISOString(),
      };
      addToInbox(body.to, msg);
      return new Response(JSON.stringify({ ok: true, id: msg.id }), {
        headers: { "content-type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ error: "invalid json" }), { status: 400 });
    }
  }

  // GET /inbox?name=xxx
  if (req.method === "GET" && url.pathname === "/inbox") {
    const name = url.searchParams.get("name");
    if (!name) {
      return new Response(JSON.stringify({ error: "missing name" }), { status: 400 });
    }
    const msgs = getInbox(name);
    return new Response(JSON.stringify({ messages: msgs }), {
      headers: { "content-type": "application/json" },
    });
  }

  return new Response("zee-bridge ok");
}

export default {
  fetch: handleRequest,
};
