# Release workflow

## 触发条件

当用户要求“发布一个 release”“发布新版本”或同等含义的操作时，执行本流程。此请求包含递增版本、提交版本变更、创建 tag 和推送的授权，无需逐步重复确认。

## 版本规则

- 默认递增 `patch`。
- 仅当用户明确指定 `minor` 或 `major` 时，使用对应的递增方式。
- 同步更新 `package.json` 和 `package-lock.json`。
- Git tag 格式为 `vX.Y.Z`，必须与 `package.json` 的版本一致。

## 执行步骤

1. 检查 Git 状态，确认在 `main` 分支，且本地与远程状态允许正常推送。不得覆盖或擅自提交无关改动；存在阻碍发布的改动或分歧时，先解决再继续。
2. 运行 `npm ci`、`npm test` 和 `npm pack --dry-run`，检查失败时停止发布。
3. 使用 `npm version patch -m "Release v%s"` 递增版本、创建版本提交和 tag。用户明确指定 `minor` 或 `major` 时，替换命令中的 `patch`。
4. 确认两个版本文件、版本提交和 tag 一致，然后执行 `git push --atomic origin main vX.Y.Z`，将占位版本替换为本次实际版本。
5. 推送 tag 会触发 `.github/workflows/publish.yml`，通过 OIDC 自动发布到 npm。跟踪对应的 CI 和发布任务，确认结果；失败时定位原因并报告，不通过重推或移动已发布 tag 来重试。
6. 向用户报告版本、提交、tag、工作流结果和 npm 包地址。

## 边界

- 仅要求编辑发布流程或准备发布时，不执行版本递增、提交、打 tag 或推送。
- 不使用 force push，不移动已存在的 tag，不覆盖已经发布的 npm 版本。
- 提交中不添加 AI 或 Agent 工具的署名或来源 trailer。
