import { dedupeOffers, titleSimilarity } from './lib/offers_utils.mjs';

function assert(cond, msg){ if(!cond) throw new Error(msg || 'Assertion failed'); }

function testHappyPath(){
  const offers = [
    { store: 'A', title: 'MG RX-78-2 Gundam Ver. 3.0', url: 'https://a.example/prod/1', price: 85.00 },
    { store: 'B', title: 'RX-78-2 Gundam (MG)', url: 'https://b.example/p/xyz', price: 82.50 },
    { store: 'C', title: 'MG RX-78-3 Gundam', url: 'https://c.example/p/3', price: 90.00 }
  ];
  const deduped = dedupeOffers(offers);
  // expect RX-78-2 grouped together, RX-78-3 separate -> length 2
  assert(deduped.length === 2, `expected 2 groups, got ${deduped.length}`);
  const groupKeys = deduped.map(d => d.title || d.url);
  console.log('happy path group reps:', groupKeys);
}

function testEdgeCase(){
  const offers = [
    { store: 'A', title: 'RX78 2 Gundam', url: 'u1', price: null },
    { store: 'B', title: 'RX-78-2 Gundam Ver 3', url: 'u2', price: 100 }
  ];
  const deduped = dedupeOffers(offers);
  assert(deduped.length === 1, `edge expected 1 group, got ${deduped.length}`);
  // price should prefer the priced one
  assert(deduped[0].price === 100, `expected price 100 got ${deduped[0].price}`);
  console.log('edge case rep:', deduped[0]);
}

function testSimilarity(){
  const s1 = 'MG RX-78-2 Gundam Ver. 3.0';
  const s2 = 'RX-78-2 Gundam (MG)';
  const sim = titleSimilarity(s1,s2);
  console.log('similarity', sim);
  assert(sim > 0.6, `similarity too low ${sim}`);
}

async function run(){
  testHappyPath();
  testEdgeCase();
  testSimilarity();
  console.log('ALL TESTS PASSED');
}

run().catch(err => { console.error(err); process.exit(2); });
