import type { VercelRequest, VercelResponse } from '@vercel/node';

// Simple allowlist to avoid open proxy issues
const ALLOWED_HOSTS = new Set([
  'hobbygundamusa.com',
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const url = (req.query.url as string) || '';
    if (!url) return res.status(400).json({ error: 'Missing url' });
    const u = new URL(url);
    if (!ALLOWED_HOSTS.has(u.hostname)) {
      return res.status(403).json({ error: 'Host not allowed' });
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': req.headers['accept'] as string || '*/*',
        'user-agent': req.headers['user-agent'] as string || 'gundapp-proxy/1.0',
      },
      // No CORS mode needed server-side
    });

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('content-type', contentType);
    res.status(response.status);

    if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.send(data);
    } else {
      const buf = await response.arrayBuffer();
      return res.send(Buffer.from(buf));
    }
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Proxy error' });
  }
}
