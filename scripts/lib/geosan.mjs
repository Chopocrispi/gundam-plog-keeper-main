// Shared Geosan Battle helpers reused by scripts and API
// Lightweight, depends only on global fetch and optional playwright for JS-render fallback
export function simpleNormalize(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }

export function scoreTitleForGeosan(title, qTokens, abbr){
  const t = simpleNormalize(title);
  if(abbr && !new RegExp(String.raw`(^|\s)${abbr.toLowerCase()}(\s|$)`).test(t)) return -1;
  if(/\b(cesta|raffle|sorteo)\b/.test(t)) return -1;
  let score = 0;
  for(const tok of qTokens) if(tok && t.includes(tok)) score += 1;
  if(/1\/(144|100|60)/.test(t)) score += 0.5;
  if(t.includes('gundam')) score += 0.25;
  if(/\b(clear|metallic|translucent|event|pearl|coating|ver\.|version)\b/.test(t)) score -= 0.5;
  return score;
}

import { extractModelParts } from './offers_utils.mjs';

// filter and prefer items that match query model base/variant and grade when possible
export function filterGeosanItems(items, query, grade = ''){
  if(!Array.isArray(items)) return [];
  const exclude = /\b(carta|promocional|pack|package|art collection|poster|cesta|raffle|sorteo|rifa|rifar|rifando|decal|gd-97|waterslide|sticker)\b/i;
  const queryHasVerKa = /\bver[\s.-]*ka\b/i.test(query) || /\bverka\b/i.test(query);
  const qParts = extractModelParts(query);
  const desiredGrade = (grade||'').toLowerCase();

  // score items: higher score if model base matches, variant matches, and grade token present
  function score(it){
    if(!it || !it.title) return -999;
    const txt = (it.title || it.url || '').toLowerCase();
    if(exclude.test(txt)) return -999;
    const isVerKa = /\bver[\s.-]*ka\b/i.test(it.title) || /ver-?ka/i.test(it.url || '');
    if(isVerKa && !queryHasVerKa) return -999;
    let s = 0;
    const ip = extractModelParts(it.title || it.url || '');
    if(qParts && ip){
      if(qParts.base === ip.base) s += 2;
      if(qParts.variant && ip.variant && qParts.variant === ip.variant) s += 2;
    }
    if(desiredGrade && (it.title || '').toLowerCase().includes(desiredGrade)) s += 1;
    // small boost for containing 'gundam' token
    if((it.title||'').toLowerCase().includes('gundam')) s += 0.5;
    return s;
  }

  const filtered = items.filter(it => {
    if(!it || !it.title) return false;
    const txt = (it.title || it.url || '').toLowerCase();
    if(exclude.test(txt)) return false;
    const isVerKa = /\bver[\s.-]*ka\b/i.test(it.title) || /ver-?ka/i.test(it.url || '');
    if(isVerKa && !queryHasVerKa) return false;
    // if user requested a grade like 'mg', exclude clearly different grades (sd/hg/rg/pg) to be strict
    if(desiredGrade){
      const gradeTokens = ['sd','hg','rg','pg','fm','sdex','sd gundam','mega','mega size'];
      // if the item explicitly mentions a different grade token, exclude it
      for(const gt of gradeTokens){
        if(gt === desiredGrade) continue;
        if(txt.includes(gt)) return false;
      }
    }
    return true;
  });

  // sort by score desc so better matches appear first
  filtered.sort((a,b)=> score(b) - score(a));
  return filtered;
}

