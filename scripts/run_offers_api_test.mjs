import handler from '../api/offers.mjs';

function makeMockReq(query){
  return { query };
}
function makeMockRes(){
  let statusCode = 200;
  const headers = {};
  return {
    status(code){ statusCode = code; return this; },
    setHeader(k,v){ headers[k]=v; },
    json(obj){ console.log('STATUS', statusCode); console.log(JSON.stringify(obj, null, 2)); }
  };
}

(async ()=>{
  try{
    await handler(makeMockReq({ query: 'RX-78-2 Gundam (Ver.3.0)', grade: 'Master Grade (MG)' }), makeMockRes());
  }catch(e){ console.error(e); process.exit(1); }
})();
