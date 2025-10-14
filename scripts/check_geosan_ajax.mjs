import fetch from 'node-fetch';

const base = 'https://geosanbattle.com';
const queries = [
  'MG RX-78-2 Gundam Ver. 3.0',
  'MG RX-78-2',
  'RX-78-2',
  'RX-78',
  'RX78',
  'RX78-2',
  'MG RX78-2',
  'gundam rx78'
];
const ajax = `${base}/wp-admin/admin-ajax.php`;

async function callFor(qStr, param){
  const url = `${ajax}?action=thaps_ajax_get_search_value&${param}=${encodeURIComponent(qStr)}`;
  try{
    const res = await fetch(url, { headers: { 'User-Agent':'Mozilla/5.0' } });
    const txt = await res.text();
    let parsed = null;
    try{ parsed = JSON.parse(txt); } catch(e){}
    console.log('\nQuery:', qStr, 'param:', param, 'Status:', res.status, 'parsedArray:', Array.isArray(parsed) ? parsed.length : (parsed && parsed.suggestions ? parsed.suggestions.length : 'n/a'));
    if(parsed && parsed.suggestions) console.log(' sample:', JSON.stringify(parsed.suggestions.slice(0,6), null, 2));
    else console.log(' raw:', txt.slice(0,200));
  }catch(e){ console.error(e.message); }
}

(async ()=>{
  for(const q of queries){
    await callFor(q, 'match');
    await callFor(q, 'query');
  }
})();
