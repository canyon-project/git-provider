export type GitProvider = 'github' | 'gitlab' | 'gitea'

export interface GitProviderClientOptions {
  provider: GitProvider
  token?: string
  baseUrl?: string
  headers?: Record<string, string>
}

export interface RepositorySummary {
  provider: GitProvider
  id: string
  fullName: string
  name: string
  defaultBranch?: string
  webUrl?: string
  private?: boolean
  description?: string | null
}

export interface CommitSummary {
  provider: GitProvider
  sha: string
  shortSha: string
  title: string
  message: string
  authorName?: string
  authorEmail?: string
  authoredAt?: string
  webUrl?: string
}

export interface CompareSummary {
  provider: GitProvider
  fromSha: string
  toSha: string
  status?: string
  aheadBy?: number
  behindBy?: number
  totalCommits: number
}

export interface FileContentResult {
  provider: GitProvider
  path: string
  ref: string
  sha?: string
  size?: number
  content: string
}

export interface ArchiveResult {
  provider: GitProvider
  ref: string
  contentType?: string | null
  fileName?: string
  size: number
  data: Uint8Array
}

interface OwnerRepo {
  owner: string
  repo: string
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function normalizeProviderBaseUrl(provider: GitProvider, baseUrl?: string): string {
  if (baseUrl) {
    return stripTrailingSlash(baseUrl)
  }

  if (provider === 'github') {
    return 'https://api.github.com'
  }
  if (provider === 'gitlab') {
    return 'https://gitlab.com/api/v4'
  }
  return 'https://gitea.com/api/v1'
}

function shortSha(sha: string): string {
  return sha.slice(0, 8)
}

function decodeBase64ToUtf8(value: string): string {
  return Buffer.from(value.replace(/\n/g, ''), 'base64').toString('utf-8')
}

function isLikelyNumericRepoId(repo: string | number): boolean {
  return typeof repo === 'number' || /^\d+$/.test(repo)
}

export class GitProviderClient {
  private readonly provider: GitProvider

  private readonly token?: string

  private readonly baseUrl: string

  private readonly extraHeaders: Record<string, string>

  constructor(options: GitProviderClientOptions) {
    this.provider = options.provider
    this.token = options.token
    this.baseUrl = normalizeProviderBaseUrl(options.provider, options.baseUrl)
    this.extraHeaders = options.headers ?? {}
  }

  async getRepositorySummary(idOrPath: string | number): Promise<RepositorySummary> {
    if (this.provider === 'github') {
      const url = isLikelyNumericRepoId(idOrPath)
        ? `${this.baseUrl}/repositories/${idOrPath}`
        : `${this.baseUrl}/repos/${encodeURIComponent(String(idOrPath).split('/')[0])}/${encodeURIComponent(String(idOrPath).split('/')[1] ?? '')}`
      const project = await this.requestJson<any>(url)
      return {
        provider: this.provider,
        id: String(project.id),
        fullName: project.full_name,
        name: project.name,
        defaultBranch: project.default_branch,
        webUrl: project.html_url,
        private: project.private,
        description: project.description
      }
    }

    if (this.provider === 'gitlab') {
      const projectId = this.encodeGitLabProjectId(idOrPath)
      const project = await this.requestJson<any>(`${this.baseUrl}/projects/${projectId}`)
      return {
        provider: this.provider,
        id: String(project.id),
        fullName: project.path_with_namespace,
        name: project.name,
        defaultBranch: project.default_branch,
        webUrl: project.web_url,
        private: project.visibility ? project.visibility !== 'public' : undefined,
        description: project.description
      }
    }

    // gitea
    const project = await this.fetchGiteaProject(idOrPath)
    return {
      provider: this.provider,
      id: String(project.id),
      fullName: project.full_name,
      name: project.name,
      defaultBranch: project.default_branch,
      webUrl: project.html_url,
      private: project.private,
      description: project.description
    }
  }

