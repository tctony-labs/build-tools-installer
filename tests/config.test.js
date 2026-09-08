const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('configuration saves atomically and preserves unrelated fields', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  t.mock.method(os, 'homedir', () => directory);
  const config = require('../install-path');
  config.save({ install_path: path.join(directory, 'checkout'), auto_update: true });
  config.save({ ...config.load(), rc_version: 1 });
  assert.equal(config.load().auto_update, true);
  assert.equal(String(config.load().rc_version), '1');
  const previous = fs.readFileSync(path.join(directory, '.xwrc'), 'utf8');
  t.mock.method(fs, 'renameSync', () => {
    throw new Error('simulated rename failure');
  });
  assert.throws(() => config.save({ rc_version: 2 }), /rename failure/);
  assert.equal(fs.readFileSync(path.join(directory, '.xwrc'), 'utf8'), previous);
  assert.deepEqual(fs.readdirSync(directory), ['.xwrc']);
});
