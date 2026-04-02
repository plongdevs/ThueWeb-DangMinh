// Cloudflare Pages Function - /api/generate
// File: functions/api/generate.js

const CONFIG = {
  FIREBASE_URL: "https://minhmodvippp-default-rtdb.asia-southeast1.firebasedatabase.app",
  // LƯU Ý: Ở bản thực tế, hãy dùng context.env.FIREBASE_SECRET thay vì hardcode thế này nhé
  FIREBASE_SECRET: "QebyvSY4drgbk1f0xvzML9qKPe0GZhEV9b7XupNp"
};

const URL_TEMPLATES = {
  'Taplayma': (token, url) => `https://api.taplayma.com/api?token=${token}&url=${encodeURIComponent(url)}&alias=`,
  'Link4m': (token, url) => `https://link4m.co/api-shorten/v2?api=${token}&url=${encodeURIComponent(url)}`,
  'YeuMoney': (token, url) => `https://yeumoney.com/QL_api.php?token=${token}&format=json&url=${encodeURIComponent(url)}`,
  'Traffic1M': (token, url) => `https://traffic1m.net/apidevelop?api=${token}&url=${encodeURIComponent(url)}`,
  'Traffic68': (token, url) => `https://traffic68.com/api/quicklink/api?api=${token}&url=${encodeURIComponent(url)}&alias=`,
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
  const prefix = keyFormat.Prefix || 'UserMinhMod'; // Lấy mặc định theo config mới của bạn

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
  const vnTime = new Date(now.getTime() + (hours + 7) * 60 * 60 * 1000); // Giờ VN (UTC+7)

  const yyyy = vnTime.getUTCFullYear();
  const mm = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(vnTime.getUTCDate()).padStart(2, '0');
  const hh = String(vnTime.getUTCHours()).padStart(2, '0');

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

  if (!shortUrl) throw new Error(`No shortened URL in ${provider.Kind} response`);

  return shortUrl;
}

export async function onRequest(context) {
  const request = context.request;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return new Response(JSON.stringify({ message: "Method not allowed" }), { status: 405, headers: corsHeaders });

  try {
    const body = await request.json();
    const h = parseInt(body.hours) || parseInt(body.keyType) || 5;

    const config = await loadConfig();
    if (!config) return new Response(JSON.stringify({ message: "Không đọc được config từ Firebase!" }), { status: 500, headers: corsHeaders });

    // LƯỜI HACK: Lấy luôn data từ mảng LinkProviders12h bất kể client gửi lên mấy giờ =))
    const providers = (config.LinkProviders12h || []).filter(p => p.Enabled && p.Token);

    if (providers.length === 0) {
      return new Response(JSON.stringify({ message: "Chưa cấu hình provider 12h trên Firebase (hoặc đang bị disable)!" }), { status: 400, headers: corsHeaders });
    }

    // Vẫn generate key và thời hạn dựa vào số giờ gửi lên (h = 5)
    const keyFormat = config.KeyFormat || { Prefix: 'UserMinhMod', Segments: 4, CharsPerSegment: 4, Charset: 'AZ09' };
    const key = generateKey(keyFormat);
    const exp = calculateExpiration(h); 

    const vnNow = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
    const createdAt = vnNow.getUTCFullYear() + '-' + String(vnNow.getUTCMonth() + 1).padStart(2, '0') + '-' + String(vnNow.getUTCDate()).padStart(2, '0');

    const keyData = {
      ExpiredDay: exp.ExpiredDay,
      ExpiredDate: exp.ExpiredDate,
      CreatedAt: createdAt,
      Type: "NORMAL",
      MaxDevices: config.MaxDevices || 1
    };

    // Lưu key vào Firebase
    const saveRes = await fetch(`${CONFIG.FIREBASE_URL}/ValidKeys/NormalKey/${key}.json?auth=${CONFIG.FIREBASE_SECRET}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(keyData)
    });

    if (!saveRes.ok) throw new Error("Lỗi lưu key vào Firebase!");

    // Lấy callback URL từ config hoặc set mặc định
    const callbackUrl = config.CallbackUrl || "https://gamebooster.thedev.me/getkey";
    const separator = callbackUrl.includes('?') ? '&' : '?';
    const finalUrl = `${callbackUrl}${separator}key=${encodeURIComponent(key)}`;

    // Sử dụng config 12h (phần tử đầu tiên) để tạo link rút gọn
    const shortenedUrl = await shortenUrl(providers[0], finalUrl);

    // Trả về JSON hoàn chỉnh cho Frontend
    return new Response(JSON.stringify({ 
      success: true, 
      url: shortenedUrl, 
      key: key, 
      hours: h 
    }), { status: 200, headers: corsHeaders });

  } catch (e) {
    return new Response(JSON.stringify({ message: "Server lỗi: " + e.message }), { status: 500, headers: corsHeaders });
  }
}
