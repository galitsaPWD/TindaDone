const https = require('https');

const kvRequest = (commandArray, env) => {
  return new Promise((resolve, reject) => {
    if (!env.url || !env.token) return reject(new Error('DB_NOT_LINKED'));
    const targetUrl = env.url.endsWith('/') ? env.url : env.url + '/';
    try {
      const req = https.request(targetUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.token}`,
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
    if (uKey) url = process.env[uKey];
    if (tKey) token = process.env[tKey];
  }
  return { url, token };
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const env = getKVEnv();

  if (req.query.diag === 'true') {
    return res.status(200).json({ db_found: env.url ? 'YES' : 'NO', v: '9.0-unbreakable-array' });
  }

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const { deviceId, storeName } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

    const nowTimestamp = Date.now().toString();
    const checkData = await kvRequest(["GET", `trial:${deviceId}`], env);
    if (checkData.result) return res.status(200).json({ status: 'existing', startTime: checkData.result });

    await kvRequest(["SET", `trial:${deviceId}`, nowTimestamp], env);
    await kvRequest(["LPUSH", "recent_trials", JSON.stringify({ deviceId, storeName: storeName || 'Unknown Store', date: Date.now() })], env);

    return res.status(200).json({ status: 'success', startTime: nowTimestamp });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
