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

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT; // e.g., https://<resource>.openai.azure.com
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini';

  // Mock fallback for local dev without keys
  if (!endpoint || !apiKey) {
    res.status(200).json({
      name: undefined,
      grade: undefined,
      scale: undefined,
      modelCode: undefined,
      candidates: [
        { name: 'HG 1/144 Gundam Aerial', grade: 'High Grade (HG)', confidence: 0.5 },
      ],
    });
    return;
  }

  const prompt = [
    'You are a Gunpla kit identifier. Given a box/art photo, extract:',
    '- name (e.g., HG 1/144 Gundam Aerial)',
    '- grade: one of "High Grade (HG)", "Real Grade (RG)", "Master Grade (MG)", "Perfect Grade (PG)", "Full Mechanics (FM)", "Super Deformed (SD)"',
    '- scale (e.g., 1/144, 1/100) if visible',
    '- modelCode if visible (e.g., XVX-016)',
    'Return ONLY strict JSON with fields: { name, grade, scale, modelCode, candidates }',
    'candidates is an array of { name, grade, confidence } with 1-3 options.',
  ].join('\n');

  try {
    const resp = await fetch(
      `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          temperature: 0.2,
          messages: [
            { role: 'system', content: 'Return only JSON. No extra text.' },
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imageUrl } },
              ],
            },
          ],
        }),
      }
    );

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      res.status(resp.status).send(text || 'identify failed');
      return;
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? '{}';
    let json;
    try { json = JSON.parse(content); } catch { json = {}; }
    res.status(200).json(json);
  } catch (e) {
    res.status(500).json({ error: e?.message || 'identify failed' });
  }
}
