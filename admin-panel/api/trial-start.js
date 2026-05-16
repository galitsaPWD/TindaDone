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

const parseBody = (req) => new Promise((resolve) => {
  if (req.body && typeof req.body === 'object') return resolve(req.body);
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try { resolve(JSON.parse(body)); }
    catch (e) { resolve({}); }
  });
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const env = getKVEnv();

  if (req.query.diag === 'true') {
    const test = await kvRequest(["PING"], env).catch(e => ({ error: e.message }));
    return res.status(200).json({ 
      db_status: test.result === 'PONG' ? 'CONNECTED' : 'ERROR',
      db_error: test.error || null,
      v: '11.0-unbreakable' 
    });
  }

  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    
    if (!env.url || !env.token) {
       return res.status(500).json({ error: 'DATABASE_NOT_LINKED. Check Vercel Env Vars.' });
    }

    const body = await parseBody(req);
    const { deviceId, storeName } = body;
    
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

    const nowTimestamp = Date.now().toString();
    
    // 1. Log the trial attempt
    const logEntry = JSON.stringify({ 
      deviceId, 
      storeName: storeName || 'New Store', 
      date: new Date().toISOString() 
    });

    // 2. Perform DB operations
    const [setRes, pushRes] = await Promise.all([
       kvRequest(["SET", `trial:${deviceId}`, nowTimestamp], env),
       kvRequest(["LPUSH", "recent_trials", logEntry], env).catch(async (e) => {
          // If LPUSH fails (wrong type), try to heal by deleting the key and trying once more
          if (e.message.includes('WRONGTYPE')) {
            await kvRequest(["DEL", "recent_trials"], env);
            return kvRequest(["LPUSH", "recent_trials", logEntry], env);
          }
          throw e;
       })
    ]);

    return res.status(200).json({ 
      status: 'success', 
      startTime: nowTimestamp,
      sync: pushRes.error ? 'failed' : 'ok' 
    });
  } catch (error) {
    return res.status(500).json({ error: error.message, tip: 'Check database connection' });
  }
}
