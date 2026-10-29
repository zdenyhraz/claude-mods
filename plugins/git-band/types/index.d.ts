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

export type TurnPhase = 'idle' | 'working' | 'waiting' | 'done' | 'stopped' | 'failed'

// `detail` is what the session is doing while working, or what it waits on.
export type TurnView = { phase: TurnPhase; detail: string; at: number }

export type PlanStep = { content: string; status: 'pending' | 'in_progress' | 'completed' }

export type CommandRun = { text: string; isOk: boolean; ms: number }

// What happened since the person's last prompt, subagents' work included.
export type ActivityView = {
  since: number | null
  files: { path: string; edits: number }[]
  commands: CommandRun[]
  tests: { isOk: boolean; at: number } | null
  commits: number
}

declare module 'claude-code' {
  interface PluginState {
    'git-band': {
      status: GitStatus | null
      usage: UsageView | null
      agents: AgentView[]
      latestPrompt: string | null
      turn: TurnView
      plan: PlanStep[]
      activity: ActivityView
      hue: string | null
    }
  }
}
