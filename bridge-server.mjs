let kv = null;

async function getKv() {
  if (!kv) {
    kv = await Deno.openKv();
  }
  return kv;
}

async function getInbox(name) {
  const db = await getKv();
  const msgs = [];
  const iter = db.list({ prefix: ["inbox", name] });
  for await (const entry of iter) {
    msgs.push(entry.value);
    await db.delete(entry.key);
  }
  return msgs;
}

async function addToInbox(name, msg) {
  const db = await getKv();
  await db.set(["inbox", name, msg.id], msg);
}

async function handleRequest(req) {
  const url = new URL(req.url);

  // WebSocket upgrade
  const upgrade = req.headers.get("upgrade");
  if (upgrade && upgrade.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.onmessage = (ev) => {
      try {
        const raw = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data);
        const data = JSON.parse(raw);
        if (data.type === "register" && data.name) {
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
      const msg = {
        id: crypto.randomUUID(),
        from: body.from,
        to: body.to,
        content: body.content,
        time: new Date().toISOString(),
      };
      await addToInbox(body.to, msg);
      return new Response(JSON.stringify({ ok: true, id: msg.id }), {
        headers: { "content-type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }

  // GET /inbox?name=xxx
  if (req.method === "GET" && url.pathname === "/inbox") {
    const name = url.searchParams.get("name");
    if (!name) {
      return new Response(JSON.stringify({ error: "missing name" }), { status: 400 });
    }
    try {
      const msgs = await getInbox(name);
      return new Response(JSON.stringify({ messages: msgs }), {
        headers: { "content-type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }

  // GET /debug — check KV status
  if (req.method === "GET" && url.pathname === "/debug") {
    try {
      const db = await getKv();
      await db.set(["debug"], { ts: Date.now() });
      const result = await db.get(["debug"]);
      return new Response(JSON.stringify({ kv: "ok", val: result.value }), {
        headers: { "content-type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ kv: "error", error: e.message }), { status: 500 });
    }
  }

  return new Response("zee-bridge ok");
}

export default { fetch: handleRequest };