  async getCommitSummary(
    repo: string | number,
    sha: string
  ): Promise<CommitSummary> {
    if (this.provider === 'github') {
      const ownerRepo = await this.resolveOwnerRepo(repo)
      const commit = await this.requestJson<any>(
        `${this.baseUrl}/repos/${encodeURIComponent(ownerRepo.owner)}/${encodeURIComponent(ownerRepo.repo)}/commits/${encodeURIComponent(sha)}`
      )
      return {
        provider: this.provider,
        sha: commit.sha,
        shortSha: shortSha(commit.sha),
        title: commit.commit?.message?.split('\n')[0] ?? '',
        message: commit.commit?.message ?? '',
        authorName: commit.commit?.author?.name,
        authorEmail: commit.commit?.author?.email,
        authoredAt: commit.commit?.author?.date,
        webUrl: commit.html_url
      }
    }

    if (this.provider === 'gitlab') {
      const pid = this.encodeGitLabProjectId(repo)
      const commit = await this.requestJson<any>(
        `${this.baseUrl}/projects/${pid}/repository/commits/${encodeURIComponent(sha)}`
      )
      return {
        provider: this.provider,
        sha: commit.id,
        shortSha: shortSha(commit.short_id ?? commit.id),
        title: commit.title ?? commit.message?.split('\n')[0] ?? '',
        message: commit.message ?? '',
        authorName: commit.author_name,
        authorEmail: commit.author_email,
        authoredAt: commit.authored_date,
        webUrl: commit.web_url
      }
    }

    const ownerRepo = await this.resolveOwnerRepo(repo)
    const commit = await this.requestJson<any>(
      `${this.baseUrl}/repos/${encodeURIComponent(ownerRepo.owner)}/${encodeURIComponent(ownerRepo.repo)}/commits/${encodeURIComponent(sha)}`
    )
    return {
      provider: this.provider,
      sha: commit.sha,
      shortSha: shortSha(commit.sha),
      title: commit.commit?.message?.split('\n')[0] ?? '',
      message: commit.commit?.message ?? '',
      authorName: commit.commit?.author?.name,
      authorEmail: commit.commit?.author?.email,
      authoredAt: commit.commit?.author?.date,
      webUrl: commit.html_url
    }
  }

  async compareCommits(
    repo: string | number,
    fromSha: string,
    toSha: string
  ): Promise<CompareSummary> {
    if (this.provider === 'github') {
      const ownerRepo = await this.resolveOwnerRepo(repo)
      const compare = await this.requestJson<any>(
        `${this.baseUrl}/repos/${encodeURIComponent(ownerRepo.owner)}/${encodeURIComponent(ownerRepo.repo)}/compare/${encodeURIComponent(fromSha)}...${encodeURIComponent(toSha)}`
      )
      return {
        provider: this.provider,
        fromSha,
        toSha,
        status: compare.status,
        aheadBy: compare.ahead_by,
        behindBy: compare.behind_by,
        totalCommits: compare.total_commits ?? compare.commits?.length ?? 0
      }
    }

    if (this.provider === 'gitlab') {
      const pid = this.encodeGitLabProjectId(repo)
      const compare = await this.requestJson<any>(
        `${this.baseUrl}/projects/${pid}/repository/compare?from=${encodeURIComponent(fromSha)}&to=${encodeURIComponent(toSha)}`
      )
      return {
        provider: this.provider,
        fromSha,
        toSha,
        status: compare.compare_same_ref ? 'identical' : 'different',
        totalCommits: compare.commits?.length ?? 0
      }
    }

    const ownerRepo = await this.resolveOwnerRepo(repo)
    const compare = await this.requestJson<any>(
      `${this.baseUrl}/repos/${encodeURIComponent(ownerRepo.owner)}/${encodeURIComponent(ownerRepo.repo)}/compare/${encodeURIComponent(fromSha)}...${encodeURIComponent(toSha)}`
    )
    return {
      provider: this.provider,
      fromSha,
      toSha,
      status: compare.status,
      aheadBy: compare.ahead_by,
      behindBy: compare.behind_by,
      totalCommits: compare.total_commits ?? compare.commits?.length ?? 0
    }
  }

  async getFileContent(
    repo: string | number,
    filePath: string,
    ref: string
  ): Promise<FileContentResult> {
    if (this.provider === 'github') {
      const ownerRepo = await this.resolveOwnerRepo(repo)
      const payload = await this.requestJson<any>(
        `${this.baseUrl}/repos/${encodeURIComponent(ownerRepo.owner)}/${encodeURIComponent(ownerRepo.repo)}/contents/${this.encodePath(filePath)}?ref=${encodeURIComponent(ref)}`
      )
      return {
        provider: this.provider,
        path: payload.path ?? filePath,
        ref,
        sha: payload.sha,
        size: payload.size,
        content: decodeBase64ToUtf8(payload.content ?? '')
      }
    }

    if (this.provider === 'gitlab') {
      const pid = this.encodeGitLabProjectId(repo)
      const payload = await this.requestJson<any>(
        `${this.baseUrl}/projects/${pid}/repository/files/${this.encodePath(filePath)}?ref=${encodeURIComponent(ref)}`
      )
      return {
        provider: this.provider,
        path: payload.file_path ?? filePath,
        ref,
        sha: payload.blob_id,
        size: payload.size,
        content: decodeBase64ToUtf8(payload.content ?? '')
      }
    }

    const ownerRepo = await this.resolveOwnerRepo(repo)
    const payload = await this.requestJson<any>(
      `${this.baseUrl}/repos/${encodeURIComponent(ownerRepo.owner)}/${encodeURIComponent(ownerRepo.repo)}/contents/${this.encodePath(filePath)}?ref=${encodeURIComponent(ref)}`
    )
    return {
      provider: this.provider,
      path: payload.path ?? filePath,
      ref,
      sha: payload.sha,
      size: payload.size,
      content: decodeBase64ToUtf8(payload.content ?? '')
    }
  }

