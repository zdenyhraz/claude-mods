import type { AgentView, ContextSlice, GitStatus, UsageView } from '../types'

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
  | 'gray'
  | 'free'
  | 'line'
export type Icon = 'repo' | 'worktree' | 'branch' | 'context' | 'running' | 'waiting' | 'done' | 'failed' | 'queued'
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
  gray: '#8a8882',
  free: '#3d3c38',
  line: '#4a4945',
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
  gray: '#8a8882',
  free: '#e8e6de',
  line: '#d9d7cf',
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
}

const CHANGES: { key: keyof GitStatus; symbol: string; tone: Tone }[] = [
  { key: 'conflicted', symbol: '!', tone: 'error' },
  { key: 'added', symbol: '+', tone: 'success' },
  { key: 'modified', symbol: '~', tone: 'warning' },
  { key: 'deleted', symbol: '−', tone: 'error' },
  { key: 'renamed', symbol: '→', tone: 'blue' },
  { key: 'untracked', symbol: '?', tone: 'teal' },
  { key: 'staged', symbol: '●', tone: 'blue' },
]

const MAX_NAME = 40

const shorten = (name: string): string => (name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1)}…` : name)

export function groupsOf(git: GitStatus): Group[] {
  const groups: Group[] = [{ key: 'repo', border: 'sky', icon: { name: 'repo', tone: 'sky' }, tokens: [{ text: shorten(git.repo), tone: 'sky' }] }]

  if (git.worktree !== null) {
    groups.push({ key: 'worktree', border: 'violet', icon: { name: 'worktree', tone: 'violet' }, tokens: [{ text: shorten(git.worktree), tone: 'violet' }] })
  }

  const branch: Token[] = [{ text: shorten(git.branch), tone: 'claude' }]

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

  const counts: Token[] = CHANGES.filter(change => Number(git[change.key]) > 0).map(change => ({
    text: `${change.symbol}${String(git[change.key])}`,
    tone: change.tone,
  }))

  if (counts.length === 0) {
    groups.push({ key: 'changes', border: 'success', tokens: [{ text: '✓ clean', tone: 'success' }] })
    return groups
  }

  if (git.insertions > 0 || git.deletions > 0) {
    counts.push({ text: `+${git.insertions}`, tone: 'success' }, { text: `−${git.deletions}`, tone: 'error' })
  }

  groups.push({ key: 'changes', border: git.conflicted > 0 ? 'error' : 'warning', tokens: counts })

  return groups
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

export type Dashboard = { git: GitStatus; usage: UsageView | null; agents: AgentView[]; now: number }

export const agentTime = (agent: AgentView, now: number): string => elapsed((agent.endedAt ?? now) - agent.startedAt)

export function describe(groups: Group[]): string {
  return groups.map(group => `${group.key} ${group.tokens.map(token => token.text).join(' ')}`).join(' · ')
}

export function describeDashboard(board: Dashboard): string {
  const parts = [describe(groupsOf(board.git))]

  if (board.usage) {
    parts.push(`context ${board.usage.percent}% ${kilo(board.usage.tokens)}/${kilo(board.usage.window)}`)
    parts.push(...board.usage.limits.map(limit => `${limitName(limit.kind)} ${Math.round(limit.percent)}%`))
  }

  parts.push(
    ...orderAgents(board.agents).map(
      agent => `agent ${stateOf(agent.status).word} ${agent.name} ${agentTime(agent, board.now)} ${agent.tools} tools`,
    ),
  )

  return parts.join(' · ')
}

const MIN_WIDTH = 320
const ROW = 22
const GAP = 6
const CARD = 56
const MIN_CARD = 150
const MIN_COLUMNS = 3
const MAX_COLUMNS = 5
const MAX_CARD_ROWS = 2
const MIN_BAR = 40
const MIN_BRANCH = 48

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

const LIMIT_GAP = 7
const LIMITS_GAP = 16

const limitsWidth = (limits: UsageView['limits']): number =>
  limits.reduce(
    (sum, limit) => sum + textWidth(limitName(limit.kind), SIZES.small) + LIMIT_GAP + textWidth(`${Math.round(limit.percent)}%`, SIZES.strong) + LIMITS_GAP,
    0,
  )

function drawLimits(limits: UsageView['limits'], right: number, parts: string[]): void {
  let x = right

  for (const limit of [...limits].reverse()) {
    const percent = `${Math.round(limit.percent)}%`
    parts.push(text(percent, x, 15, limitTone(limit.percent), 'strong', 'end'))
    x -= textWidth(percent, SIZES.strong) + LIMIT_GAP
    parts.push(text(limitName(limit.kind), x, 15, 'gray', 'small', 'end'))
    x -= textWidth(limitName(limit.kind), SIZES.small) + LIMITS_GAP
  }
}

function drawContextRow(usage: UsageView, top: number, width: number, parts: string[]): void {
  const percent = `${usage.percent}%`
  const amount = `${kilo(usage.tokens)}/${kilo(usage.window)}`
  const slices = usage.slices.length > 0 ? usage.slices : [{ name: 'Used', tokens: usage.tokens, color: 'autoAccept' }]
  const tones = sliceTones(slices)
  const tail = textWidth(percent, SIZES.strong) + 6 + textWidth(amount, SIZES.meta)
  const barX = 21
  const barWidth = Math.max(MIN_BAR, width - barX - 10 - tail)
  const barY = top + 7.5
  let x = barX

  parts.push(icon('context', 0, top + 3, 'violet'))
  parts.push(`<clipPath id="bar"><rect x="${barX}" y="${barY}" width="${barWidth}" height="7" rx="3.5"/></clipPath>`)
  parts.push(`<rect class="f-free" x="${barX}" y="${barY}" width="${barWidth}" height="7" rx="3.5"/><g clip-path="url(#bar)">`)

  slices.forEach((slice, index) => {
    const w = (slice.tokens / Math.max(usage.window, 1)) * barWidth
    parts.push(`<rect class="f-${tones[index] ?? 'gray'}" x="${x.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="7"/>`)
    x += w
  })

  parts.push('</g>')
  x = barX + barWidth + 10
  parts.push(text(percent, x, top + 15, limitTone(usage.percent), 'strong'))
  x += textWidth(percent, SIZES.strong) + 6
  parts.push(text(amount, x, top + 15, 'gray', 'meta'))
}

