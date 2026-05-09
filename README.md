# @canyonjs/git-provider

面向 **Git 托管平台（GitLab / GitHub）** 的轻量 TypeScript 客户端库。通过对外的 **`ScmAdapter`** 接口屏蔽平台差异：业务代码只依赖「仓库信息与两个引用之间的 Compare 结果」，由工厂方法按配置选择具体适配器。

## 能力与现状

| 能力          | GitLab                                           | GitHub                             |
| ------------- | ------------------------------------------------ | ---------------------------------- |
| `getRepoInfo` | 支持（Project API）                              | 支持（`owner/repo` 或数字仓库 id） |
| `getCompare`  | **已实现**：比较 API + 逐文件 Raw 内容与行级差异 | **未实现**（调用会抛错）           |

`getCompare` 返回结构化结果 **`Compare`**：

- **`commitList`**：`base` … `head` 范围内涉及的提交 id（来源 GitLab `repository/compare`）。
- **`changedFiles`**：**仅保留扩展名为 `tsx` / `ts` / `jsx` / `js` 的文件**；每项含 **`path`** 以及 **`additions` / `deletions` 行号列表**（由 `diff` 对两侧全文做逐行比对得到）。不支持 Windows 路径风格，假定仓库路径均为 POSIX `/`。

GitLab 侧会处理 **重命名**：在 `base` 与 `head` 上分别按 **旧路径 / 新路径** 拉取 Raw，再在统一展示路径上与行号结果对齐。

## 依赖与请求

- 运行时依赖：**[`diff`](https://www.npmjs.com/package/diff)**（行级比对）。
- HTTP 使用全局 **`fetch`**（见 `src/request.ts`），按需配置超时等。

## 安装

```bash
pnpm add @canyonjs/git-provider
```

若从源码开发与联调：

```bash
pnpm install
pnpm run build
```

## 用法示例

```ts
import { createScmAdapter, type Compare, type ScmConfig } from "@canyonjs/git-provider";

const config: ScmConfig = {
  type: "gitlab",
  base: "https://gitlab.example.com",
  token: process.env.GITLAB_TOKEN!,
};

const adapter = createScmAdapter(config);

const repo = await adapter.getRepoInfo("group/project"); // GitLab numeric id / path_with_namespace 等由平台解释

const result: Compare = await adapter.getCompare(
  repo.id,
  "main~10", // base ref
  "main", // head ref
);

console.log(result.commitList.length, result.changedFiles.length);
```

GitHub 仅 token、`base` 固定为 `https://api.github.com`。

## 开发与脚本

| 脚本                 | 说明                                                      |
| -------------------- | --------------------------------------------------------- |
| `pnpm run build`     | 使用 tsdown 产出 `dist`                                   |
| `pnpm run dev`       | 监听构建                                                  |
| `pnpm run typecheck` | TypeScript 检查                                           |
| `pnpm run test`      | Vitest                                                    |
| `pnpm run debug`     | 本地脚本 `scripts/debug/`（`.env` 配置 token、仓库与 ref） |

目录概览：**`src/adapter.ts`** 定义 **`ScmAdapter`**；**`src/gitlab.ts`** / **`src/github.ts`** 为实现；**`src/diff-line.ts`** 为行号计算与扩展名判定；**`src/types.ts`** 为配置与各数据结构类型。**`tests/`** 为 Vitest 测试；**`tests/test-utils/`** 为本机 HTTP mock、fixture JSON 等（不进入 `dist`）。

## 许可证

MIT