export async function geosanPickLinks(query, grade){
  const base = 'https://geosanbattle.com';
  const qTokens = simpleNormalize(query).split(' ').filter(Boolean).filter(t=>t.length>1);
  const abbr = (grade||'').toUpperCase().split('(')[0].trim();
  async function fetchAndScore(url){
    try{
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if(!res.ok) return [];
      const html = await res.text();
      const linkRegex = /<a\s+[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/gi;
      const candidates = [];
      let m;
      while((m = linkRegex.exec(html)) !== null){
        const href = m[1];
        const text = m[2] || '';
        if(!/\/producto\//i.test(href)) continue;
        const score = scoreTitleForGeosan(text, qTokens, abbr);
        if(score>0) candidates.push({ href, text, score });
      }
      candidates.sort((a,b)=>b.score-a.score);
      return candidates.map(c=> c.href.startsWith('http') ? c.href : base.replace(/\/$/,'') + c.href ).slice(0,5);
    }catch(e){ return []; }
  }

  const url1 = `${base}/?s=${encodeURIComponent(query)}&post_type=product`;
  let pick = await fetchAndScore(url1);
  if(pick && pick.length) return pick;
  const url2 = `${base}/?s=${encodeURIComponent(query)}`;
  pick = await fetchAndScore(url2);
  if(pick && pick.length) return pick;

  try{
    const ajaxUrlBase = `${base}/wp-admin/admin-ajax.php`;
    const tryAjaxOnce = async (qstr, paramName) => {
      try{
        const url = `${ajaxUrlBase}?action=thaps_ajax_get_search_value&${paramName}=${encodeURIComponent(qstr)}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if(!res.ok) return [];
        const data = await res.json().catch(()=>null);
        if(!data || !Array.isArray(data.suggestions)) return [];
        const prod = data.suggestions.filter(s => s && s.type === 'product' && s.url).map(s => s.url.startsWith('http') ? s.url : (s.url.startsWith('/') ? `${base}${s.url}` : `${base}/${s.url}`));
        return Array.from(new Set(prod)).slice(0,10);
      }catch(e){ return []; }
    };

    const variants = [];
    const qnorm = query.replace(/\s+/g,' ').trim();
    variants.push(qnorm);
    variants.push(qnorm.replace(/ver\.?\s*\d+(?:\.\d+)*/i, '').trim());
    const toks = qnorm.split(/\s+/).filter(Boolean);
    if(toks.length>1) variants.push(`${toks[0]} ${toks[1]}`);
    const modelMatch = qnorm.match(/(mg|hg|rg|pg|sd)?\s*(rx\-?\d{2}(?:\-?\d)?)/i);
    if(modelMatch){
      const prefix = (modelMatch[1]||'').trim();
      const model = modelMatch[2];
      variants.push(((prefix?prefix+' ':'') + model).trim());
      variants.push(model.replace(/-/g,''));
    }
    variants.push(qnorm.split(' ').slice(0,2).join(' '));
    variants.push(qnorm.split(' ').slice(0,1).join(' '));

    for(const v of Array.from(new Set(variants)).filter(Boolean)){
      let res = await tryAjaxOnce(v, 'match');
      if(res && res.length) return res;
      res = await tryAjaxOnce(v, 'query');
      if(res && res.length) return res;
    }
  }catch(e){ /* ignore */ }

  try{
    const rendered = await renderAndExtractProductLinks(`${base}/?s=${encodeURIComponent(query)}&post_type=product`, '/a[contains(@href, "/producto/")]');
    if(rendered && rendered.length) return rendered;
  }catch(e){ /* ignore */ }
  return pick;
}

export async function renderAndExtractProductLinks(url, xpathOrSelector){
  let playwright;
  try{ playwright = await import('playwright'); }catch(e){ return []; }
  const browser = await playwright.chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
  const ctx = await browser.newContext({ userAgent: ua });
  const page = await ctx.newPage();
  try{
    try{ await page.goto(url, { waitUntil: 'networkidle' , timeout: 60000}); }catch(e){ await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000}); await page.waitForTimeout(2500); }
    let hrefs = [];
    try{
      const handles = await page.$x(xpathOrSelector).catch(()=>[]);
      for(const h of handles.slice(0,10)){
        const v = await (await h.getProperty('href')).jsonValue().catch(()=>null);
        if(v) hrefs.push(String(v));
      }
    }catch(e){ }
    if(hrefs.length === 0){ hrefs = await page.$$eval('a[href*="/producto/"]', els => els.slice(0,10).map(a=>a.href)); }
    await browser.close();
    return hrefs.map(h => h.startsWith('http') ? h : `https://geosanbattle.com${h}`);
  }catch(e){ await browser.close(); throw e; }
}
