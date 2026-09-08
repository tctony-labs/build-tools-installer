const path = require('path');
const os = require('os');
const fs = require('fs');
const ini = require('ini');

const RC_VERSION = 1;
const rcFile = path.join(os.homedir(), '.xwrc');
const defaultPath = path.join(os.homedir(), '.xiaowei_build_tools');

function load() {
  return fs.existsSync(rcFile) ? ini.parse(fs.readFileSync(rcFile, 'utf8')) : {};
}

function save(config) {
  const temporary = fs.mkdtempSync(path.join(path.dirname(rcFile), '.xwrc-'));
  try {
    const file = path.join(temporary, 'config');
    fs.writeFileSync(file, ini.stringify(config), { mode: 0o600 });
    fs.renameSync(file, rcFile);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function getInstallPath() {
  return load().install_path || defaultPath;
}

module.exports = { RC_VERSION, defaultPath, load, save, getInstallPath };
