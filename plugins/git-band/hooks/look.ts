import type { ActivityView, AgentView, ContextSlice, GitStatus, PlanStep, TurnPhase, TurnView, UsageView } from '../types'

export type Tone =
  | 'text'
  | 'subtle'
  | 'inactive'
  | 'claude'
  | 'success'
  | 'error'
  | 'warning'
  | 'blue'
  | 'violet'
  | 'teal'
  | 'sky'
  | 'pink'
  | 'tan'
  | 'coral'
  | 'lime'
  | 'gray'
  | 'free'
  | 'line'
  | 'ink'
export type Icon =
  | 'repo'
  | 'worktree'
  | 'branch'
  | 'context'
  | 'running'
  | 'waiting'
  | 'done'
  | 'failed'
  | 'queued'
  | 'prompt'
  | 'history'
  | 'file'
  | 'flask'
  | 'commit'
  | 'bot'
  | 'base'
export type Token = { text: string; tone: Tone }
export type Group = { key: string; border: Tone; icon?: { name: Icon; tone: Tone }; tokens: Token[] }

// Claude Code's dark and light theme colours. An Svg is drawn as an image that cannot read the theme, so the
// band picks between these with the prefers-color-scheme media query, which follows the app's theme.
const DARK: Record<Tone, string> = {
  text: '#ecebe4',
  subtle: '#6b6a65',
  inactive: '#9a9893',
  claude: '#d97757',
  success: '#4eba65',
  error: '#ff6b80',
  warning: '#ffc107',
  blue: '#b1b9f9',
  violet: '#af87ff',
  teal: '#4fb3a9',
  sky: '#6cb4ee',
  pink: '#f472b6',
  tan: '#c9a27a',
  coral: '#f2916b',
  lime: '#a8d65c',
  gray: '#8a8882',
  free: '#3d3c38',
  line: '#4a4945',
  ink: '#1f1e1d',
}

const LIGHT: Record<Tone, string> = {
  text: '#2b2a27',
  subtle: '#b4b2a9',
  inactive: '#6b6a65',
  claude: '#c2552f',
  success: '#2c7a39',
  error: '#ab2b3f',
  warning: '#966c1e',
  blue: '#4b5fe0',
  violet: '#7a2bd9',
  teal: '#00706a',
  sky: '#1a66c9',
  pink: '#be185d',
  tan: '#8a6338',
  coral: '#b4502a',
  lime: '#4d7c0f',
  gray: '#8a8882',
  free: '#e8e6de',
  line: '#d9d7cf',
  ink: '#ffffff',
}

const ICON_PATHS: Record<Icon, string> = {
  repo: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  worktree: '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9"/><path d="M12 12v3"/>',
  branch: '<path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  context: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  running:
    '<path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/>',
  waiting: '<circle cx="12" cy="12" r="10"/><path d="M10 15V9"/><path d="M14 15V9"/>',
  done: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  failed: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  queued: '<circle cx="12" cy="12" r="10" stroke-dasharray="3.5 3"/>',
  prompt: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  flask: '<path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><path d="M5.52 16h12.96"/>',
  commit: '<circle cx="12" cy="12" r="3"/><path d="M3 12h6"/><path d="M15 12h6"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  base: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
}

const CHANGES: { key: keyof GitStatus; symbol: string; word: string; tone: Tone }[] = [
  { key: 'conflicted', symbol: '!', word: 'conflicted', tone: 'error' },
  { key: 'added', symbol: '+', word: 'added', tone: 'success' },
  { key: 'modified', symbol: '~', word: 'modified', tone: 'warning' },
  { key: 'deleted', symbol: '−', word: 'deleted', tone: 'error' },
  { key: 'renamed', symbol: '→', word: 'renamed', tone: 'blue' },
  { key: 'untracked', symbol: '?', word: 'untracked', tone: 'teal' },
  { key: 'staged', symbol: '●', word: 'staged', tone: 'blue' },
]

const MAX_NAME = 40

// Cut in the middle, so a branch keeps both its prefix and the end that tells it apart.
export function shorten(name: string, max = MAX_NAME): string {
  const chars = [...name]

  if (chars.length <= max) {
    return name
  }

  const head = Math.ceil((max - 1) / 2)
  const tail = max - 1 - head

  return `${chars.slice(0, head).join('')}…${tail > 0 ? chars.slice(-tail).join('') : ''}`
}

// How much of the git row to show: names cut to a number of characters, the line counts, the change counts
// folded into one total, and whether the worktree's name shows.
export type GitFit = { repo: number; worktree: number; branch: number; hasLines: boolean; isSummary: boolean; hasWorktreeName: boolean }

const FULL: GitFit = { repo: MAX_NAME, worktree: MAX_NAME, branch: MAX_NAME, hasLines: true, isSummary: false, hasWorktreeName: true }

const NARROWEST: GitFit = { ...FULL, branch: 8, repo: 8, hasLines: false, isSummary: true, hasWorktreeName: false }

// Tried in order until the row fits: what goes first is what a glance needs least.
export const GIT_FITS: GitFit[] = [
  FULL,
  { ...FULL, branch: 24 },
  { ...FULL, branch: 24, worktree: 18 },
  { ...FULL, branch: 16, worktree: 12 },
  { ...FULL, branch: 16, worktree: 12, hasLines: false },
  { ...FULL, branch: 16, worktree: 12, hasLines: false, isSummary: true },
  { ...FULL, branch: 12, worktree: 8, repo: 12, hasLines: false, isSummary: true },
  { ...FULL, branch: 12, repo: 12, hasLines: false, isSummary: true, hasWorktreeName: false },
  NARROWEST,
]

// None of them is the repo name's blue or a colour a state's chip uses.
export const WORKTREE_HUES: Tone[] = ['violet', 'teal', 'pink', 'lime', 'tan', 'coral']

// The worktree the colour belongs to; the main checkout goes by its branch.
export const hueKey = (git: GitStatus): string => `${git.repo}/${git.worktree ?? git.branch}`

// A colour from the worktree's name, for when the colours handed out across sessions can't be read.
export function sessionHue(git: GitStatus): Tone {
  let hash = 0

  for (const char of git.worktree ?? git.branch) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  }

  return WORKTREE_HUES[hash % WORKTREE_HUES.length] ?? 'violet'
}

