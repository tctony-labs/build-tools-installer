const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const config = require('../install-path');
const checkInstall = require('../check-install');

function setup(t, initial = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'path with spaces');
  let settings = { install_path: directory, ...initial };
  const calls = [];
  const state = {
    dirty: '',
    fail: '',
    settings: () => settings,
  };
  const source = (destination, label) => {
    fs.mkdirSync(path.join(destination, 'src'), { recursive: true });
    fs.writeFileSync(path.join(destination, 'src', 'xw'), label);
    fs.writeFileSync(
      path.join(destination, 'package.json'),
      JSON.stringify({ name: 'build-tools', dependencies: {} }),
    );
  };
  t.mock.method(config, 'load', () => settings);
  t.mock.method(config, 'save', (value) => {
    if (state.fail === 'save') throw new Error('save failed');
    settings = value;
  });
  t.mock.method(cp, 'spawnSync', (command, args, options) => {
    calls.push({ command, args, options });
    if (state.fail === args[0] || (state.fail === 'dependencies' && command.startsWith('npx'))) {
      return { status: 1, stderr: 'simulated failure' };
    }
    let stdout = '';
    if (args[0] === 'rev-parse') stdout = directory;
    if (args[0] === 'status') stdout = state.dirty;
    if (args[0] === 'clone') source(args.at(-1), 'new');
    if (command.startsWith('npx') && state.repair) source(options.cwd, 'repaired');
    return { status: 0, stdout };
  });
  return { root, directory, state, calls, source };
}

test('legacy checkout is replaced only after staging succeeds, preserving other configuration', async (t) => {
  const f = setup(t, { auto_update: true, last_update_time: '123' });
  f.source(f.directory, 'old');
  fs.mkdirSync(path.join(f.directory, '.git'));
  fs.writeFileSync(path.join(f.directory, '.git', 'legacy-history'), 'old');
  await checkInstall();
  assert.equal(fs.readFileSync(path.join(f.directory, 'src/xw'), 'utf8'), 'new');
  assert(!fs.existsSync(path.join(f.directory, '.git/legacy-history')));
  assert.deepEqual(f.state.settings(), {
    install_path: f.directory,
    auto_update: true,
    last_update_time: '123',
    rc_version: 1,
  });
  assert.deepEqual(fs.readdirSync(f.root), ['path with spaces']);
  const clone = f.calls.find((c) => c.args[0] === 'clone');
  assert(clone.args.includes('https://github.com/tctony-labs/build-tools.git'));
  assert(!f.calls.some((c) => ['remote', 'fetch', 'reset', 'checkout'].includes(c.args[0])));
});

for (const failure of ['clone', 'dependencies', 'save']) {
  test(`${failure} failure preserves the old checkout and permits retry`, async (t) => {
    const f = setup(t);
    f.source(f.directory, 'old');
    f.state.fail = failure;
    await assert.rejects(checkInstall());
    assert.equal(fs.readFileSync(path.join(f.directory, 'src/xw'), 'utf8'), 'old');
    assert.equal(f.state.settings().rc_version, undefined);
    assert.deepEqual(fs.readdirSync(f.root), ['path with spaces']);
    f.state.fail = '';
    await checkInstall();
    assert.equal(f.state.settings().rc_version, 1);
  });
}

for (const initial of [{}, { rc_version: 1 }]) {
  test(`missing directory installs successfully (rc ${
    initial.rc_version || 'absent'
  })`, async (t) => {
    const f = setup(t, initial);
    await checkInstall();
    assert.equal(f.state.settings().rc_version, 1);
    assert(fs.existsSync(path.join(f.directory, 'src/xw')));
  });
}

test('valid installation does not run Git or install dependencies', async (t) => {
  const f = setup(t, { rc_version: 1 });
  f.source(f.directory, 'existing');
  await checkInstall();
  assert.equal(f.calls.length, 0);
});

for (const scenario of ['unrelated', 'dirty', 'symlink']) {
  test(`refuses to replace ${scenario} installation`, async (t) => {
    const f = setup(t);
    if (scenario === 'symlink') {
      fs.symlinkSync(f.root, f.directory);
    } else {
      f.source(f.directory, 'keep');
      if (scenario === 'unrelated') {
        fs.writeFileSync(path.join(f.directory, 'package.json'), '{"name":"other-project"}');
      }
      if (scenario === 'dirty') f.state.dirty = ' M file';
    }
    await assert.rejects(checkInstall());
    assert(!f.calls.some((c) => c.args[0] === 'clone'));
    assert.equal(f.state.settings().rc_version, undefined);
  });
}

for (const version of ['2', 'invalid', '']) {
  test(`unsupported rc version ${JSON.stringify(
    version,
  )} never changes the installation`, async (t) => {
    const f = setup(t, { rc_version: version });
    await assert.rejects(checkInstall(), /Unsupported rc_version/);
    assert.equal(f.calls.length, 0);
  });
}

test('missing dependencies are repaired without recloning', async (t) => {
  const f = setup(t, { rc_version: 1 });
  f.source(f.directory, 'existing');
  fs.writeFileSync(
    path.join(f.directory, 'package.json'),
    '{"name":"build-tools","dependencies":{"missing-test-dependency":"1"}}',
  );
  f.state.repair = true;
  await checkInstall();
  assert(!f.calls.some((c) => c.args[0] === 'clone'));
  assert(f.calls.some((c) => c.command.startsWith('npx')));
});

test('first interactive installation saves the selected path only after success', async (t) => {
  const f = setup(t, { install_path: undefined });
  const previous = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
  t.after(() => {
    if (previous) Object.defineProperty(process.stdin, 'isTTY', previous);
    else delete process.stdin.isTTY;
  });
  let closed = false;
  t.mock.method(require('readline/promises'), 'createInterface', () => ({
    question: async () => f.directory,
    close: () => {
      closed = true;
    },
  }));
  await checkInstall();
  assert(closed);
  assert.equal(f.state.settings().install_path, f.directory);
  assert.equal(f.state.settings().rc_version, 1);
});

test('dependency checks support packages that do not export package.json', async (t) => {
  const f = setup(t, { rc_version: 1 });
  f.source(f.directory, 'existing');
  const dependency = path.join(f.directory, 'node_modules', 'restricted-exports');
  fs.mkdirSync(dependency, { recursive: true });
  fs.writeFileSync(path.join(dependency, 'package.json'), '{"exports":"./index.js"}');
  fs.writeFileSync(path.join(dependency, 'index.js'), 'module.exports = {};');
  fs.writeFileSync(
    path.join(f.directory, 'package.json'),
    '{"dependencies":{"restricted-exports":"1"}}',
  );
  await checkInstall();
  assert.equal(f.calls.length, 0);
});
