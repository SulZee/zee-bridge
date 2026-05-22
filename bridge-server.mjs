let kv = null;

async function getKv() {
  if (!kv) kv = await Deno.openKv();
  return kv;
}

async function readBody(req) {
  const buf = await req.arrayBuffer();
  const bytes = new Uint8Array(buf);
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text);
  } catch {
    try {
      const text = new TextDecoder("gbk").decode(bytes);
      return JSON.parse(text);
    } catch {
      throw new Error("cannot decode body");
    }
  }
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

async function archiveMessage(msg) {
  const db = await getKv();
  await db.set(["chat", msg.time, msg.id], msg);
}

async function getChatHistory(limit = 200) {
  const db = await getKv();
  const msgs = [];
  const iter = db.list({ prefix: ["chat"] }, { limit });
  for await (const entry of iter) {
    msgs.push(entry.value);
  }
  return msgs;
}

const CHAT_HTML = `<!doctype html>
<meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>小路 ↔ 西奥多</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font:14px/1.6 system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;max-width:720px;margin:0 auto;padding:20px}
h1{text-align:center;color:#e94560;margin-bottom:20px;font-size:18px}
.msg{padding:10px 14px;border-radius:8px;margin:6px 0;max-width:85%}
.msg.xiaolu{background:#16213e;margin-right:auto}
.msg.theodore{background:#2d1b3a;margin-left:auto}
.msg .sender{font-size:11px;color:#888;margin-bottom:2px}
.msg .time{font-size:10px;color:#555;float:right}
.msg .text{white-space:pre-wrap}
#tail{text-align:center;color:#555;font-size:12px;margin-top:16px}
</style>
<h1>小路 ↔ 西奥多</h1>
<div id=msgs></div>
<div id=tail>加载中…</div>
<script>
async function load(){
  try{
    const r=await fetch("/chat-data");const msgs=await r.json();
    const el=document.getElementById("msgs");
    if(msgs.length===0){el.innerHTML='<p style=text-align:center;color:#555>还没有消息</p>';return}
    el.innerHTML=msgs.map(m=>\`
      <div class="msg \${m.from==='小路'?'xiaolu':'theodore'}">
        <div class=sender>\${m.from} <span class=time>\${new Date(m.time).toLocaleString('zh-CN')}</span></div>
        <div class=text>\${m.content||''}</div>
      </div>\`).join('');
    document.getElementById("tail").textContent="自动刷新中… "+new Date().toLocaleTimeString('zh-CN');
  }catch(e){document.getElementById("tail").textContent="加载失败: "+e.message}
}
load();setInterval(load,3000);
</script>`;

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

  // Chat viewer page
  if (req.method === "GET" && url.pathname === "/chat") {
    return new Response(CHAT_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  // Chat data API
  if (req.method === "GET" && url.pathname === "/chat-data") {
    try {
      const msgs = await getChatHistory();
      return new Response(JSON.stringify(msgs), {
        headers: { "content-type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }

  // POST /send
  if (req.method === "POST" && url.pathname === "/send") {
    try {
      const body = await readBody(req);
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
      await archiveMessage(msg);
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
      // Archive retrieved messages too
      for (const m of msgs) {
        await archiveMessage(m);
      }
      return new Response(JSON.stringify({ messages: msgs }), {
        headers: { "content-type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }

  return new Response("zee-bridge ok");
}

export default { fetch: handleRequest };