const baseName = (ref: string): string => ref.replace(/^origin\//, '')

export function groupsOf(git: GitStatus, fit: GitFit = FULL, hue: Tone = sessionHue(git)): Group[] {
  const groups: Group[] = [
    { key: 'repo', border: 'sky', icon: { name: 'repo', tone: 'sky' }, tokens: [{ text: shorten(git.repo, fit.repo), tone: 'sky' }] },
  ]

  if (git.worktree !== null) {
    const tokens = fit.hasWorktreeName ? [{ text: shorten(git.worktree, fit.worktree), tone: hue }] : []
    groups.push({ key: 'worktree', border: hue, icon: { name: 'worktree', tone: hue }, tokens })
  }

  const branch: Token[] = [{ text: shorten(git.branch, fit.branch), tone: 'claude' }]

  if (git.ahead > 0) {
    branch.push({ text: `↑${git.ahead}`, tone: 'success' })
  }

  if (git.behind > 0) {
    branch.push({ text: `↓${git.behind}`, tone: 'warning' })
  }

  if (git.isDetached) {
    branch.push({ text: 'detached', tone: 'warning' })
  } else if (git.upstream === null) {
    branch.push({ text: 'no upstream', tone: 'inactive' })
  }

  groups.push({ key: 'branch', border: 'claude', icon: { name: 'branch', tone: 'claude' }, tokens: branch })

  const base = git.base

  if (base && (base.ahead > 0 || base.behind > 0)) {
    // Where room is short the base keeps its icon and counts and drops its name.
    const tokens: Token[] = fit.hasLines ? [{ text: baseName(base.name), tone: 'gray' }] : []

    if (base.ahead > 0) {
      tokens.push({ text: `↑${base.ahead}`, tone: 'success' })
    }

    if (base.behind > 0) {
      tokens.push({ text: `↓${base.behind}`, tone: 'warning' })
    }

    groups.push({ key: 'base', border: 'gray', icon: { name: 'base', tone: 'gray' }, tokens })
  }

  const present = CHANGES.filter(change => Number(git[change.key]) > 0)
  let counts: Token[] = present.map(change => ({ text: `${change.symbol}${String(git[change.key])}`, tone: change.tone }))

  if (counts.length === 0) {
    groups.push({ key: 'changes', border: 'success', tokens: [{ text: '✓ clean', tone: 'success' }] })
    return groups
  }

  if (fit.isSummary) {
    const total = present.filter(change => change.key !== 'staged').reduce((sum, change) => sum + Number(git[change.key]), 0)
    counts = [{ text: `~${total}`, tone: git.conflicted > 0 ? 'error' : 'warning' }]
  }

  if (fit.hasLines && (git.insertions > 0 || git.deletions > 0)) {
    counts.push({ text: `+${git.insertions}`, tone: 'success' }, { text: `−${git.deletions}`, tone: 'error' })
  }

  groups.push({ key: 'changes', border: git.conflicted > 0 ? 'error' : 'warning', tokens: counts })

  return groups
}

// The hover card's lines: the names whole, the upstream, and each kind of change in words.
export function detailsOf(git: GitStatus): Token[][] {
  const names: Token[] = [{ text: git.repo, tone: 'sky' }]

  if (git.worktree !== null) {
    names.push({ text: `worktree ${git.worktree}`, tone: 'violet' })
  }

  names.push({ text: git.isDetached ? `detached at ${git.branch}` : git.branch, tone: 'claude' })

  const tracking: Token[] =
    git.upstream === null
      ? [{ text: 'no upstream', tone: 'inactive' }]
      : [
          { text: git.upstream, tone: 'text' },
          ...(git.ahead > 0 ? [{ text: `${git.ahead} ahead`, tone: 'success' as const }] : []),
          ...(git.behind > 0 ? [{ text: `${git.behind} behind`, tone: 'warning' as const }] : []),
          ...(git.ahead === 0 && git.behind === 0 ? [{ text: 'up to date', tone: 'inactive' as const }] : []),
        ]

  const base = git.base
  const divergence: Token[][] = base
    ? [
        [
          { text: `against ${base.name}`, tone: 'text' },
          ...(base.ahead > 0 ? [{ text: `${base.ahead} ahead`, tone: 'success' as const }] : []),
          ...(base.behind > 0 ? [{ text: `${base.behind} behind`, tone: 'warning' as const }] : []),
          ...(base.ahead === 0 && base.behind === 0 ? [{ text: 'even', tone: 'inactive' as const }] : []),
        ],
      ]
    : []

  const changes: Token[] = CHANGES.filter(change => Number(git[change.key]) > 0).map(change => ({
    text: `${String(git[change.key])} ${change.word}`,
    tone: change.tone,
  }))

  if (git.insertions > 0 || git.deletions > 0) {
    changes.push({ text: `+${git.insertions} −${git.deletions} lines`, tone: 'gray' })
  }

  return [names, tracking, ...divergence, changes.length > 0 ? changes : [{ text: '✓ clean', tone: 'success' }]]
}

// The theme key /context names each category's colour by, mapped to the band's own tones.
const SLICE_TONES: Record<string, Tone> = {
  permission: 'blue',
  suggestion: 'blue',
  remember: 'blue',
  ide: 'sky',
  autoAccept: 'violet',
  merged: 'violet',
  planMode: 'teal',
  warning: 'warning',
  claude: 'claude',
  success: 'success',
  diffAdded: 'success',
  error: 'error',
  diffRemoved: 'error',
  bashBorder: 'pink',
  text: 'text',
}

const SLICE_PALETTE: Tone[] = ['violet', 'blue', 'teal', 'warning', 'pink', 'claude', 'success', 'sky']

// Many /context colours are greys or keys the band has no tone for; each slice still gets a hue of its own,
// the theme's where it has one and is not taken, else the next free one from the palette.
export function sliceTones(slices: readonly ContextSlice[]): Tone[] {
  const taken = new Set<Tone>()

  return slices.map(slice => {
    const preferred = SLICE_TONES[slice.color]
    const tone = preferred !== undefined && !taken.has(preferred) ? preferred : (SLICE_PALETTE.find(hue => !taken.has(hue)) ?? 'gray')
    taken.add(tone)

    return tone
  })
}

type State = { word: string; tone: Tone; icon: Icon; glyph: string }

const QUEUED: State = { word: 'queued', tone: 'gray', icon: 'queued', glyph: '○' }

const STATES: Record<string, State> = {
  running: { word: 'running', tone: 'sky', icon: 'running', glyph: '●' },
  waiting: { word: 'waiting', tone: 'warning', icon: 'waiting', glyph: '◐' },
  pending: QUEUED,
  idle: { word: 'idle', tone: 'gray', icon: 'queued', glyph: '○' },
  completed: { word: 'done', tone: 'success', icon: 'done', glyph: '✓' },
  failed: { word: 'failed', tone: 'error', icon: 'failed', glyph: '✕' },
  killed: { word: 'stopped', tone: 'error', icon: 'failed', glyph: '✕' },
}

export const stateOf = (status: string): State => STATES[status] ?? QUEUED

export const isActive = (agent: AgentView): boolean => ['pending', 'running', 'waiting', 'idle'].includes(agent.status)

const LIMIT_NAMES: Record<string, string> = { five_hour: '5h', seven_day: 'week', spend_limit: 'spend' }

export const limitName = (kind: string): string => LIMIT_NAMES[kind] ?? kind

export const limitTone = (percent: number): Tone => (percent >= 80 ? 'error' : percent >= 50 ? 'warning' : 'success')

export const kilo = (tokens: number): string => (tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens))

