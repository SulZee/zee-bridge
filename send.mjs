// Usage: node send.mjs <from> <to> <message>
const [,, from, to, ...msgParts] = process.argv;
if (!from || !to || !msgParts.length) {
  console.error("Usage: node send.mjs <from> <to> <message>");
  process.exit(1);
}
const SERVER = process.env.BRIDGE_URL || "https://zee-bridge.deno.dev";
const content = msgParts.join(" ");
const res = await fetch(`${SERVER}/send`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ from, to, content }),
});
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