  async downloadArchive(repo: string | number, ref: string): Promise<ArchiveResult> {
    let url: string

    if (this.provider === 'gitlab') {
      const pid = this.encodeGitLabProjectId(repo)
      url = `${this.baseUrl}/projects/${pid}/repository/archive.zip?sha=${encodeURIComponent(ref)}`
    } else {
      const ownerRepo = await this.resolveOwnerRepo(repo)
      if (this.provider === 'github') {
        url = `${this.baseUrl}/repos/${encodeURIComponent(ownerRepo.owner)}/${encodeURIComponent(ownerRepo.repo)}/zipball/${encodeURIComponent(ref)}`
      } else {
        url = `${this.baseUrl}/repos/${encodeURIComponent(ownerRepo.owner)}/${encodeURIComponent(ownerRepo.repo)}/archive/${encodeURIComponent(ref)}.zip`
      }
    }

    const response = await this.fetchWithAuth(url, {
      headers: {
        Accept: 'application/zip'
      }
    })
    if (!response.ok) {
      const body = await response.text()
      throw new Error(
        `[${this.provider}] request failed (${response.status}): ${body}`
      )
    }

    const data = new Uint8Array(await response.arrayBuffer())
    return {
      provider: this.provider,
      ref,
      contentType: response.headers.get('content-type'),
      fileName: this.parseFileNameFromHeaders(response.headers),
      size: data.byteLength,
      data
    }
  }

  private async fetchGiteaProject(idOrPath: string | number): Promise<any> {
    if (!isLikelyNumericRepoId(idOrPath)) {
      const ownerRepo = this.parseOwnerRepo(String(idOrPath))
      return this.requestJson<any>(
        `${this.baseUrl}/repos/${encodeURIComponent(ownerRepo.owner)}/${encodeURIComponent(ownerRepo.repo)}`
      )
    }

    try {
      return await this.requestJson<any>(`${this.baseUrl}/repositories/${idOrPath}`)
    } catch {
      throw new Error(
        '[gitea] numeric repository id not found; try owner/repo form'
      )
    }
  }

  private async resolveOwnerRepo(repo: string | number): Promise<OwnerRepo> {
    if (!isLikelyNumericRepoId(repo)) {
      return this.parseOwnerRepo(String(repo))
    }

    if (this.provider === 'gitlab') {
      const project = await this.getRepositorySummary(repo)
      return this.parseOwnerRepo(project.fullName)
    }

    const project = await this.getRepositorySummary(repo)
    return this.parseOwnerRepo(project.fullName)
  }

  private parseOwnerRepo(raw: string): OwnerRepo {
    const parts = raw.split('/')
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      throw new Error(
        `invalid repository identifier "${raw}", expected "owner/repo" or numeric id`
      )
    }
    return {
      owner: parts[0],
      repo: parts.slice(1).join('/')
    }
  }

  private encodeGitLabProjectId(idOrPath: string | number): string {
    if (isLikelyNumericRepoId(idOrPath)) {
      return String(idOrPath)
    }
    return this.encodePath(String(idOrPath))
  }

  private encodePath(path: string): string {
    return path
      .split('/')
      .filter(Boolean)
      .map((piece) => encodeURIComponent(piece))
      .join('%2F')
  }

  private parseFileNameFromHeaders(headers: Headers): string | undefined {
    const disposition = headers.get('content-disposition')
    if (!disposition) {
      return undefined
    }
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1])
    }
    const fallbackMatch = disposition.match(/filename="([^"]+)"/i)
    return fallbackMatch?.[1]
  }

  private async requestJson<T>(url: string): Promise<T> {
    const response = await this.fetchWithAuth(url)
    if (!response.ok) {
      const body = await response.text()
      throw new Error(
        `[${this.provider}] request failed (${response.status}): ${body}`
      )
    }
    return response.json() as Promise<T>
  }

  private async fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers)
    for (const [key, value] of Object.entries(this.getAuthHeaders())) {
      headers.set(key, value)
    }
    for (const [key, value] of Object.entries(this.extraHeaders)) {
      headers.set(key, value)
    }
    return fetch(url, {
      ...init,
      headers
    })
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}

    if (this.provider === 'github') {
      headers.Accept = 'application/vnd.github+json'
    } else {
      headers.Accept = 'application/json'
    }

    if (!this.token) {
      return headers
    }

    if (this.provider === 'gitlab') {
      headers['PRIVATE-TOKEN'] = this.token
    } else if (this.provider === 'gitea') {
      headers.Authorization = `token ${this.token}`
    } else {
      headers.Authorization = `Bearer ${this.token}`
    }

    return headers
  }
}

export function createGitProviderClient(
  options: GitProviderClientOptions
): GitProviderClient {
  return new GitProviderClient(options)
}