export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))

  if (seconds < 60) {
    return `${seconds}s`
  }

  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
  }

  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export function orderAgents(agents: AgentView[]): AgentView[] {
  return [...agents].sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || a.startedAt - b.startedAt)
}

export type Dashboard = { git: GitStatus; usage: UsageView | null; agents: AgentView[]; now: number; hue?: Tone; activity?: Item[] }

export const agentTime = (agent: AgentView, now: number): string => elapsed((agent.endedAt ?? now) - agent.startedAt)

export function ago(ms: number): string {
  const minutes = Math.floor(ms / 60_000)

  if (minutes < 1) {
    return 'just now'
  }

  if (minutes < 60) {
    return `${minutes} m ago`
  }

  const hours = Math.floor(minutes / 60)

  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`
}

// How long until what ago() says for this age next changes.
export function agoChangesIn(ms: number): number {
  const age = Math.max(0, ms)

  if (age < 3_600_000) {
    return 60_000 - (age % 60_000)
  }

  return age < 86_400_000 ? 3_600_000 - (age % 3_600_000) : 86_400_000 - (age % 86_400_000)
}

// One thing a row says: an optional icon, then words. A chip item sets its icon and first word on a solid pill of
// the chip's tone.
// `brief` is what an activity item says where room is short, beside its icon.
export type Item = { icon?: { name: Icon; tone: Tone }; tokens: Token[]; chip?: Tone; topic?: SinceTopic; brief?: string }

// What an activity item stands for, which picks the list its hover card shows.
export type SinceTopic = 'files' | 'tests' | 'commits' | 'agents' | 'commands'

export type Step = { position: number; total: number; text: string; states: PlanStep['status'][]; isComplete: boolean }

export type StatusRow = { items: Item[]; tone: Tone }

const PHASES: Record<TurnPhase, { icon: Icon; tone: Tone; word: string }> = {
  idle: { icon: 'queued', tone: 'gray', word: 'Ready' },
  working: { icon: 'running', tone: 'sky', word: 'Working' },
  waiting: { icon: 'waiting', tone: 'warning', word: 'Waiting for you' },
  done: { icon: 'done', tone: 'success', word: 'Done' },
  stopped: { icon: 'failed', tone: 'inactive', word: 'Stopped' },
  failed: { icon: 'failed', tone: 'error', word: 'Failed' },
}

// The step in progress, else the next one, else the last; numbered by its place, or by how many are done when none runs.
// A plan of one step has no progress worth a bar.
export function stepOf(plan: readonly PlanStep[]): Step | null {
  const current = plan.findIndex(step => step.status === 'in_progress')
  const next = plan.findIndex(step => step.status === 'pending')
  const index = current >= 0 ? current : next >= 0 ? next : plan.length - 1
  const shown = plan[index]

  if (shown === undefined || plan.length < 2) {
    return null
  }

  return {
    position: current >= 0 ? current + 1 : plan.filter(step => step.status === 'completed').length,
    total: plan.length,
    text: shown.content,
    states: plan.map(step => step.status),
    isComplete: plan.every(step => step.status === 'completed'),
  }
}

const IN_FLIGHT = { icon: 'running' as Icon, tone: 'sky' as Tone, word: 'Running in background' }

// A turn that ended with work still in flight is not done: it shows what still runs, in the working colour.
export function statusOf(turn: TurnView, prompt: string | null, now: number, inFlight: readonly string[] = [], promptAt: number | null = null): StatusRow {
  const isInFlight = turn.phase === 'done' && inFlight.length > 0
  const phase = isInFlight ? IN_FLIGHT : PHASES[turn.phase]
  const state: Token[] = [{ text: turn.phase === 'working' ? turn.detail || phase.word : phase.word, tone: 'ink' }]

  if (isInFlight) {
    state.push({ text: inFlight.length > 1 ? `${inFlight[0]} +${inFlight.length - 1}` : (inFlight[0] ?? ''), tone: 'sky' })
  }

  if (turn.phase === 'waiting' && turn.detail !== '') {
    state.push({ text: turn.detail, tone: phase.tone })
  }

  if (turn.phase !== 'working' && turn.phase !== 'idle') {
    state.push({ text: ago(now - turn.at), tone: 'gray' })
  }

  const items: Item[] = [{ icon: { name: phase.icon, tone: 'ink' }, tokens: state, chip: phase.tone }]

  if (prompt !== null) {
    const when: Token[] = promptAt === null ? [] : [{ text: ago(now - promptAt), tone: 'gray' }]
    items.push({ icon: { name: 'prompt', tone: 'gray' }, tokens: [{ text: prompt, tone: 'text' }, ...when] })
  }

  return { items, tone: phase.tone }
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

// What happened since your prompt, for the git row: the files edited, the last test run, the commits and the subagents
// that finished; with none of those, how many commands ran.
export function activityOf(activity: ActivityView, agents: readonly AgentView[]): Item[] {
  const items: Item[] = []
  const finished = agents.filter(agent => !isActive(agent)).length

  if (activity.files.length > 0) {
    items.push({ icon: { name: 'file', tone: 'warning' }, tokens: [{ text: plural(activity.files.length, 'file'), tone: 'warning' }], topic: 'files', brief: String(activity.files.length) })
  }

  if (activity.tests !== null) {
    const tone = activity.tests.isOk ? 'success' : 'error'
    items.push({ icon: { name: 'flask', tone }, tokens: [{ text: activity.tests.isOk ? 'tests ✓' : 'tests ✗', tone }], topic: 'tests', brief: activity.tests.isOk ? '✓' : '✗' })
  }

  if (activity.commits > 0) {
    items.push({ icon: { name: 'commit', tone: 'sky' }, tokens: [{ text: plural(activity.commits, 'commit'), tone: 'sky' }], topic: 'commits', brief: String(activity.commits) })
  }

  if (finished > 0) {
    items.push({ icon: { name: 'bot', tone: 'violet' }, tokens: [{ text: `${plural(finished, 'subagent')} done`, tone: 'violet' }], topic: 'agents', brief: String(finished) })
  }

  if (items.length === 0 && activity.commands.length > 0) {
    items.push({ tokens: [{ text: plural(activity.commands.length, 'command'), tone: 'inactive' }], topic: 'commands' })
  }

  return items
}

export function describe(groups: Group[]): string {
  return groups.map(group => `${group.key} ${group.tokens.map(token => token.text).join(' ')}`).join(' · ')
}

export function describeTop(board: Dashboard): string {
  const limits = board.usage?.limits ?? []

  const activity = board.activity && board.activity.length > 0 ? [describeItems(board.activity)] : []

  return [describe(groupsOf(board.git)), ...activity, ...limits.map(limit => `${limitName(limit.kind)} ${Math.round(limit.percent)}%`)].join(' · ')
}

export const describeContext = (usage: UsageView): string => `context ${usage.percent}%`

export function describeAgents(agents: AgentView[], now: number): string {
  return orderAgents(agents)
    .map(agent => `agent ${stateOf(agent.status).word} ${agent.name} ${agentTime(agent, now)} ${agent.tools} tools`)
    .join(' · ')
}

export const describeItems = (items: Item[]): string => items.map(item => item.tokens.map(token => token.text).join(' ')).join(' · ')

export const describeStatus = (row: StatusRow): string => describeItems(row.items)

export const describePlan = (step: Step): string =>
  step.isComplete ? `plan ${step.total}/${step.total} done` : `plan step ${step.position} of ${step.total} ${step.text}`

export function describeDashboard(board: Dashboard): string {
  return [describeTop(board), board.usage ? describeContext(board.usage) : '', describeAgents(board.agents, board.now)].filter(Boolean).join(' · ')
}

const ROW = 22
const GAP = 6
const CARD = 56
const MIN_CARD = 150
const MIN_COLUMNS = 3
const MAX_COLUMNS = 5
const MAX_CARD_ROWS = 2
const RINGS_ONLY_BELOW = 420
const NO_LIMITS_BELOW = 360
const LIMITS_SPACE = 8

// Widths of Segoe UI Semibold at 14px, scaled to the size drawn, close enough that textLength's small stretch to
// them is invisible.
function charWidth(char: string): number {
  if ('il.,:;|!\'`'.includes(char)) {
    return 3.6
  }

  if ('fjrt()[]/\\-'.includes(char)) {
    return 4.9
  }

  if ('mwMW%'.includes(char)) {
    return 11.6
  }

  if ('↑↓→●✓…│'.includes(char)) {
    return 10
  }

  if (char === ' ') {
    return 3.9
  }

  return /[A-Z]/.test(char) ? 9 : 7.6
}

