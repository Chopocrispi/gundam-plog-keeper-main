import type { VercelRequest, VercelResponse } from '@vercel/node';

// Allowlist specific domains only
const ALLOWED_HOSTS = new Set([
  'hobbygundamusa.com',
  'www.hobbygundamusa.com',
  'geosanbattle.com',
  'www.geosanbattle.com',
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const url = (req.query.url as string) || '';
    if (!url) return res.status(400).json({ error: 'Missing url' });
    const u = new URL(url);
    if (!ALLOWED_HOSTS.has(u.hostname)) {
      return res.status(403).json({ error: 'Host not allowed' });
    }

    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': (req.headers['accept'] as string) || '*/*',
        'user-agent': (req.headers['user-agent'] as string) || 'gundapp-proxy/1.0',
      },
    });

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('content-type', contentType);
    res.status(upstream.status);

    if (contentType.includes('application/json')) {
      const data = await upstream.json();
      return res.send(data);
    } else {
      const buf = await upstream.arrayBuffer();
      return res.send(Buffer.from(buf));
    }
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Proxy error' });
  }
}
