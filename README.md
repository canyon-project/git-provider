# git-provider

统一封装 GitHub / GitLab / Gitea 的常见仓库 API。

## Development

- Install dependencies:

```bash
npm install
```

- Run the unit tests:

```bash
npm run test
```

- Build the library:

```bash
npm run build
```

## Usage

```ts
import { createGitProviderClient } from 'git-provider'

const client = createGitProviderClient({
  provider: 'gitlab', // 'github' | 'gitlab' | 'gitea'
  token: process.env.GIT_TOKEN
})

// 1) 根据 id 或 owner/repo 获取仓库摘要
const repo = await client.getRepositorySummary('canyon-project/canyon')

// 2) 获取 commit 摘要
const commit = await client.getCommitSummary('canyon-project/canyon', 'abc123')

// 3) 获取单个文件内容
const file = await client.getFileContent('canyon-project/canyon', 'README.md', 'main')

// 4) 获取指定 commit 的 zip 产物
const archive = await client.downloadArchive('canyon-project/canyon', 'abc123')

// 5) 比较两个 commit
const compare = await client.compareCommits('canyon-project/canyon', 'fromSha', 'toSha')
```