const textWidth = (content: string, size: number): number =>
  Math.ceil(([...content].reduce((sum, char) => sum + charWidth(char), 0) * size) / 14)

function fit(content: string, size: number, room: number): string {
  if (textWidth(content, size) <= room) {
    return content
  }

  let cut = content

  while (cut.length > 1 && textWidth(`${cut}…`, size) > room) {
    cut = cut.slice(0, -1)
  }

  return `${cut}…`
}

const escape = (content: string): string => content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function palette(colors: Record<Tone, string>): string {
  return (Object.keys(colors) as Tone[]).map(tone => `.f-${tone}{fill:${colors[tone]}}.s-${tone}{stroke:${colors[tone]}}`).join('')
}

type Style = 'strong' | 'name' | 'small' | 'meta'

const SIZES: Record<Style, number> = { strong: 13, name: 13, small: 11.5, meta: 11 }

function text(content: string, x: number, y: number, tone: Tone, style: Style, anchor: 'start' | 'end' = 'start'): string {
  const placing = anchor === 'start' ? ` textLength="${textWidth(content, SIZES[style])}" lengthAdjust="spacingAndGlyphs"` : ' text-anchor="end"'

  return `<text class="${style} f-${tone}" x="${x}" y="${y}"${placing}>${escape(content)}</text>`
}

function icon(name: Icon, x: number, y: number, tone: Tone, size = 15): string {
  return `<g class="s-${tone}" fill="none" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" transform="translate(${x} ${y}) scale(${size / 24})">${ICON_PATHS[name]}</g>`
}

function drawGitRow(groups: Group[], parts: string[]): number {
  let x = 0

  groups.forEach((group, index) => {
    if (group.key === 'changes') {
      x += 4
      parts.push(text('│', x, 15, 'line', 'strong'))
      x += textWidth('│', SIZES.strong) + 6
    } else if (index > 0) {
      x += 6
    }

    if (group.icon) {
      parts.push(icon(group.icon.name, x, 3, group.icon.tone))
      x += 19
    }

    group.tokens.forEach(token => {
      parts.push(text(token.text, x, 15, token.tone, 'strong'))
      x += textWidth(token.text, SIZES.strong) + 5
    })
  })

  return x
}

const RING = 22
const RING_STROKE = 2.6
const RING_GAP = 5
const LIMITS_GAP = 14

