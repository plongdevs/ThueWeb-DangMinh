const FIREBASE_URL  = "https://minhmodvipp-default-rtdb.asia-southeast1.firebasedatabase.app";
const FIREBASE_AUTH = "FKi1wVhjM7ghLnWrAXi04TIRM1CkeuS9E3ymzGpo";
const DESTINATION   = "https://minhmodvipp.pages.dev/getkey";
const KEY_PREFIX    = "Minh";

const LINK4M_API_1   = "686743fd8988f25f2e355b6c";
const LINK4M_API_2   = "69986a45fdc37d7e7135022c";
const TAPLAYMA_API_1 = "7384d5b7-c03a-4843-a7df-ad5bf1fabc48";
const TAPLAYMA_API_2 = "3c872457-4171-4a2e-adb8-3fdf3ddf5c18";

const ALLOWED_ORIGINS = ["https://minhmodvipp.pages.dev"];
const RATE_LIMIT = 3;
const ipHits = new Map();

// ── Helpers ───────────────────────────────────────────────────
function getCORS(origin) {
  return {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  };
}

function json(obj, status = 200, origin = "") {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...getCORS(origin) },
  });
}

async function fbSet(path, data) {
  return fetch(`${FIREBASE_URL}/${path}.json?auth=${FIREBASE_AUTH}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

async function fbDelete(path) {
  await fetch(`${FIREBASE_URL}/${path}.json?auth=${FIREBASE_AUTH}`, {
    method: "DELETE"
  }).catch(() => {});
}

function generateKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr   = crypto.getRandomValues(new Uint8Array(12));
  const rnd   = Array.from(arr).map(b => chars[b % chars.length]).join("");
  return `${KEY_PREFIX}-${rnd.slice(0,4)}-${rnd.slice(4,8)}-${rnd.slice(8,12)}`;
}

function randomLink4mKey()   { return Math.random() < 0.4 ? LINK4M_API_1   : LINK4M_API_2; }
function randomTaplaymaKey() { return Math.random() < 0.4 ? TAPLAYMA_API_1 : TAPLAYMA_API_2; }

async function shortenLink4m(targetUrl, apiKey) {
  const res  = await fetch(`https://link4m.co/api-shorten/v2?api=${apiKey}&url=${encodeURIComponent(targetUrl)}`);
  const data = await res.json();
  if (data.status !== "success" || !data.shortenedUrl) throw new Error("link4m_failed");
  return data.shortenedUrl;
}

async function shortenTaplayma(targetUrl, apiKey) {
  const res  = await fetch(`https://api.taplayma.com/api?token=${apiKey}&url=${encodeURIComponent(targetUrl)}`);
  const data = await res.json();
  if (data.status !== "success" || !data.shortenedUrl) throw new Error("taplayma_failed");
  return data.shortenedUrl;
}

// 24H: Taplayma → Link4m
async function buildChain(targetUrl) {
  const taplaymaUrl = await shortenTaplayma(targetUrl, randomTaplaymaKey());
  return await shortenLink4m(taplaymaUrl, randomLink4mKey());
}

// ── Pages Function entry point ────────────────────────────────
export async function onRequest(context) {
  const { request } = context;
  const origin = request.headers.get("Origin") || "";

  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: getCORS(origin) });

  if (!ALLOWED_ORIGINS.includes(origin))
    return json({ message: "forbidden" }, 403, origin);

  const url   = new URL(request.url);
  const hours = parseInt(url.searchParams.get("hours") || "12", 10);
  const ip    = request.headers.get("CF-Connecting-IP") || "unknown";

  if (hours !== 12 && hours !== 24)
    return json({ message: "invalid_hours" }, 400, origin);

  // Rate limit
  const hourKey = `${ip}_${Math.floor(Date.now() / 3600000)}`;
  const hits    = (ipHits.get(hourKey) || 0) + 1;
  ipHits.set(hourKey, hits);
  if (hits > RATE_LIMIT) return json({ message: "rate_limit" }, 429, origin);

  // Tạo key & lưu Firebase
  const key    = generateKey();
  const now    = Date.now();
  const expiry = now + hours * 3600000;

  const writeRes = await fbSet(`ValidKeys/NormalKey/${key}`, {
    Hours:          hours,
    ExpiryMs:       expiry,
    ExpiryReadable: new Date(expiry).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
    CreatedAt:      new Date(now).toISOString(),
    Type:           "NormalKey",
  });
  if (!writeRes.ok) return json({ message: "db_failed" }, 500, origin);

  // Tạo link
  const dest = `${DESTINATION}?key=${key}`;
  try {
    const shortUrl = hours === 12
      ? await shortenLink4m(dest, randomLink4mKey())
      : await buildChain(dest);
    return json({ url: shortUrl }, 200, origin);
  } catch (err) {
    await fbDelete(`ValidKeys/NormalKey/${key}`);
    return json({ message: err.message }, 500, origin);
  }
}
