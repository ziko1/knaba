import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('sign-in card includes padding inside viewport width for 320px devices',()=>{
 const code=readFileSync(new URL('./server.mjs',import.meta.url),'utf8');
 assert.match(code,/main\{[^}]*box-sizing:border-box;[^}]*width:min\(400px,calc\(100vw - 32px\)\)/);
});