// The ring says which window it is, so a short name fits inside it.
const RING_LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'wk', spend_limit: '$' }

const ringLabel = (kind: string): string => RING_LABELS[kind] ?? limitName(kind).slice(0, 2)

const limitsWidth = (limits: UsageView['limits'], hasPercent: boolean): number =>
  limits.reduce((sum, limit) => sum + RING + LIMITS_GAP + (hasPercent ? RING_GAP + textWidth(`${Math.round(limit.percent)}%`, SIZES.strong) : 0), 0)

function drawRing(kind: string, percent: number, x: number, parts: string[]): void {
  const radius = (RING - RING_STROKE) / 2
  const centre = RING / 2
  const length = 2 * Math.PI * radius
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * length

  parts.push(`<circle class="s-free" cx="${x + centre}" cy="${centre}" r="${radius}" fill="none" stroke-width="${RING_STROKE}"/>`)
  parts.push(
    `<circle class="s-${limitTone(percent)}" cx="${x + centre}" cy="${centre}" r="${radius}" fill="none" stroke-width="${RING_STROKE}" stroke-linecap="round" stroke-dasharray="${filled.toFixed(2)} ${length.toFixed(2)}" transform="rotate(-90 ${x + centre} ${centre})"/>`,
  )
  parts.push(`<text class="ring f-gray" x="${x + centre}" y="${centre + 3}" text-anchor="middle">${escape(ringLabel(kind))}</text>`)
}

function drawLimits(limits: UsageView['limits'], right: number, hasPercent: boolean, parts: string[]): void {
  let x = right

  for (const limit of [...limits].reverse()) {
    if (hasPercent) {
      const percent = `${Math.round(limit.percent)}%`
      parts.push(text(percent, x, 15, limitTone(limit.percent), 'strong', 'end'))
      x -= textWidth(percent, SIZES.strong) + RING_GAP
    }

    x -= RING
    drawRing(limit.kind, limit.percent, x, parts)
    x -= LIMITS_GAP
  }
}

// Everything at the band's right edge is drawn in this, at x from minus its width to 0, however wide the band is.
const atRightEdge = (content: string, height: number): string =>
  `<svg x="100%" y="0" width="1" height="${height}" overflow="visible">${content}</svg>`

type Range = { from: number; to: number }

const contains = (range: Range, width: number): boolean => width >= range.from && width < range.to

function media(range: Range, rules: string): string {
  const conditions = [
    range.from > 0 ? `(min-width:${range.from}px)` : '',
    Number.isFinite(range.to) ? `(max-width:${(range.to - 0.01).toFixed(2)}px)` : '',
  ].filter(Boolean)

  return conditions.length === 0 ? rules : `@media ${conditions.join(' and ')}{${rules}}`
}

// How the limits show over a range of band widths, and the room they take from the git row there.
type LimitsForm = { name: string; range: Range; hasPercent: boolean; reserve: number }

function limitsForms(limits: UsageView['limits']): LimitsForm[] {
  if (limits.length === 0) {
    return [{ name: '', range: { from: 0, to: Infinity }, hasPercent: false, reserve: 0 }]
  }

  return [
    { name: 'lp', range: { from: RINGS_ONLY_BELOW, to: Infinity }, hasPercent: true, reserve: limitsWidth(limits, true) + LIMITS_SPACE },
    { name: 'lr', range: { from: NO_LIMITS_BELOW, to: RINGS_ONLY_BELOW }, hasPercent: false, reserve: limitsWidth(limits, false) + LIMITS_SPACE },
    { name: '', range: { from: 0, to: NO_LIMITS_BELOW }, hasPercent: false, reserve: 0 },
  ]
}

type GitShape = { groups: Group[]; activity: Item[]; width: number; gitWidth: number }

// The activity as icons and numbers alone, which gives way before the git row's names do.
const briefly = (items: Item[]): Item[] =>
  items.map(item => (item.brief === undefined ? item : { ...item, tokens: [{ text: item.brief, tone: item.tokens[0]?.tone ?? 'gray' }] }))

const activityStart = (gitWidth: number): number => gitWidth + 4 + textWidth('│', SIZES.strong) + 6

// What happened since your prompt, after the git row's own groups past a divider.
function drawActivity(items: Item[], gitWidth: number, parts: string[]): number {
  if (items.length === 0) {
    return gitWidth
  }

  const drawn: string[] = []
  const end = drawItems(items, drawn)
  parts.push(text('│', gitWidth + 4, 15, 'line', 'strong'), `<g transform="translate(${activityStart(gitWidth)} 0)">${drawn.join('')}</g>`)

  return activityStart(gitWidth) + end
}

// The widest git row with the activity in words, then with the activity brief, then narrower git rows.
function gitShapes(git: GitStatus, hue: Tone, activity: Item[]): GitShape[] {
  const shapes: GitShape[] = []
  const brief = briefly(activity)

  GIT_FITS.forEach((fit, index) => {
    const groups = groupsOf(git, fit, hue)
    const gitWidth = drawGitRow(groups, [])

    for (const shown of index === 0 ? [activity, brief] : [brief]) {
      const last = shapes.at(-1)

      if (last === undefined || describe(last.groups) !== describe(groups) || describeItems(last.activity) !== describeItems(shown)) {
        shapes.push({ groups, activity: shown, gitWidth, width: drawActivity(shown, gitWidth, []) })
      }
    }
  })

  return shapes
}

// The band widths at which a shape is the first in GIT_FITS order to fit beside the limits; the narrowest shape
// also takes every width below its own.
function shapeRange(shapes: GitShape[], index: number, form: LimitsForm): Range {
  const isNarrowest = index === shapes.length - 1
  const wider = Math.min(...shapes.slice(0, index).map(shape => shape.width))

  return {
    from: Math.max(form.range.from, isNarrowest ? 0 : (shapes[index]?.width ?? 0) + form.reserve),
    to: Math.min(form.range.to, wider + form.reserve),
  }
}

