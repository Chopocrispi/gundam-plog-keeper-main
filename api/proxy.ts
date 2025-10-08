import type { VercelRequest, VercelResponse } from '@vercel/node';

// Simple allowlist to avoid open proxy issues
const ALLOWED_HOSTS = new Set([
  'hobbygundamusa.com',
  'www.hobbygundamusa.com',
  'geosanbattle.com',
  'www.geosanbattle.com',
  'gunpla.es',
  'www.gunpla.es',
  'gundamplacestore.com',
  'www.gundamplacestore.com',
  'www.mechauniverse.es',
  'mechauniverse.es',
  'cdn.gunpladb.net',
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Allow browser access to the proxy response
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const url = (req.query.url as string) || '';
    if (!url) return res.status(400).json({ error: 'Missing url' });
    const u = new URL(url);
    if (!ALLOWED_HOSTS.has(u.hostname)) {
      return res.status(403).json({ error: 'Host not allowed' });
    }

    const method = req.method === 'HEAD' ? 'HEAD' : 'GET';
    const response = await fetch(url, {
      method,
      headers: {
        'accept': req.headers['accept'] as string || '*/*',
        'user-agent': req.headers['user-agent'] as string || 'gundapp-proxy/1.0',
      },
      // No CORS mode needed server-side
    });

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('content-type', contentType);
    res.status(response.status);

    if (method === 'HEAD') {
      return res.end();
    } else if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.send(data);
    } else {
      const buf = await response.arrayBuffer();
      return res.send(Buffer.from(buf));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Proxy error';
    return res.status(500).json({ error: msg });
  }
}
