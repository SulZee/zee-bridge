// Usage: node check.mjs <name>
const [,, name] = process.argv;
if (!name) {
  console.error("Usage: node check.mjs <name>");
  process.exit(1);
}
const SERVER = process.env.BRIDGE_URL || "https://zee-bridge.deno.dev";
const res = await fetch(`${SERVER}/inbox?name=${encodeURIComponent(name)}`);
const data = await res.json();
if (data.messages?.length) {
  for (const m of data.messages) {
    console.log(`[${m.time}] ${m.from}: ${m.content}`);
  }
} else {
  console.log("(empty)");
}
