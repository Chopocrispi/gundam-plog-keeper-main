function safeHostname(url) {
  try { return new URL(url).hostname; } catch { return undefined; }
}

function extractOffers(payload) {
  const out = [];
  const tags = payload?.tags ?? [];
  for (const tag of tags) {
    const actions = tag?.actions ?? [];
    for (const action of actions) {
      const type = (action?.actionType || '').toLowerCase();
      if (!/product|shopping|visualsearch|pagesincluding/.test(type)) continue;
      const values = action?.data?.value ?? [];
      for (const v of values) {
        const url = v.hostPageUrl || v.url || v.webSearchUrl;
        const title = v.name || v.title || 'Product';
        if (!url) continue;
        const source = v.hostPageDomainFriendlyName || safeHostname(url) || (v.provider?.[0]?.name || undefined);
        const price = v?.offers?.[0]?.price ?? v?.aggregateOffer?.lowPrice ?? v?.insightsMetadata?.aggregateOffer?.lowPrice ?? undefined;
        const currency = v?.offers?.[0]?.priceCurrency ?? v?.aggregateOffer?.priceCurrency ?? v?.insightsMetadata?.aggregateOffer?.priceCurrency ?? undefined;
        out.push({
          title: String(title).slice(0, 140),
          url,
          price: typeof price === 'number' ? price : price ? Number(price) : undefined,
          currency: currency ? String(currency).toUpperCase() : undefined,
          source,
        });
      }
    }
  }
  const seen = new Set();
  return out.filter(o => { if (seen.has(o.url)) return false; seen.add(o.url); return true; });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  let imageUrl;
  try {
    imageUrl = req.body?.imageUrl || req.query?.imageUrl;
  } catch {
    imageUrl = undefined;
  }
  if (!imageUrl) {
    res.status(400).json({ error: 'imageUrl required' });
    return;
  }

  const endpoint = process.env.BING_VS_ENDPOINT || 'https://api.bing.microsoft.com/v7.0/images/visualsearch';
  const key = process.env.BING_VS_KEY;

  if (!key) {
    // Mock minimal result for local dev
    res.status(200).json([
      { title: 'Sample Merchant', url: 'https://example.com/product', price: 29.99, currency: 'USD', source: 'example.com' }
    ]);
    return;
  }

  try {
    const resp = await fetch(`${endpoint}?mkt=en-US`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageInfo: { url: imageUrl } }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      res.status(resp.status).send(text || 'search failed');
      return;
    }
    const data = await resp.json();
    res.status(200).json(extractOffers(data));
  } catch (e) {
    res.status(500).json({ error: e?.message || 'search failed' });
  }
}
