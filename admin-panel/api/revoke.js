const https = require('https');

const parseBody = (req) => new Promise((resolve) => {
  if (req.method === 'GET' || req.method === 'OPTIONS') return resolve({});
  if (req.body) return resolve(req.body);
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try { resolve(JSON.parse(body)); }
    catch (e) { resolve({}); }
  });
});

const kvRequest = (commandArray, env) => {
  return new Promise((resolve, reject) => {
    if (!env.url || !env.token) return reject(new Error('DATABASE_NOT_LINKED'));
    try {
      const urlObj = new URL(env.url);
      const options = {
        method: 'POST',
        hostname: urlObj.hostname,
        path: urlObj.pathname + (urlObj.pathname.endsWith('/') ? '' : '/'),
        headers: {
          'Authorization': `Bearer ${env.token}`,
          'Content-Type': 'application/json'
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { resolve({ result: data }); }
        });
      });
      req.on('error', (e) => reject(e));
      req.write(JSON.stringify(commandArray));
      req.end();
    } catch (e) { reject(e); }
  });
};

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const env = getKVEnv();
  const adminPass = process.env.ADMIN_PASSWORD || 'xyuuki18';
  const body = await parseBody(req);
  const { password, deviceId, revoke } = body;

  if (password !== adminPass) return res.status(401).json({ error: 'Auth Failed' });

  try {
    const getData = await kvRequest(["GET", "td_key_history"], env);
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
    await kvRequest(["SET", "td_key_history", JSON.stringify(history)], env);

    // 2. ⚡ CRITICAL FIX: Set individual revocation key for the App to check
    // We set it for BOTH the raw code and the dashed key to be safe
    const cleanId = deviceId.replace(/[^A-Z0-9]/g, '');
    const dashedId = deviceId.includes('-') ? deviceId : `TD-${deviceId.slice(0, 4)}-${deviceId.slice(4, 8)}`;
    
    await kvRequest(["SET", `revoked:${cleanId}`, revoke ? "true" : "false"], env);
    await kvRequest(["SET", `revoked:${dashedId}`, revoke ? "true" : "false"], env);

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