// The image is as wide as the band, whatever that is in pixels. Every shape of the git row and form of the limits
// is drawn, and media queries on the image's own width show the one that fits, so no estimate of the band's width
// decides what shows; the estimate only picks what shows where media queries do not apply. The git row is also
// clipped to the room the limits leave it.
// `activityAt` and `activitySpans` are where the activity and each of its items sit in the shape the estimate picks, for
// hover areas laid over them.
export function drawTop(board: Dashboard, guess: number): Image & { activityAt: number; activitySpans: { start: number; end: number }[] } {
  const limits = board.usage?.limits ?? []
  const activity = board.activity ?? []
  const shapes = gitShapes(board.git, board.hue ?? sessionHue(board.git), activity)
  const forms = limitsForms(limits)
  const guessForm = forms.find(form => contains(form.range, guess)) ?? forms[forms.length - 1]
  const rules: string[] = []
  const shown = new Set<number>()

  for (const form of forms) {
    rules.push(media(form.range, `.l{display:none}${form.name === '' ? '' : `.${form.name}{display:inline}`}#git-room{width:calc(100% - ${form.reserve}px)}`))

    shapes.forEach((_, index) => {
      const range = shapeRange(shapes, index, form)

      if (range.from < range.to) {
        shown.add(index)
        rules.push(media(range, `.v{display:none}.v${index}{display:inline}`))
      }
    })
  }

  const reserve = guessForm?.reserve ?? 0
  const guessShape = shapes.findIndex((_, index) => guessForm !== undefined && contains(shapeRange(shapes, index, guessForm), guess))
  const parts = [`<clipPath id="git"><rect id="git-room" x="0" y="0" width="${Math.max(0, guess - reserve)}" height="${ROW}"/></clipPath><g clip-path="url(#git)">`]

  shapes.forEach((shape, index) => {
    if (shown.has(index)) {
      parts.push(`<g class="v v${index}"${index === guessShape ? '' : ' display="none"'}>`)
      drawActivity(shape.activity, drawGitRow(shape.groups, parts), parts)
      parts.push('</g>')
    }
  })

  parts.push('</g>')

  const right: string[] = []

  for (const form of forms) {
    if (form.name !== '') {
      right.push(`<g class="l ${form.name}"${form === guessForm ? '' : ' display="none"'}>`)
      drawLimits(limits, 0, form.hasPercent, right)
      right.push('</g>')
    }
  }

  parts.push(atRightEdge(right.join(''), ROW))
  const picked = shapes[guessShape] ?? shapes.at(-1)
  const at = activityStart(picked?.gitWidth ?? 0)
  const spans = itemSpans(picked?.activity ?? []).map(span => ({ start: at + span.start, end: at + span.end }))

  return { ...wrap(parts, ROW, rules.join('')), activityAt: at, activitySpans: spans }
}

const CONTEXT_TOP = 4
const CARDS_TOP = 8

// The bar takes what the icon and the percentage leave of the band's real width; the slices are shares of it.
export function drawContext(usage: UsageView, guess: number): Image {
  const top = CONTEXT_TOP
  const percent = `${usage.percent}%`
  const percentWidth = textWidth(percent, SIZES.strong)
  const slices = usage.slices.length > 0 ? usage.slices : [{ name: 'Used', tokens: usage.tokens, color: 'autoAccept' }]
  const tones = sliceTones(slices)
  const barX = 21
  // The gap before the percentage, the percentage, and room after it, so whatever sits beside the image does not touch it.
  const reserve = barX + 10 + percentWidth + 12
  const barY = top + 7.5
  const guessBar = Math.max(0, guess - reserve)
  const share = (fraction: number): string => `(100% - ${reserve}px) * ${fraction.toFixed(4)}`
  const track = `x="${barX}" y="${barY}" width="${guessBar}" height="7" rx="3.5" style="width:max(0px, calc(100% - ${reserve}px))"`
  const parts = [icon('context', 0, top + 3, 'violet'), `<clipPath id="bar"><rect ${track}/></clipPath><rect class="f-free" ${track}/><g clip-path="url(#bar)">`]
  let start = 0

  slices.forEach((slice, index) => {
    const fraction = slice.tokens / Math.max(usage.window, 1)
    parts.push(
      `<rect class="f-${tones[index] ?? 'gray'}" x="${(barX + start * guessBar).toFixed(1)}" y="${barY}" width="${(fraction * guessBar).toFixed(1)}" height="7" ` +
        `style="x:calc(${barX}px + ${share(start)});width:max(0px, calc(${share(fraction)}))"/>`,
    )
    start += fraction
  })

  parts.push('</g>')
  parts.push(atRightEdge(text(percent, -(percentWidth + 12), top + 15, limitTone(usage.percent), 'strong'), top + ROW + top))

  // As much room below as above, so the row's text sits at the image's middle, where a neighbour centred on it lines up.
  return wrap(parts, top + ROW + top)
}

// A card's cell is a share of the band's width; within it the card is inset so the first card starts at the left
// edge, the last ends at the right one, and GAP separates the rest. `width` is the card's estimated width.
type Cell = { left: number; right: number; width: number }

function inCell(index: number, columns: number, top: number, guess: number, parts: string[], draw: (cell: Cell) => void): void {
  const column = index % columns
  const y = top + Math.floor(index / columns) * (CARD + GAP)
  const share = 100 / columns

  parts.push(`<svg x="${(column * share).toFixed(3)}%" y="${y}" width="${share.toFixed(3)}%" height="${CARD}">`)
  draw({ left: (GAP * column) / columns, right: (GAP * (columns - 1 - column)) / columns, width: (guess - GAP * (columns - 1)) / columns })
  parts.push('</svg>')
}

function frame(cell: Cell, tone: Tone, dashes = ''): string {
  const inset = cell.left + cell.right + 1

  return `<rect class="s-${tone}" x="${(cell.left + 0.5).toFixed(2)}" y="0.5" width="${(cell.width - 1).toFixed(1)}" height="${CARD - 1}" rx="8" fill="none"${dashes} style="width:calc(100% - ${inset.toFixed(2)}px)"/>`
}

