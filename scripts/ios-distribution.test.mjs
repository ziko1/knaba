import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('iOS delivery CPU guards preserve source identity, export boundaries and actual test evidence', () => {
  const result = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'tests/ios', '-p', 'test_*.py', '-v'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', timeout: 60_000,
    env: {...process.env, PYTHONDONTWRITEBYTECODE: '1', NATIVE_SOURCE_SHA: ''},
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
});
