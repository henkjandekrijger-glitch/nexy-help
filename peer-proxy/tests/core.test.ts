import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify, redact, privatePerson, validId, overlap } from '../lib/peer-core.ts';
const secret = 'test-only-key-longer-than-32-characters';
test('session signatures reject forged payloads and different keys',()=>{
 const token=sign({uid:'a'.repeat(32),exp:Date.now()+10000},secret);
 assert.equal(verify(token,secret)?.uid,'a'.repeat(32));
 assert.equal(verify(token,secret+'x'),null);
 const forged=Buffer.from(JSON.stringify({uid:'b'.repeat(32),exp:Date.now()+10000})).toString('base64url')+'.'+token.split('.')[1];
 assert.equal(verify(forged,secret),null);
});
test('expired or malformed restore codes never authenticate',()=>{
 assert.equal(verify(sign({uid:'a',exp:Date.now()-1},secret),secret),null);
 for(const value of ['','a.b','a.b.c','x'.repeat(4000)]) assert.equal(verify(value,secret),null);
});
test('person response omits cross-user access and model session references',()=>{
 const safe=privatePerson({id:'private',cohort:'secret',sessionId:'model-secret',invitedBy:'someone',alias:'Ceder',insight:{summary:'only self'}});
 assert.deepEqual(Object.keys(safe).sort(),['alias','insight']);
});
test('sharing removes common contact identifiers',()=>{
 const result=redact('Mail me op test@example.com of https://example.com/private. Bel +31612345678.');
 assert.ok(!result.includes('test@example.com')); assert.ok(!result.includes('https://')); assert.ok(!result.includes('+31612345678'));
});
test('case ids cannot escape their store prefix',()=>{
 assert.ok(validId('a'.repeat(32))); for(const s of ['../people/abc','a'.repeat(31),'A'.repeat(32),'a/b']) assert.equal(validId(s),false);
});
test('topic overlap does not invent similarity',()=>{
 assert.equal(overlap(['gitaar','ritme'],['factuur','betaling']),0); assert.equal(overlap(['gitaar','ritme'],['Ritme oefenen']),1);
});
