#!/usr/bin/env node
const handles = ['mg-rx-78-2-gundam-ver-30','gd-97-mg-rx-78-2-gundam-ver-30'];
(async()=>{
  for(const h of handles){
    const url = `https://newtype.us/products/${h}.js`;
    try{
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      console.log(url, 'status', res.status);
      const text = await res.text();
      console.log('body starts:', text.slice(0,300));
    }catch(e){
      console.log(url, 'error', e.message);
    }
  }
})();
