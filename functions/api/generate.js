// Cloudflare Pages Function - /api/generate
// File: functions/api/generate.js

const CONFIG = {
  FIREBASE_URL: "https://minhmodvipp-default-rtdb.asia-southeast1.firebasedatabase.app",
  FIREBASE_SECRET: "FKi1wVhjM7ghLnWrAXi04TIRM1CkeuS9E3ymzGpo",
  TURNSTILE_SECRET: "FKi1wVhjM7ghLnWrAXi04TIRM1CkeuS9E3ymzGpo"
};

const URL_TEMPLATES = {
  'Taplayma': (token, url) => `https://api.taplayma.com/api?token=${token}&url=${encodeURIComponent(url)}&alias=`,
  'Link4m': (token, url) => `https://link4m.co/api-shorten/v2?api=${token}&url=${encodeURIComponent(url)}`,
  'YeuMoney': (token, url) => `https://yeumoney.com/QL_api.php?token=${token}&format=json&url=${encodeURIComponent(url)}`,
  'Traffic1M': (token, url) => `https://traffic1m.net/apidevelop?api=${token}&url=${encodeURIComponent(url)}`,
  'NhapMa': (token, url) => `https://service.nhapma.com/api?token=${token}&url=${encodeURIComponent(url)}&alias=`
};

function generateKey(keyFormat) {
  const charsetMap = {
    'AZ09': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    'AZ': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    '09': '0123456789',
    'az09': 'abcdefghijklmnopqrstuvwxyz0123456789'
  };

  const charset = charsetMap[keyFormat.Charset] || charsetMap['AZ09'];
  const segments = keyFormat.Segments || 4;
  const charsPerSeg = keyFormat.CharsPerSegment || 4;
  const prefix = keyFormat.Prefix || 'Minh-';

  let key = prefix;
  for (let i = 0; i < segments; i++) {
    let segment = '';
    for (let j = 0; j < charsPerSeg; j++) {
      segment += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    key += '-' + segment;
  }
  return key;
}

function calculateExpiration(hours) {
  const now = new Date();
  const expiry = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const yyyy = expiry.getFullYear();
  const mm = String(expiry.getMonth() + 1).padStart(2, '0');
  const dd = String(expiry.getDate()).padStart(2, '0');
  const hh = String(expiry.getHours()).padStart(2, '0');

  return {
    ExpiredDay: `${dd}/${mm}/${yyyy} ${hh}:00`,
    ExpiredDate: `${yyyy}-${mm}-${dd}-${hh}`
  };
}

async function loadConfig() {
  const url = `${CONFIG.FIREBASE_URL}/Config.json?auth=${CONFIG.FIREBASE_SECRET}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Cannot load config from Firebase');
  return await res.json();
}

async function shortenUrl(provider, targetUrl) {
  const template = URL_TEMPLATES[provider.Kind];
  if (!template) throw new Error(`Unknown provider: ${provider.Kind}`);

  const apiUrl = template(provider.Token, targetUrl);
  
  const res = await fetch(apiUrl, { 
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });
  
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${provider.Kind}`);
  
  const data = await res.json();
  
  const shortUrl = data.shortenedUr1 || 
                  data.shortened || 
                  data.short_url || 
                  data.url || 
                  data.shortenedUrl ||
                  data.link;
                  
  if (!shortUrl) {
    throw new Error(`No shortened URL in ${provider.Kind} response`);
  }
  
  return shortUrl;
}

async function verifyTurnstile(token) {
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `secret=${CONFIG.TURNSTILE_SECRET}&response=${token}`
  });
  
  const data = await res.json();
  return data.success;
}

// Cloudflare Pages Function entry point
export async function onRequest(context) {
  const request = context.request;
  
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ message: "Method not allowed" }), 
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    const body = await request.json();
    const { token, hours, keyType } = body;
    const h = parseInt(hours) || parseInt(keyType) || 12;

    if (!token) {
      return new Response(
        JSON.stringify({ message: "Thiếu captcha token!" }), 
        { status: 400, headers: corsHeaders }
      );
    }

    if (h !== 12 && h !== 24) {
      return new Response(
        JSON.stringify({ message: "hours phải là 12 hoặc 24" }), 
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify Turnstile
    const isValid = await verifyTurnstile(token);
    if (!isValid) {
      return new Response(
        JSON.stringify({ message: "Captcha không hợp lệ!" }), 
        { status: 403, headers: corsHeaders }
      );
    }

    // Load config
    const config = await loadConfig();
    if (!config) {
      return new Response(
        JSON.stringify({ message: "Không đọc được config từ Firebase!" }), 
        { status: 500, headers: corsHeaders }
      );
    }

    // Check providers
    const providers12h = (config.LinkProviders12h || []).filter(p => p.Enabled && p.Token);
    const providers24h = (config.LinkProviders24h || []).filter(p => p.Enabled && p.Token);

    if (h === 12 && providers12h.length === 0) {
      return new Response(
        JSON.stringify({ message: "Chưa cấu hình provider 12h trong dash!" }), 
        { status: 400, headers: corsHeaders }
      );
    }

    if (h === 24 && providers24h.length === 0) {
      return new Response(
        JSON.stringify({ message: "Chưa cấu hình provider 24h trong dash!" }), 
        { status: 400, headers: corsHeaders }
      );
    }

    // Generate key
    const keyFormat = config.KeyFormat || { Prefix: 'Minh', Segments: 4, CharsPerSegment: 4, Charset: 'AZ09' };
    const key = generateKey(keyFormat);

    // Calculate expiry
    const exp = calculateExpiration(h);

    // Save to Firebase
    const keyData = {
      ExpiredDay: exp.ExpiredDay,
      ExpiredDate: exp.ExpiredDate,
      CreatedAt: new Date().toISOString().split('T')[0],
      Type: "NORMAL",
      MaxDevices: config.MaxDevices || 1
    };

    const saveRes = await fetch(
      `${CONFIG.FIREBASE_URL}/ValidKeys/NormalKey/${key}.json?auth=${CONFIG.FIREBASE_SECRET}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keyData)
      }
    );
    
    if (!saveRes.ok) {
      return new Response(
        JSON.stringify({ message: "Lỗi lưu key vào Firebase!" }), 
        { status: 500, headers: corsHeaders }
      );
    }

    // Build callback URL
    const callbackUrl = config.CallbackUrl || "https://minhmodvipp.pages.dev/getkey";
    const separator = callbackUrl.includes('?') ? '&' : '?';
    let finalUrl = `${callbackUrl}${separator}key=${encodeURIComponent(key)}`;

    // Shorten URL chain
    let shortenedUrl = "";

    if (h === 12) {
      const provider = providers12h[0];
      shortenedUrl = await shortenUrl(provider, finalUrl);
    } else {
      const chain = [...providers24h].reverse();
      let currentUrl = finalUrl;
      
      for (const provider of chain) {
        currentUrl = await shortenUrl(provider, currentUrl);
      }
      shortenedUrl = currentUrl;
    }

    if (!shortenedUrl) {
      return new Response(
        JSON.stringify({ message: "Không tạo được link rút gọn!" }), 
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        url: shortenedUrl,
        key: key,
        hours: h,
        message: "Tạo key thành công!"
      }), 
      { status: 200, headers: corsHeaders }
    );

  } catch (e) {
    console.error('Error:', e);
    return new Response(
      JSON.stringify({ message: "Server lỗi: " + e.message }), 
      { status: 500, headers: corsHeaders }
    );
  }
}