function drawCard(agent: AgentView, index: number, cell: Cell, now: number, parts: string[]): void {
  const state = stateOf(agent.status)
  const x = cell.left

  parts.push(frame(cell, state.tone))
  parts.push(icon(state.icon, x + 7, 6, state.tone, 13))
  parts.push(text(state.word, x + 24, 17, state.tone, 'small'))
  parts.push(atRightEdge(text(agentTime(agent, now), -(cell.right + 7), 17, 'gray', 'meta', 'end'), CARD))
  // The estimated width cuts the name; the clip keeps a cut that came out long inside the card.
  parts.push(
    `<clipPath id="card-${index}"><rect x="${x}" y="0" width="${Math.max(0, cell.width - 7)}" height="${CARD}" style="width:calc(100% - ${(cell.left + cell.right + 7).toFixed(2)}px)"/></clipPath>`,
  )
  parts.push(`<g clip-path="url(#card-${index})">`)
  parts.push(text(fit(agent.name, SIZES.name, cell.width - 14), x + 7, 35, isActive(agent) ? 'text' : 'inactive', 'name'))
  parts.push(text(fit(`${agent.type} · ${agent.tools} tools`, SIZES.meta, cell.width - 14), x + 7, 50, 'gray', 'meta'))
  parts.push('</g>')
}

function drawMore(count: number, cell: Cell, parts: string[]): void {
  parts.push(frame(cell, 'line', ' stroke-dasharray="4 3"'))
  parts.push(text(`+${count} more`, cell.left + 9, 33, 'gray', 'name'))
}

// Few agents get wider cards, so their names show whole; a narrow band fits fewer to a row instead of shrinking them.
// The estimate picks how many go to a row, which sets the image's height; each card is a share of the real width.
function drawCards(agents: AgentView[], top: number, guess: number, now: number, parts: string[]): number {
  const width = Math.max(MIN_CARD, guess)
  const fitting = Math.max(1, Math.floor((width + GAP) / (MIN_CARD + GAP)))
  const columns = Math.min(fitting, MAX_COLUMNS, Math.max(MIN_COLUMNS, agents.length))
  const capacity = columns * MAX_CARD_ROWS
  const shown = agents.length > capacity ? agents.slice(0, capacity - 1) : agents

  shown.forEach((agent, index) => inCell(index, columns, top, width, parts, cell => drawCard(agent, index, cell, now, parts)))

  if (shown.length < agents.length) {
    inCell(shown.length, columns, top, width, parts, cell => drawMore(agents.length - shown.length, cell, parts))
  }

  const rows = Math.ceil(Math.min(agents.length, capacity) / columns)

  return top + rows * CARD + (rows - 1) * GAP
}

export type Image = { source: string; height: number }

// As wide as whatever holds it and with no viewBox, so nothing is ever scaled and text keeps its size.
function wrap(parts: string[], height: number, rules = ''): Image {
  const font = "font-family:'Segoe UI Variable Text','Segoe UI',system-ui,-apple-system,sans-serif"
  const style =
    `.strong{${font};font-size:${SIZES.strong}px;font-weight:600}.name{${font};font-size:${SIZES.name}px;font-weight:500}` +
    `.small{${font};font-size:${SIZES.small}px;font-weight:600}.meta{${font};font-size:${SIZES.meta}px;font-weight:400}` +
    `.ring{${font};font-size:8px;font-weight:700}` +
    `${palette(DARK)}@media (prefers-color-scheme: light){${palette(LIGHT)}}${rules}`
  const h = Math.ceil(height)

  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}"><style>${style}</style>${parts.join('')}</svg>`,
    height: h,
  }
}

export function drawAgents(agents: AgentView[], guess: number, now: number): Image {
  const parts: string[] = []
  const bottom = drawCards(orderAgents(agents), CARDS_TOP, guess, now, parts)

  return wrap(parts, bottom)
}

const CHIP_PAD = 8
const CHIP_ICON = 13

function drawChip(item: Item, tone: Tone, x: number, parts: string[]): number {
  const words = item.tokens[0]
  const inner = (item.icon ? CHIP_ICON + 5 : 0) + (words ? textWidth(words.text, SIZES.strong) : 0)
  parts.push(`<rect class="f-${tone}" x="${x}" y="2" width="${inner + 2 * CHIP_PAD}" height="18" rx="9"/>`)

  if (item.icon) {
    parts.push(icon(item.icon.name, x + CHIP_PAD, (ROW - CHIP_ICON) / 2, item.icon.tone, CHIP_ICON))
  }

  if (words) {
    parts.push(text(words.text, x + CHIP_PAD + (item.icon ? CHIP_ICON + 5 : 0), 15, words.tone, 'strong'))
  }

  return x + inner + 2 * CHIP_PAD + 6
}

function drawItems(items: Item[], parts: string[]): number {
  let x = 0

  items.forEach((item, index) => {
    if (index > 0) {
      parts.push(text('·', x + 2, 15, 'line', 'strong'))
      x += 14
    }

    if (item.chip !== undefined) {
      x = drawChip(item, item.chip, x, parts)
    } else if (item.icon) {
      parts.push(icon(item.icon.name, x, 3, item.icon.tone))
      x += 19
    }

    item.tokens.slice(item.chip === undefined ? 0 : 1).forEach(token => {
      parts.push(text(token.text, x, 15, token.tone, 'strong'))
      x += textWidth(token.text, SIZES.strong) + 5
    })
  })

  return x
}

const MIN_CUT = 70

// Cuts each item's longest words, last item first, until the row fits the room. An item after the first that would
// be cut below MIN_CUT goes whole, leaving its room to the ones before it.
function fitItems(items: Item[], room: number): Item[] {
  let fitted = items

  for (let index = items.length - 1; index >= 0; index--) {
    const over = drawItems(fitted, []) - room
    const item = fitted[index]

    if (over <= 0 || item === undefined) {
      break
    }

    // A chip's own words stay whole.
    const from = item.chip === undefined ? 0 : 1
    const longest = item.tokens.reduce((best, token, at) => (at > from && token.text.length > (item.tokens[best]?.text.length ?? 0) ? at : best), from)
    const token = item.tokens[longest]

    if (token === undefined) {
      continue
    }

    const left = textWidth(token.text, SIZES.strong) - over

    if (index > 0 && left < MIN_CUT) {
      fitted = fitted.filter((_, at) => at !== index)
      continue
    }

    const cut = { ...token, text: fit(token.text, SIZES.strong, Math.max(30, left)) }
    const tokens = item.tokens.map((other, at) => (at === longest ? cut : other))
    fitted = fitted.map((other, at) => (at === index ? { ...item, tokens } : other))
  }

  return fitted
}

