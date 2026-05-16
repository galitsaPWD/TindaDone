export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { deviceId } = req.query;
  if (!deviceId) return res.status(400).json({ message: 'Missing deviceId' });

  const getKVEnv = () => {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    return { url, token };
  };

  const { url: KV_URL, token: KV_TOKEN } = getKVEnv();
  if (!KV_URL || !KV_TOKEN) return res.status(200).json({ revoked: false, activated: false });

  try {
    // Check both status keys
    const [revokedRes, activatedRes] = await Promise.all([
      fetch(`${KV_URL}/get/revoked:${deviceId}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } }),
      fetch(`${KV_URL}/get/activated:${deviceId}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } })
    ]);

    const revokedData = await revokedRes.json();
    const activatedData = await activatedRes.json();

    return res.status(200).json({ 
      revoked: revokedData.result === 'true',
      activated: activatedData.result === 'true'
    });
  } catch (error) {
    return res.status(200).json({ revoked: false, activated: false });
  }
}
