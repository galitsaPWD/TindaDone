
const parseBody = (req) => new Promise((resolve) => {
  if (req.method === 'GET' || req.method === 'OPTIONS') return resolve({});
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try { resolve(JSON.parse(body)); }
    catch (e) { resolve({}); }
  });
});

export default async function handler(req, res) {
  // 🛡️ Robust CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const getKVEnv = () => {
    let url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    let token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        const keys = Object.keys(process.env).sort();
        const uKey = keys.find(k => (k.includes('REST_API_URL') || k.includes('REST_URL')) && process.env[k]?.startsWith('https://'));
        const tKey = keys.find(k => k.includes('REST_API_TOKEN') || k.includes('REST_TOKEN'));
        if (uKey) { url = process.env[uKey]; token = process.env[tKey]; }
    }
    return { url, token };
  };

  const env = getKVEnv();
  const adminPass = 'xyuuki18'; // 🚀 FORCED MASTER PASSWORD
  const body = await parseBody(req);
  const { password, deviceId, revoke } = body;

  if (!password || password.trim().toLowerCase() !== adminPass.toLowerCase()) {
    return res.status(401).json({ error: 'Auth Failed' });
  }

  try {
    const getRes = await fetch(`${env.url}/get/td_key_history`, {
      headers: { Authorization: `Bearer ${env.token}` }
    });
    const getData = await getRes.json();
    let history = [];
    if (getData.result) {
      history = typeof getData.result === 'string' ? JSON.parse(getData.result) : getData.result;
    }

    history = history.map(h => {
      if (h.code === deviceId || h.key === deviceId || (h.code && deviceId.includes(h.code))) {
        return { ...h, revoked: revoke };
      }
      return h;
    });

    // 1. Update Global History
    await fetch(`${env.url}/set/td_key_history`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}` },
      body: JSON.stringify(history)
    });

    // 2. ⚡ Set Individual Revocation keys
    const cleanId = deviceId.replace(/[^A-Z0-9]/g, '');
    await fetch(`${env.url}/set/revoked:${cleanId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.token}` },
      body: revoke ? "true" : "false"
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
