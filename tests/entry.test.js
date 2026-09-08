const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapper-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const preload = path.join(directory, 'preload.js');
  fs.writeFileSync(preload, "require('os').homedir = () => process.env.BUILD_TOOLS_TEST_HOME;\n");
  return { directory, preload };
}

for (const [file, prefix] of [
  ['run.js', []],
  ['xwgn.js', ['gn']],
  ['xwnj.js', ['nj']],
]) {
  test(`${file} forwards argv, cwd, and exit status`, (t) => {
    const { directory, preload } = fixture(t);
    const checkout = path.join(directory, 'checkout with spaces');
    fs.mkdirSync(path.join(checkout, 'src'), { recursive: true });
    fs.writeFileSync(path.join(checkout, 'package.json'), '{"dependencies":{}}');
    fs.writeFileSync(
      path.join(checkout, 'src/xw'),
      [
        'console.log(JSON.stringify({ argv: process.argv, cwd: process.cwd() }));',
        'process.exitCode = 7;',
      ].join('\n'),
    );
    fs.writeFileSync(path.join(directory, '.xwrc'), `install_path=${checkout}\nrc_version=1\n`);
    const result = cp.spawnSync(
      process.execPath,
      [
        '--require',
        preload,
        path.resolve(__dirname, '..', file),
        '--example',
        'argument with spaces',
      ],
      {
        cwd: directory,
        env: { ...process.env, BUILD_TOOLS_TEST_HOME: directory },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 7, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(output.argv.slice(2), [...prefix, '--example', 'argument with spaces']);
    assert.equal(output.argv[1], path.join(checkout, 'src/xw'));
    assert.equal(fs.realpathSync(output.cwd), fs.realpathSync(directory));
  });
}

test('first run without a terminal fails without writing configuration', (t) => {
  const { directory, preload } = fixture(t);
  const result = cp.spawnSync(
    process.execPath,
    ['--require', preload, path.resolve(__dirname, '../run.js'), '--help'],
    { env: { ...process.env, BUILD_TOOLS_TEST_HOME: directory }, encoding: 'utf8' },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /interactive terminal/);
  assert(!fs.existsSync(path.join(directory, '.xwrc')));
});
