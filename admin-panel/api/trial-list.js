const https = require('https');

const kvRequest = (commandArray, env) => {
  return new Promise((resolve, reject) => {
    if (!env.url || !env.token) return reject(new Error('DATABASE_NOT_LINKED_ON_VERCEL'));
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
      req.on('error', (e) => reject(new Error(`NETWORK_ERROR: ${e.message}`)));
      req.write(JSON.stringify(commandArray));
      req.end();
    } catch (e) { reject(new Error(`URL_PARSE_ERROR: ${e.message}`)); }
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { password } = req.query;
  if (password !== (process.env.ADMIN_PASSWORD || 'xyuuki18')) return res.status(401).json({ error: 'Auth Failed: Invalid Password' });

  const env = getKVEnv();
  try {
    const data = await kvRequest(["LRANGE", "recent_trials", "0", "50"], env);
    return res.status(200).json({ logs: data.result || [] });
  } catch (error) { return res.status(500).json({ error: `CRITICAL_LIST_FAIL: ${error.message}` }); }
};
