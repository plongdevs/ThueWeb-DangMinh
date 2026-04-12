// Cloudflare Worker - Firebase Proxy
// Ẩn Firebase secret, app chỉ gọi Worker URL
// Endpoint: /proxy?path=/ValidKeys/...&method=GET|POST|DELETE

const CONFIG = {
  FIREBASE_URL: "https://zedping999-default-rtdb.asia-southeast1.firebasedatabase.app",
  FIREBASE_SECRET: "eeqLA8qlmxD1Wna21p6ds3xPj0kTowWOoM7vpAg6",
  APP_TOKEN: "7baee064c5e6331c62dedfe3fdb2ed68a6d4f22849134e9278f3a29c5051c84b"
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
  "Content-Type": "application/json"
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.searchParams.get("path") || "/";
    const method = url.searchParams.get("method") || request.method;

    const appToken = request.headers.get("X-App-Token");
    if (appToken !== CONFIG.APP_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid or missing X-App-Token" }),
        { status: 401, headers: corsHeaders }
      );
    }

    // FIX: Java app đã gửi path kèm .json, không cộng thêm nữa
    const firebasePath = path.endsWith(".json") ? path : path + ".json";
    const firebaseUrl = `${CONFIG.FIREBASE_URL}${firebasePath}?auth=${CONFIG.FIREBASE_SECRET}`;

    try {
      let body = null;
      if (["POST", "PUT", "PATCH"].includes(method)) {
        body = await request.text();
      }

      const fbResponse = await fetch(firebaseUrl, {
        method: method,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: body
      });

      const responseData = await fbResponse.text();

      return new Response(responseData, {
        status: fbResponse.status,
        headers: corsHeaders
      });

    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Proxy error", message: error.message }),
        { status: 500, headers: corsHeaders }
      );
    }
  }
};
