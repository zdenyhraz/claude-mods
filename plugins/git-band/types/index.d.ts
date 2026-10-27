export type GitStatus = {
  repo: string
  branch: string
  isDetached: boolean
  worktree: string | null
  upstream: string | null
  ahead: number
  behind: number
  staged: number
  added: number
  modified: number
  deleted: number
  renamed: number
  untracked: number
  conflicted: number
  insertions: number
  deletions: number
}

declare module 'claude-code' {
  interface PluginState {
    'git-band': { status: GitStatus | null }
  }
}
