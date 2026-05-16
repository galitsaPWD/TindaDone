
export default async function handler(req, res) {
  // 🛡️ Robust CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { password } = req.query;
  const rawAdminPass = process.env.ADMIN_PASSWORD;
  const adminPass = (rawAdminPass && rawAdminPass.trim().length > 0) ? rawAdminPass.trim() : 'xyuuki18';

  if (!password || password.trim().toLowerCase() !== adminPass.toLowerCase()) {
    return res.status(401).json({ 
      error: 'Auth Failed: Invalid Password',
      debug: {
        server_has_env: rawAdminPass ? 'YES' : 'NO (Using Default)'
      }
    });
  }

  const getKVEnv = () => {
    let url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    let token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!url || !token) {
        // Fallback search for any KV-like keys
        const keys = Object.keys(process.env).sort();
        const uKey = keys.find(k => (k.includes('REST_API_URL') || k.includes('REST_URL')) && process.env[k]?.startsWith('https://'));
        const tKey = keys.find(k => k.includes('REST_API_TOKEN') || k.includes('REST_TOKEN'));
        if (uKey) { url = process.env[uKey]; token = process.env[tKey]; }
    }
    return { url, token };
  };

  const env = getKVEnv();
  
  try {
    const response = await fetch(`${env.url}/lrange/recent_trials/0/50`, {
      headers: { Authorization: `Bearer ${env.token}` }
    });
    const data = await response.json();
    return res.status(200).json({ logs: data.result || [] });
  } catch (error) {
    return res.status(500).json({ error: `CRITICAL_LIST_FAIL: ${error.message}` });
  }
}
