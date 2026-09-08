#!/usr/bin/env node

const { resolve } = require('path');
const { getInstallPath } = require('./install-path');

(async function () {
  await require('./check-install')();
  const entry = resolve(getInstallPath(), 'src', 'xw');
  process.argv[1] = entry;
  require(entry);
})().catch((error) => {
  console.error(`Failed to start build tools: ${error.message}`);
  process.exitCode = 1;
});
