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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const env = getKVEnv();
  const adminPass = process.env.ADMIN_PASSWORD || 'xyuuki18';

  if (req.method === 'GET') {
    const { password } = req.query;
    if (password !== adminPass) return res.status(401).json({ error: 'Auth Failed: Invalid Password' });
    try {
      const data = await kvRequest(["GET", "td_key_history"], env);
      let history = [];
      if (data.result) {
        try { 
          history = typeof data.result === 'string' ? JSON.parse(data.result) : data.result; 
          if (!Array.isArray(history)) history = [];
        } catch (e) { 
          history = []; // 🛡️ Shield: Auto-heal corruption
        }
      }
      return res.status(200).json({ history });
    } catch (e) { return res.status(500).json({ error: `CRITICAL_GET_FAIL: ${e.message}` }); }
  }

  if (req.method === 'POST' || req.method === 'DELETE') {
    const body = await parseBody(req);
    const { password, entry, ts, fullHistory } = body;
    if (password !== adminPass) return res.status(401).json({ error: 'Auth Failed: Invalid Password' });

    try {
      let history = [];
      if (fullHistory && Array.isArray(fullHistory)) {
        history = fullHistory;
      } else {
        const getData = await kvRequest(["GET", "td_key_history"], env);
        try { 
          history = getData.result ? (typeof getData.result === 'string' ? JSON.parse(getData.result) : getData.result) : [];
          if (!Array.isArray(history)) history = [];
        } catch (e) { history = []; }

        if (req.method === 'POST') history.unshift(entry);
        else if (ts) history = history.filter(h => h.ts !== ts);
      }

      await kvRequest(["SET", "td_key_history", JSON.stringify(history)], env);
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: `CRITICAL_SET_FAIL: ${e.message}` }); }
  }
};