// The state and the latest prompt, clipped to the band.
export function drawStatus(row: StatusRow, guess: number): Image {
  const parts = [`<clipPath id="status"><rect x="0" y="0" width="100%" height="${ROW}"/></clipPath><g clip-path="url(#status)">`]

  drawItems(fitItems(row.items, guess), parts)
  parts.push('</g>')

  return wrap(parts, ROW)
}

const PLAN_ROW = 28
const PLAN_BAR = 24
const PLAN_INSET = 10
const STRIPES = 16

// The step under way, else the next one; null once every step is done.
const shownStep = (step: Step): number | null => {
  const current = step.states.indexOf('in_progress')
  const next = step.states.indexOf('pending')

  return current >= 0 ? current : next >= 0 ? next : null
}

// The plan as one thick bar across the band: the steps done in green, the step under way a striped blue span with its
// number and words that stretches to fit them, what is left dark; the step's number of all at the right. The stripes
// move while the session works.
export function drawPlan(step: Step, guess: number, isWorking: boolean): Image {
  const index = shownStep(step)
  const completed = step.states.filter(state => state === 'completed').length
  const count = `${index === null ? step.total : index + 1}/${step.total}`
  const countWidth = textWidth(count, SIZES.strong)
  const right = countWidth + 14
  const barWidth = Math.max(60, guess - right)
  const y = (PLAN_ROW - PLAN_BAR) / 2
  const room = `(100% - ${right}px)`
  const share = (fraction: number): string => `calc(${room} * ${fraction.toFixed(4)})`
  const at = (fraction: number, content: string, offset = 0): string =>
    `<svg x="${(fraction * 100).toFixed(3)}%" y="0" width="1" height="${PLAN_ROW}" overflow="visible"><g transform="translate(${(offset - fraction * right).toFixed(1)} 0)">${content}</g></svg>`
  const parts = [
    `<defs><clipPath id="plan-bar"><rect x="0" y="${y}" width="${barWidth}" height="${PLAN_BAR}" rx="8" style="width:max(0px, ${share(1)})"/></clipPath>`,
    `<pattern id="stripes" width="${STRIPES}" height="${STRIPES}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="f-sky" width="${STRIPES}" height="${STRIPES}"/>`,
    `<rect fill="#fff" opacity="0.2" width="${STRIPES / 2}" height="${STRIPES}"/>`,
    isWorking ? `<animateTransform attributeName="patternTransform" type="translate" additive="sum" from="0 0" to="${STRIPES} 0" dur="0.9s" repeatCount="indefinite"/>` : '',
    '</pattern></defs>',
    `<g clip-path="url(#plan-bar)"><rect class="f-free" x="0" y="${y}" width="${barWidth}" height="${PLAN_BAR}" style="width:max(0px, ${share(1)})"/>`,
    `<rect class="f-success" x="0" y="${y}" width="${((barWidth * completed) / step.total).toFixed(1)}" height="${PLAN_BAR}" style="width:${share(completed / step.total)}"/>`,
  ]

  for (let done = 1; done < completed; done++) {
    const x = (barWidth * done) / step.total - 1
    parts.push(`<rect class="f-ink" x="${x.toFixed(1)}" y="${y}" width="2" height="${PLAN_BAR}" opacity="0.45" style="x:calc(${share(done / step.total)} - 1px)"/>`)
  }

  if (index === null) {
    parts.push(text(fit(`All ${step.total} steps done`, SIZES.strong, barWidth - 2 * PLAN_INSET), PLAN_INSET, y + 17, 'ink', 'strong'), '</g>')
  } else {
    // The span starts where the steps done end and is a step wide, or as wide as its words where the bar has room.
    const start = index / step.total
    const words = `${index + 1} · ${step.text}`
    const label = fit(words, SIZES.strong, Math.max(barWidth / step.total, barWidth * (1 - start)) - 2 * PLAN_INSET)
    const span = Math.max(barWidth / step.total, Math.min(textWidth(label, SIZES.strong) + 2 * PLAN_INSET, barWidth * (1 - start)))
    const width = `max(${share(1 / step.total)}, min(${span.toFixed(1)}px, ${share(1 - start)}))`
    const isUnderWay = step.states[index] === 'in_progress'
    parts.push(
      `<rect x="${(barWidth * start).toFixed(1)}" y="${y}" width="${span.toFixed(1)}" height="${PLAN_BAR}" fill="url(#stripes)"${isUnderWay ? '' : ' opacity="0.45"'} style="x:${share(start)};width:${width}"/>`,
      at(start, text(label, PLAN_INSET, y + 17, 'ink', 'strong')),
      '</g>',
    )
  }

  parts.push(atRightEdge(text(count, -countWidth, y + 17, 'text', 'strong'), PLAN_ROW))

  return wrap(parts, PLAN_ROW)
}

// The plan in text, for the terminal.
export function planText(step: Step, cells: number): string {
  const done = step.states.filter(state => state === 'completed').length
  const filled = Math.round((cells * done) / step.total)
  const index = shownStep(step)

  return `${'█'.repeat(filled)}${'░'.repeat(cells - filled)} ${index === null ? step.total : index + 1}/${step.total}`
}

// Where each item of a row starts and ends, in pixels from its left edge, as drawItems lays them out.
export function itemSpans(items: Item[]): { start: number; end: number }[] {
  return items.map((_, index) => ({
    start: index === 0 ? 0 : drawItems(items.slice(0, index), []) + 14,
    end: drawItems(items.slice(0, index + 1), []),
  }))
}


const STRIPE = 3

// What the stripe takes of the band's width, the gap after it included.
export const STRIPE_WIDTH = STRIPE + 8

// The worktree's colour down the band's left edge, as tall as the rows.
export function drawStripe(hue: Tone, height: number): Image & { width: number } {
  const h = Math.ceil(height)
  const style = `${palette(DARK)}@media (prefers-color-scheme: light){${palette(LIGHT)}}`
  const stripe = `<rect class="f-${hue}" x="0" y="1" width="${STRIPE}" height="${Math.max(0, h - 2)}" rx="1.5"/>`

  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${STRIPE_WIDTH}" height="${h}"><style>${style}</style>${stripe}</svg>`, height: h, width: STRIPE_WIDTH }
}
