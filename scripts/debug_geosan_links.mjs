import fetch from 'node-fetch';

(async ()=>{
  const bases = ['https://geosanbattle.com', 'https://www.geosan-battle.com', 'https://geosan-battle.com'];
  for(const base of bases){
    const u = `${base}/?s=MG%20RX-78-2%20Gundam%20Ver.%203.0&post_type=product`;
    try{
      console.log('\n--- fetching', u, '---');
      const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'}});
      console.log('status', r.status);
      const t=await r.text();
    const candidates = [];
    const re1 = /href\s*=\s*"([^"]*\/producto\/[^"]*)"/gi;
    const re2 = /href\s*=\s*"([^"]*\/product\/[^"]*)"/gi;
    let m;
    while((m=re1.exec(t))!==null){ candidates.push(m[1]); }
    while((m=re2.exec(t))!==null){ candidates.push(m[1]); }
    console.log('found candidate product links count', candidates.length);
    for(const c of candidates.slice(0,12)){
      const idx = t.indexOf(c);
      const ctx = t.slice(Math.max(0, idx-80), Math.min(t.length, idx+80));
      console.log('link', c, 'context...', ctx.replace(/\s+/g,' ').slice(0,160));
    }
    if(candidates.length===0){
      console.log('--- dump first 2000 chars of page for inspection ---');
      console.log(t.slice(0,2000));
      const checks = ['class="product"','class="products"','woocommerce','data-product','/producto/','/product/'];
      for(const c of checks){
        const idx = t.indexOf(c);
        console.log(c, 'found at', idx);
        if(idx>0){
          console.log('--- context for',c,'---');
          console.log(t.slice(Math.max(0, idx-200), Math.min(t.length, idx+200)).replace(/\s+/g,' ').slice(0,400));
        }
      }
    }
    }catch(e){ console.error('error for', base, e); }
  }
})();
