const https = require('https');

// 🔍 NATIVE HTTPS FETCH HELPER
const kvRequest = (url, options = {}) => {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      headers: {
        'Authorization': options.headers?.Authorization || '',
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ result: data }); }
      });
    });
    req.on('error', (e) => reject(e));
    if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
};

const getKVEnv = () => {
  let url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  let token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    const keys = Object.keys(process.env).sort();
    const uKey = keys.find(k => {
      const val = process.env[k];
      return (k.includes('REST_API_URL') || k.includes('REST_URL')) && val && val.startsWith('https://');
    });
    const tKey = keys.find(k => k.includes('REST_API_TOKEN') || k.includes('REST_TOKEN'));
    if (uKey) url = process.env[uKey];
    if (tKey) token = process.env[tKey];
  }
  return { url, token };
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { licenseKey, deviceId } = req.body;
  const { url: KV_URL, token: KV_TOKEN } = getKVEnv();
  if (!KV_URL || !KV_TOKEN) return res.status(200).json({ success: true });

  try {
    const getData = await kvRequest(`${KV_URL}/get/td_key_history`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
    let history = getData.result ? (typeof getData.result === 'string' ? JSON.parse(getData.result) : getData.result) : [];

    let found = false;
    history = history.map(h => {
      if (h.key === licenseKey || h.code === licenseKey) {
        found = true;
        return { ...h, activated: true, activatedDeviceId: deviceId, activatedAt: new Date().toLocaleString() };
      }
      return h;
    });

    if (found) {
      await kvRequest(`${KV_URL}/set/td_key_history`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        body: JSON.stringify(history)
      });
      return res.status(200).json({ success: true });
    }
    return res.status(404).json({ message: 'Key not found' });
  } catch (error) { return res.status(500).json({ error: error.message }); }
}
