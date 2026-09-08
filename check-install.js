const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { createRequire } = require('module');
const readline = require('readline/promises');
const config = require('./install-path');

const repository = 'https://github.com/tctony-labs/build-tools.git';

function run(command, args, cwd, capture = false) {
  const result = cp.spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    shell: process.platform === 'win32' && command === 'npx.cmd',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status}): ${result.stderr || ''}`,
    );
  }
  return (result.stdout || '').trim();
}

function installDependencies(directory) {
  run(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    [
      '--yes',
      '--registry=https://registry.npmjs.org/',
      'yarn@1.22.22',
      'install',
      '--frozen-lockfile',
      '--registry=https://registry.npmjs.org/',
    ],
    directory,
  );
}

function hasSource(directory) {
  return (
    fs.existsSync(path.join(directory, 'src', 'xw')) &&
    fs.existsSync(path.join(directory, 'package.json'))
  );
}

function hasDependencies(directory) {
  try {
    const filename = path.join(directory, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
    const resolve = createRequire(filename).resolve;
    return Object.keys(manifest.dependencies || {}).every((name) => resolve(name));
  } catch {
    return false;
  }
}

function checkExisting(directory) {
  if (fs.lstatSync(directory).isSymbolicLink() || !fs.statSync(directory).isDirectory()) {
    throw new Error(`Installation path must be a directory, not a file or symlink: ${directory}`);
  }
  const root = run('git', ['rev-parse', '--show-toplevel'], directory, true);
  if (fs.realpathSync(root) !== fs.realpathSync(directory)) {
    throw new Error(`Installation path is not a repository root: ${directory}`);
  }
  if (
    !hasSource(directory) ||
    JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')).name !== 'build-tools'
  ) {
    throw new Error(`Unrecognized build-tools checkout: ${directory}`);
  }
  if (run('git', ['status', '--porcelain', '--untracked-files=all'], directory, true)) {
    throw new Error(`Local changes found in ${directory}; save them before migration.`);
  }
}

async function checkInstall() {
  const settings = config.load();
  if (
    settings.rc_version !== undefined &&
    String(settings.rc_version) !== String(config.RC_VERSION)
  ) {
    throw new Error(
      `Unsupported rc_version: ${settings.rc_version}. Update the installer or correct ~/.xwrc.`,
    );
  }
  let directory = settings.install_path;
  if (!directory) {
    if (!process.stdin.isTTY) {
      throw new Error('Run xw in an interactive terminal to choose an installation directory.');
    }
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = (
        await prompt.question(`Install build tools to: (${config.defaultPath}) `)
      ).trim();
      directory = answer || config.defaultPath;
      if (directory.startsWith('~/'))
        directory = path.join(require('os').homedir(), directory.slice(2));
      directory = path.resolve(directory);
    } finally {
      prompt.close();
    }
  }
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) {
    throw new Error('install_path must be an absolute path.');
  }
  const exists = fs.existsSync(directory);
  if (exists && String(settings.rc_version) === String(config.RC_VERSION) && hasSource(directory)) {
    if (!hasDependencies(directory)) {
      checkExisting(directory);
      installDependencies(directory);
      if (!hasDependencies(directory))
        throw new Error('Dependency installation is incomplete; run xw again to retry.');
    }
    return;
  }
  if (exists) checkExisting(directory);
  // Stage beside the destination so the replacement stays on the same filesystem.
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(directory), '.build-tools-install-'));
  const checkout = path.join(staging, 'checkout');
  const backup = path.join(staging, 'previous');
  let movedOld = false;
  let movedNew = false;
  let preserveStaging = false;
  try {
    run('git', ['clone', '--branch', 'main', repository, checkout]);
    installDependencies(checkout);
    if (!hasSource(checkout) || !hasDependencies(checkout))
      throw new Error('The new checkout is incomplete.');
    if (exists) {
      fs.renameSync(directory, backup);
      movedOld = true;
    }
    fs.renameSync(checkout, directory);
    movedNew = true;
    config.save({ ...settings, install_path: directory, rc_version: config.RC_VERSION });
  } catch (error) {
    try {
      if (movedNew) fs.renameSync(directory, checkout);
      if (movedOld) fs.renameSync(backup, directory);
    } catch (rollbackError) {
      preserveStaging = true;
      throw new Error(
        `${error.message}; recovery failed: ${rollbackError.message}. Backup retained at ${backup}`,
      );
    }
    throw error;
  } finally {
    if (!preserveStaging) {
      try {
        fs.rmSync(staging, { recursive: true, force: true });
      } catch (error) {
        console.error(
          `Could not clean installation temporary directory ${staging}: ${error.message}`,
        );
      }
    }
  }
}

module.exports = checkInstall;
