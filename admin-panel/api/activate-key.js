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
    if (uKey) { url = process.env[uKey]; token = process.env[tKey]; }
  }
  return { url, token };
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { licenseKey, deviceId } = req.body;
  const env = getKVEnv();
  if (!env.url || !env.token) return res.status(200).json({ success: true });

  try {
    const getData = await kvRequest(["GET", "td_key_history"], env);
    let history = getData.result ? (typeof getData.result === 'string' ? JSON.parse(getData.result) : getData.result) : [];
    if (!Array.isArray(history)) history = [];

    let foundEntry = null;
    history = history.map(h => {
      if (h.key === licenseKey || h.code === licenseKey) {
        foundEntry = { ...h, activated: true, activatedDeviceId: deviceId, activatedAt: new Date().toLocaleString() };
        return foundEntry;
      }
      return h;
    });

    if (foundEntry) {
      // 1. Update Global History
      await kvRequest(["SET", "td_key_history", JSON.stringify(history)], env);

      // 2. ⚡ Set Individual Status keys for fast checking
      const cleanId = deviceId.replace(/[^A-Z0-9]/g, '');
      await kvRequest(["SET", `activated:${cleanId}`, "true"], env);
      await kvRequest(["SET", `activated:${deviceId}`, "true"], env);

      return res.status(200).json({ success: true });
    }
    return res.status(404).json({ message: 'Key not found' });
  } catch (error) { return res.status(500).json({ error: error.message }); }
}
