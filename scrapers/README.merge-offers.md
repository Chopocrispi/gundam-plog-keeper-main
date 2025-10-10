# Building an offers index for the app

1) Run spiders per store for a query and grade (repeat for multiple kits):

```
scrapy crawl hgusa -a query="RGM-89 Jegan" -a grade="High Grade (HG)" -O out/hgusa_jegan.json
scrapy crawl geosan -a query="RGM-89 Jegan" -a grade="High Grade (HG)" -O out/geosan_jegan.json
```

2) Merge results into a simple index usable by the app (Node one-liner example):

```
node -e "const fs=require('fs');const p=(f)=>JSON.parse(fs.readFileSync(f,'utf8'));const A=p('out/hgusa_jegan.json').concat(p('out/geosan_jegan.json'));function norm(s){return (s||'').toLowerCase().replace(/[^a-z0-9\s-]/g,' ').replace(/\s+/g,' ').trim();}function abbr(g){g=(g||'').toLowerCase();if(g.includes('high grade'))return'hg';if(g.includes('real grade'))return'rg';if(g.includes('master grade'))return'mg';if(g.includes('perfect grade'))return'pg';if(g.includes('full mechanics'))return'fm';if(g.includes('super deformed'))return'sd';return'';}const idx={};for(const it of A){const key=norm(`${abbr(it.grade)} ${it.query||''}`.trim());if(!idx[key])idx[key]=[];idx[key].push({store:it.source,title:it.title,url:it.url,price:it.price,currency:it.currency});}fs.writeFileSync('public/offers.json',JSON.stringify(idx,null,2));console.log('Wrote public/offers.json with',Object.keys(idx).length,'keys');"
```

3) Point the app to `offers.json` instead of the sample file.
