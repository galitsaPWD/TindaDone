
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
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

  const checkAuth = (p) => {
    if (!p) return false;
    return p.trim().toLowerCase() === adminPass.toLowerCase();
  };

  if (req.method === 'GET') {
    const { password } = req.query;
    if (!checkAuth(password)) {
      return res.status(401).json({ 
        error: 'Auth Failed: Invalid Password',
        debug: { received: password || 'NONE' }
      });
    }

    try {
      const response = await fetch(`${env.url}/get/td_key_history`, {
        headers: { Authorization: `Bearer ${env.token}` }
      });
      const data = await response.json();
      let history = [];
      if (data.result) {
        try { 
          history = typeof data.result === 'string' ? JSON.parse(data.result) : data.result; 
          if (!Array.isArray(history)) history = [];
        } catch (e) { history = []; }
      }
      return res.status(200).json({ history });
    } catch (e) { return res.status(500).json({ error: `CRITICAL_GET_FAIL: ${e.message}` }); }
  }

  if (req.method === 'POST' || req.method === 'DELETE') {
    const body = await parseBody(req);
    const { password, entry, ts, fullHistory } = body;
    if (!checkAuth(password)) {
      return res.status(401).json({ 
        error: 'Auth Failed: Invalid Password',
        debug: { received: password || 'NONE' }
      });
    }

    try {
      let history = [];
      if (fullHistory && Array.isArray(fullHistory)) {
        history = fullHistory;
      } else {
        const getRes = await fetch(`${env.url}/get/td_key_history`, {
          headers: { Authorization: `Bearer ${env.token}` }
        });
        const getData = await getRes.json();
        try { 
          history = getData.result ? (typeof getData.result === 'string' ? JSON.parse(getData.result) : getData.result) : [];
          if (!Array.isArray(history)) history = [];
        } catch (e) { history = []; }

        if (req.method === 'POST') history.unshift(entry);
        else if (ts) history = history.filter(h => h.ts !== ts);
      }

      await fetch(`${env.url}/set/td_key_history`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.token}` },
        body: JSON.stringify(history)
      });
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: `CRITICAL_SET_FAIL: ${e.message}` }); }
  }
}
