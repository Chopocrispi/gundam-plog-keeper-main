import fs from 'node:fs';

function show(name){
  const file = `scrapers/out/products-${name}.json`;
  if(!fs.existsSync(file)) return console.log(name, 'missing file');
  const arr = JSON.parse(fs.readFileSync(file,'utf8'));
  console.log(name, 'count', arr.length);
  if(arr.length){
    console.log(' first:', { url: arr[0].url, title: arr[0].title, price: arr[0].price });
    console.log(' last :', { url: arr[arr.length-1].url, title: arr[arr.length-1].title, price: arr[arr.length-1].price });
  }
}

show('USA_Gundam_Store');
show('Gundam_Planet');
