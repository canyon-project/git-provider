import { expect, test } from 'vitest'
import { createGitProviderClient } from '../src'

const giteaToken = process.env.GITEA_TOKEN
const giteaRepo = 'canyon-project/canyon'
const giteaBaseUrl = process.env.GITEA_BASE_URL ?? 'https://gitea.com/api/v1'
const githubToken = process.env.GITHUB_TOKEN
const githubRepo = 'canyon-project/canyon'
const githubBaseUrl = process.env.GITHUB_BASE_URL ?? 'https://api.github.com'


test('测试 Gitea 集成', async () => {
  const client = createGitProviderClient({
    provider: 'gitea',
    token: giteaToken,
    baseUrl: giteaBaseUrl
  })

  const summary = await client.getRepositorySummary(giteaRepo!)
  console.log(summary)
  expect(summary.id).toBe('128917')
})

test('测试 GitHub 集成', async () => {
  const client = createGitProviderClient({
    provider: 'github',
    token: githubToken,
    baseUrl: githubBaseUrl
  })

  const summary = await client.getRepositorySummary(githubRepo)
  console.log(summary)
  expect(summary.fullName).toBe(githubRepo)
  expect(summary.id).toBe('490316875')
})
