import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateStorage} from './storage.mjs';
const GiB=1024**3;
test('storage safety: normal, low-free, high-usage and critical profiles',()=>{
  assert.equal(evaluateStorage({total:200*GiB,available:40*GiB}).state,'healthy');
  const warning=evaluateStorage({total:197*GiB,available:7.6*GiB});
  assert.equal(warning.state,'warning');
  assert.equal(warning.cutoverAllowed,false);
  assert.equal(evaluateStorage({total:197*GiB,available:4*GiB}).state,'critical');
  assert.equal(evaluateStorage({total:500*GiB,available:15*GiB}).state,'warning');
  assert.equal(evaluateStorage({total:500*GiB,available:9*GiB}).state,'critical');
  assert.equal(evaluateStorage({total:197*GiB,available:35*GiB}).state,'healthy');
});
test('unknown/impossible measurements fail closed',()=>{
  for(const v of [
    {total:0,available:0},{total:197*GiB,available:-1},
    {total:197*GiB,available:210*GiB},{total:NaN,available:5},
  ])assert.throws(()=>evaluateStorage(v));
});
