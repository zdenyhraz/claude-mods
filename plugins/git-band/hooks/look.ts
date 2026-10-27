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

export function groupsOf(git: GitStatus, fit: GitFit = FULL): Group[] {
  const groups: Group[] = [
    { key: 'repo', border: 'sky', icon: { name: 'repo', tone: 'sky' }, tokens: [{ text: shorten(git.repo, fit.repo), tone: 'sky' }] },
  ]

  if (git.worktree !== null) {
    const tokens = fit.hasWorktreeName ? [{ text: shorten(git.worktree, fit.worktree), tone: 'violet' as const }] : []
    groups.push({ key: 'worktree', border: 'violet', icon: { name: 'worktree', tone: 'violet' }, tokens })
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

  const changes: Token[] = CHANGES.filter(change => Number(git[change.key]) > 0).map(change => ({
    text: `${String(git[change.key])} ${change.word}`,
    tone: change.tone,
  }))

  if (git.insertions > 0 || git.deletions > 0) {
    changes.push({ text: `+${git.insertions} −${git.deletions} lines`, tone: 'gray' })
  }

  return [names, tracking, changes.length > 0 ? changes : [{ text: '✓ clean', tone: 'success' }]]
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

export function describeTop(board: Dashboard): string {
  const limits = board.usage?.limits ?? []

  return [describe(groupsOf(board.git)), ...limits.map(limit => `${limitName(limit.kind)} ${Math.round(limit.percent)}%`)].join(' · ')
}

export const describeContext = (usage: UsageView): string => `context ${usage.percent}%`

export function describeAgents(agents: AgentView[], now: number): string {
  return orderAgents(agents)
    .map(agent => `agent ${stateOf(agent.status).word} ${agent.name} ${agentTime(agent, now)} ${agent.tools} tools`)
    .join(' · ')
}

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

type GitShape = { groups: Group[]; width: number }

function gitShapes(git: GitStatus): GitShape[] {
  const shapes: GitShape[] = []

  for (const fit of GIT_FITS) {
    const groups = groupsOf(git, fit)
    const last = shapes.at(-1)

    if (last === undefined || describe(last.groups) !== describe(groups)) {
      shapes.push({ groups, width: drawGitRow(groups, []) })
    }
  }

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
export function drawTop(board: Dashboard, guess: number): Image {
  const limits = board.usage?.limits ?? []
  const shapes = gitShapes(board.git)
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
      drawGitRow(shape.groups, parts)
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

  return wrap(parts, ROW, rules.join(''))
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