function drawCard(agent: AgentView, x: number, y: number, width: number, now: number, parts: string[]): void {
  const state = stateOf(agent.status)

  parts.push(`<rect class="s-${state.tone}" x="${x + 0.5}" y="${y + 0.5}" width="${width - 1}" height="${CARD - 1}" rx="8" fill="none"/>`)
  parts.push(icon(state.icon, x + 7, y + 6, state.tone, 13))
  parts.push(text(state.word, x + 24, y + 17, state.tone, 'small'))
  parts.push(text(agentTime(agent, now), x + width - 7, y + 17, 'gray', 'meta', 'end'))
  parts.push(text(fit(agent.name, SIZES.name, width - 14), x + 7, y + 35, isActive(agent) ? 'text' : 'inactive', 'name'))
  parts.push(text(fit(`${agent.type} · ${agent.tools} tools`, SIZES.meta, width - 14), x + 7, y + 50, 'gray', 'meta'))
}

function drawMore(count: number, x: number, y: number, width: number, parts: string[]): void {
  parts.push(`<rect class="s-line" x="${x + 0.5}" y="${y + 0.5}" width="${width - 1}" height="${CARD - 1}" rx="8" fill="none" stroke-dasharray="4 3"/>`)
  parts.push(text(`+${count} more`, x + 9, y + 33, 'gray', 'name'))
}

function drawCards(agents: AgentView[], top: number, width: number, now: number, parts: string[]): number {
  // Few agents get wider cards, so their names show whole; a narrow band fits fewer to a row instead of shrinking them.
  const fitting = Math.max(1, Math.floor((width + GAP) / (MIN_CARD + GAP)))
  const columns = Math.min(fitting, MAX_COLUMNS, Math.max(MIN_COLUMNS, agents.length))
  const cardWidth = (width - GAP * (columns - 1)) / columns
  const capacity = columns * MAX_CARD_ROWS
  const shown = agents.length > capacity ? agents.slice(0, capacity - 1) : agents
  const place = (index: number): [number, number] => [(index % columns) * (cardWidth + GAP), top + Math.floor(index / columns) * (CARD + GAP)]

  shown.forEach((agent, index) => drawCard(agent, ...place(index), cardWidth, now, parts))

  if (shown.length < agents.length) {
    drawMore(agents.length - shown.length, ...place(shown.length), cardWidth, parts)
  }

  const rows = Math.ceil(Math.min(agents.length, capacity) / columns)

  return top + rows * CARD + (rows - 1) * GAP
}

// The branch name gives way first when the git row and the limits would not fit side by side.
function fitGitRow(groups: Group[], room: number): Group[] {
  const overflow = drawGitRow(groups, []) - room

  if (overflow <= 0) {
    return groups
  }

  return groups.map(group => {
    const [name, ...rest] = group.tokens

    if (group.key !== 'branch' || name === undefined) {
      return group
    }

    const target = Math.max(MIN_BRANCH, textWidth(name.text, SIZES.strong) - overflow)

    return { ...group, tokens: [{ ...name, text: fit(name.text, SIZES.strong, target) }, ...rest] }
  })
}

// `room` is the band's width in CSS pixels: the image is drawn at exactly that width, so the app never scales it
// and text keeps its size; the context bar, the branch name and the number of cards to a row give way instead.
export function drawDashboard(board: Dashboard, room: number): { source: string; width: number; height: number } {
  const parts: string[] = []
  const width = Math.max(MIN_WIDTH, Math.floor(room))
  const limits = board.usage?.limits ?? []
  let height = ROW

  drawGitRow(fitGitRow(groupsOf(board.git), width - limitsWidth(limits) - 8), parts)
  drawLimits(limits, width, parts)

  if (board.usage) {
    drawContextRow(board.usage, height + 4, width, parts)
    height += 4 + ROW
  }

  if (board.agents.length > 0) {
    height = drawCards(orderAgents(board.agents), height + 8, width, board.now, parts)
  }

  const font = "font-family:'Segoe UI Variable Text','Segoe UI',system-ui,-apple-system,sans-serif"
  const style =
    `.strong{${font};font-size:${SIZES.strong}px;font-weight:600}.name{${font};font-size:${SIZES.name}px;font-weight:500}` +
    `.small{${font};font-size:${SIZES.small}px;font-weight:600}.meta{${font};font-size:${SIZES.meta}px;font-weight:400}` +
    `${palette(DARK)}@media (prefers-color-scheme: light){${palette(LIGHT)}}`
  const h = Math.ceil(height)

  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}"><style>${style}</style>${parts.join('')}</svg>`,
    width,
    height: h,
  }
}

