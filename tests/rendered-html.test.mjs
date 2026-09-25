import assert from 'node:assert/strict';
import test from 'node:test';
const { default: worker } = await import('../dist/server/index.js');
const ctx = {waitUntil(){},passThroughOnException(){}};
const base = {ASSETS:{fetch:async()=>new Response('not found',{status:404})}};
const request = (body,method='POST') => new Request('http://localhost/api/feedback',{method,headers:{'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
test('home renders the MiniMe application, not a starter screen',async()=>{
 const response=await worker.fetch(new Request('http://localhost/',{headers:{accept:'text/html'}}),base,ctx);
 assert.equal(response.status,200); const html=await response.text();
 assert.match(html,/<title>MiniMe<\/title>/); assert.match(html,/src="\/minime\/index.html"/);
 assert.doesNotMatch(html,/Your site is taking shape|Building your site/);
});
test('feedback rejects unsupported methods',async()=>{assert.equal((await worker.fetch(request(null,'GET'),base,ctx)).status,405)});
test('feedback rejects invalid email and missing consent',async()=>{
 for(const data of [{email:'invalid'},{email:'demo@example.com',helpfulFeature:'Planning',preorderInterest:'Feedback only',consent:false}])
 assert.equal((await worker.fetch(request(data),base,ctx)).status,400);
});
test('valid feedback uses bound SQL values and acknowledges persistence',async()=>{
 const writes=[];
 const env={...base,DB:{prepare(sql){let values=[];return{bind(...v){values=v;return this},async run(){writes.push({sql,values})}}}}};
 const response=await worker.fetch(request({email:'demo@example.com',helpfulFeature:'Planning',preorderInterest:'Feedback only',consent:true,feedback:"It's useful"}),env,ctx);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
 assert.equal(writes.length,2);assert.match(writes[1].sql,/VALUES \(\?,/);assert.equal(writes[1].values[1],'demo@example.com');
});
