# Build tools installer

Installs the general-purpose build toolkit integrating depot_tools, gclient, GN, and Ninja from the Git checkout of [build-tools](https://github.com/tctony-labs/build-tools) and provides the `xw`, `xwgn`, and `xwnj` commands. Requires Node.js 18 or newer, npm, and Git.

## Installation

```sh
npm install -g @tctony/build-tools --registry=https://registry.npmjs.org/
xw --help
```

Installing the npm package only registers the wrappers. The first invocation asks where to clone build-tools; press Enter to use `~/.xiaowei_build_tools`. Installation requires access to GitHub and the public npm registry. Run the initial setup in an interactive terminal.

The installer uses Yarn 1.22.22 via npx to install the checkout's locked dependencies from the public registry. Native builds additionally require the appropriate platform compiler and Python. The checkout manages its own Chromium depot_tools installation when needed.

```sh
xw --help
xwgn --help  # xw gn --help
xwnj --help  # xw nj --help
```

## Configuration

The installation path is stored in `~/.xwrc`:

```ini
install_path=/absolute/path/to/build-tools
```

Paths containing spaces are supported. The installer manages configuration compatibility automatically and repairs missing runtime dependencies when needed.

## Updates

The checkout retains Git-based self-updates:

```sh
xw auto-update check
xw auto-update enable
xw auto-update disable
```

Update this npm wrapper separately:

```sh
npm update -g @tctony/build-tools --registry=https://registry.npmjs.org/
```

An existing installation is reused without recloning.

## Development

```sh
npm ci
npm test
npm pack --dry-run
```

Tests isolate filesystem changes and mock Git/network installation operations. Actual Windows execution and end-to-end installation from GitHub require separate verification. Publish the build-tools GitHub repository before publishing this installer.
