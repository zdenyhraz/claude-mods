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

export type ContextSlice = { name: string; tokens: number; color: string }

export type UsageView = {
  tokens: number
  window: number
  percent: number
  slices: ContextSlice[]
  limits: { kind: string; percent: number; resetsAt?: string }[]
}

export type AgentView = {
  id: string
  name: string
  type: string
  status: string
  startedAt: number
  endedAt?: number
  tools: number
}

declare module 'claude-code' {
  interface PluginState {
    'git-band': { status: GitStatus | null; usage: UsageView | null; agents: AgentView[] }
  }
}
