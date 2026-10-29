import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, ProcessRunResult, Register, RenderElement, RenderNode, SessionContextUsage, SessionRateLimit, Timer, ToolCallResult } from 'claude-code'

import type { ActivityView, AgentView, GitStatus, TurnPhase, UsageView } from '../types'
import { parseBranch, parseFiles, parseLayout, parseShortstat, repoName, worktreeName } from './git'
import type { Layout } from './git'
import {
  agentTime,
  agoChangesIn,
  describeAgents,
  describeContext,
  describeItems,
  describeStatus,
  describeTop,
  detailsOf,
  drawAgents,
  drawContext,
  drawSince,
  drawStatus,
  drawStripe,
  drawTop,
  groupsOf,
  isActive,
  kilo,
  limitName,
  limitTone,
  orderAgents,
  sessionHue,
  sinceOf,
  sliceTones,
  stateOf,
  statusOf,
  hueKey,
  STRIPE_WIDTH,
  WORKTREE_HUES,
} from './look'
import type { CompactMode } from './compact-button'
import type { Dashboard, Icon, Image, Item, Tone } from './look'
import {
  NO_ACTIVITY,
  applyPlanUpdate,
  commandOf,
  describeTool,
  editedPath,
  isOwnPrompt,
  lastPrompt,
  pickHue,
  promptLine,
  shortPath,
  todosOf,
  waitsFor,
  withCommand,
  withEdit,
  withHue,
} from './session'
import type { HueTable, ToolArgs } from './session'

const SETTLE_MS = 300
const TICK_MS = 5_000
// An estimate of a cell's width in CSS pixels on the desktop. The images fill the band's real width whatever it
// is; the estimate only decides how many agent cards go to a row, where the prompt is cut, and what an image shows
// if its CSS is dropped.
const PX_PER_COLUMN = 7.6
const REFRESHING_TOOLS = /^(Bash|PowerShell|Edit|Write|NotebookEdit|EnterWorktree|ExitWorktree)$/

const status = atom({ plugin: 'git-band', key: 'status' } as const, null)
const usage = atom({ plugin: 'git-band', key: 'usage' } as const, null)
const agents = atom({ plugin: 'git-band', key: 'agents' } as const, [])
const latestPrompt = atom({ plugin: 'git-band', key: 'latestPrompt' } as const, null)
const turn = atom({ plugin: 'git-band', key: 'turn' } as const, { phase: 'idle', detail: '', at: 0 })
const plan = atom({ plugin: 'git-band', key: 'plan' } as const, [])
const activity = atom({ plugin: 'git-band', key: 'activity' } as const, NO_ACTIVITY)
const hue = atom({ plugin: 'git-band', key: 'hue' } as const, null)

// The terminal draws text alone, so each tone of the desktop's image maps to the theme key nearest it.
const THEME_KEYS: Record<Tone, Color> = {
  text: 'text',
  subtle: 'subtle',
  inactive: 'inactive',
  claude: 'claude',
  success: 'success',
  error: 'error',
  warning: 'warning',
  blue: 'permission',
  violet: 'merged',
  teal: 'planMode',
  sky: 'ide',
  pink: 'bashBorder',
  tan: 'warning',
  coral: 'claude',
  lime: 'success',
  gray: 'inactive',
  free: 'subtle',
  line: 'subtle',
  ink: 'inverseText',
}

const GLYPHS: Partial<Record<Icon, string>> = {
  repo: '▤',
  worktree: '⑂',
  branch: '⎇',
  running: '●',
  waiting: '◐',
  done: '✓',
  failed: '✕',
  queued: '○',
  prompt: '›',
  history: '↺',
}

// The compact control's cells beside the context row's image.
const COMPACT_COLUMNS = 9

// The band redraws for reasons of the app's own (a turn starting, a resize); an image is rebuilt only when what it
// shows changed. A resize alone keeps the git and context images, which lay themselves out at the new width.
const cache = new Map<string, { key: string; image: Image }>()

function cachedImage(row: string, key: string, draw: () => Image): Image {
  const hit = cache.get(row)

  if (hit?.key === key) {
    return hit.image
  }

  const image = draw()
  cache.set(row, { key, image })

  return image
}

let compactMode: CompactMode = 'ready'
let isTurnRunning = false
// The question a turn's wrap-up left for the person, shown as what the session waits on once the turn ends.
let pendingAsk: string | null = null

function setCompactMode($: EngineInterface, mode: CompactMode): void {
  compactMode = mode
  $.ui.invalidate('ui.render')
}

// Runs /compact as if typed, which the engine queues until the turn ends. From a timer, since a command started
// inside the hook handling the click would wait on that hook.
function compactNow($: EngineInterface): void {
  if (compactMode !== 'ready') {
    return
  }

  setCompactMode($, isTurnRunning ? 'queued' : 'compacting')

  if (isTurnRunning) {
    $.ui.toast('Compacting when this turn ends')
  }

  $.clock.after(1, () => void runCompact($))
}

async function runCompact($: EngineInterface): Promise<void> {
  try {
    await $.command.run({ command: 'compact' })
    const now = await $.session.usage().catch(() => null)

    if (now) {
      await recordUsage($, now.context, now.rateLimits)
    }
  } catch (error) {
    $.ui.toast(`Compaction failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    setCompactMode($, 'ready')
  }
}

async function git($: EngineInterface, args: string[]): Promise<ProcessRunResult | null> {
  return $.process.run(['git', '--no-optional-locks', ...args], { timeoutMs: 15_000 }).catch(() => null)
}

// null outside a repository; undefined when git could not answer, so the band keeps what it last knew.
async function readLayout($: EngineInterface): Promise<Layout | null | undefined> {
  const run = await git($, ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'])

  if (run === null) {
    return undefined
  }

  if (run.exitCode !== 0) {
    return /not a git repository/i.test(run.stderr) ? null : undefined
  }

  return parseLayout(run.stdout) ?? undefined
}

async function readStatus($: EngineInterface): Promise<GitStatus | null | undefined> {
  const layout = await readLayout($)

  if (!layout) {
    return layout
  }

  const [statusRun, diffRun] = await Promise.all([
    git($, ['status', '--porcelain=v2', '--branch']),
    git($, ['diff', 'HEAD', '--shortstat']),
  ])

  if (statusRun?.exitCode !== 0) {
    return undefined
  }

  return {
    repo: repoName(layout),
    worktree: worktreeName(layout),
    ...parseBranch(statusRun.stdout),
    ...parseFiles(statusRun.stdout),
    ...parseShortstat(diffRun?.exitCode === 0 ? diffRun.stdout : ''),
  }
}

let isRefreshing = false
let isQueued = false
let isScheduled = false
let isAwaitingPerson = false
let lastJson = ''

async function refresh($: EngineInterface): Promise<void> {
  if (isRefreshing) {
    isQueued = true
    return
  }

  isRefreshing = true

  try {
    do {
      isQueued = false
      const fresh = await readStatus($)
      const json = JSON.stringify(fresh)

      if (fresh !== undefined && json !== lastJson) {
        lastJson = json
        await update($, status, () => fresh)
        $.ui.invalidate('ui.render')
      }

      if (fresh) {
        await claimHue($, fresh).catch(() => undefined)
      }
    } while (isQueued)
  } finally {
    isRefreshing = false
  }
}

// Runs once, a moment later rather than in the hook, so a burst of events is one refresh and none is cut short with its dispatch.
function scheduleRefresh($: EngineInterface): void {
  if (isScheduled) {
    return
  }

  isScheduled = true
  $.clock.after(SETTLE_MS, () => {
    isScheduled = false
    void refresh($)
  })
}

// Every command that commits, checks out, stages, resets, merges, rebases or fetches writes one of these.
async function gitFilesToWatch($: EngineInterface): Promise<string[]> {
  const layout = await readLayout($)

  if (!layout) {
    return []
  }

  return [`${layout.gitDir}/HEAD`, `${layout.gitDir}/index`, `${layout.gitDir}/logs/HEAD`, `${layout.commonDir}/FETCH_HEAD`]
}

// The breakdown is estimated locally ('summary'): no request is sent for it.
async function recordUsage($: EngineInterface, context: SessionContextUsage, limits: readonly SessionRateLimit[]): Promise<void> {
  const detailed = await $.session.usage({ breakdown: 'summary' }).catch(() => null)
  const categories = detailed?.context.breakdown?.categories ?? []
  const fresh: UsageView = {
    tokens: context.tokens ?? 0,
    window: context.window,
    percent: Math.round(context.percent ?? 0),
    slices: categories.filter(slice => slice.kind === 'used').map(slice => ({ name: slice.name, tokens: slice.tokens, color: slice.color })),
    limits: limits.map(limit => ({ kind: limit.kind, percent: limit.percentUsed, resetsAt: limit.resetsAt })),
  }

  await update($, usage, () => fresh)
}

let ticker: { cancel: () => void } | null = null

// While an agent is active its time and state move without an event to say so; nothing ticks otherwise.
function tickWhileActive($: EngineInterface, list: readonly AgentView[]): void {
  const isAnyActive = list.some(isActive)

  if (isAnyActive && ticker === null) {
    ticker = $.clock.every(TICK_MS, () => void syncAgents($))
  } else if (!isAnyActive && ticker !== null) {
    ticker.cancel()
    ticker = null
  }
}

async function syncAgents($: EngineInterface): Promise<void> {
  const [infos, now] = await Promise.all([$.agent.list().catch(() => null), $.clock.now()])

  if (infos === null) {
    return
  }

  const next = await update($, agents, current => {
    const known = new Map(current.map(agent => [agent.id, agent]))

    for (const info of infos) {
      const seen = known.get(info.id)
      const base = seen ?? { id: info.id, name: info.description, type: info.type, status: info.status, startedAt: now, tools: 0 }
      const view: AgentView = { ...base, status: info.status }

      if (!isActive(view) && view.endedAt === undefined) {
        view.endedAt = now
      }

      known.set(info.id, view)
    }

    return [...known.values()]
  })

  tickWhileActive($, next)
  $.ui.invalidate('ui.render')
}

async function addAgent($: EngineInterface, id: string, name: string, type: string): Promise<void> {
  const now = await $.clock.now()
  const next = await update($, agents, current => [
    ...current.filter(agent => agent.id !== id),
    { id, name, type, status: 'running', startedAt: now, tools: 0 },
  ])

  tickWhileActive($, next)
}

async function countTool($: EngineInterface, id: string): Promise<void> {
  await update($, agents, current => current.map(agent => (agent.id === id ? { ...agent, tools: agent.tools + 1 } : agent)))
}

// A new prompt starts a new piece of work: agents that already finished leave the dashboard.
async function dropFinished($: EngineInterface): Promise<void> {
  await update($, agents, current => current.filter(isActive))
}

type CardEntry = { text: string; note: string; mark: string; tone: Tone; isHeading: boolean }

const MAX_CARD_FILES = 6

const heading = (text: string): CardEntry => ({ text, note: '', mark: '', tone: 'gray', isHeading: true })

// The since row's hover card: the files edited, the commands run and the subagents that finished.
function sinceDetails(since: ActivityView, list: readonly AgentView[], now: number): CardEntry[] {
  const entries: CardEntry[] = []
  const finished = orderAgents([...list]).filter(agent => !isActive(agent))

  if (since.files.length > 0) {
    entries.push(heading(`Edited · ${since.files.length} files`))
    since.files.slice(0, MAX_CARD_FILES).forEach(file => entries.push({ text: file.path, note: `${file.edits} edit${file.edits === 1 ? '' : 's'}`, mark: '✎', tone: 'warning', isHeading: false }))

    if (since.files.length > MAX_CARD_FILES) {
      entries.push({ text: `and ${since.files.length - MAX_CARD_FILES} more`, note: '', mark: '', tone: 'gray', isHeading: false })
    }
  }

  if (since.commands.length > 0) {
    entries.push(heading('Ran'))
    since.commands.forEach(command =>
      entries.push({ text: command.text, note: `${(command.ms / 1000).toFixed(1)} s`, mark: command.isOk ? '✓' : '✕', tone: command.isOk ? 'success' : 'error', isHeading: false }),
    )
  }

  if (finished.length > 0) {
    entries.push(heading('Subagents'))
    finished.forEach(agent =>
      entries.push({ text: agent.name, note: `${agentTime(agent, now)} · ${agent.tools} tools`, mark: stateOf(agent.status).glyph, tone: stateOf(agent.status).tone, isHeading: false }),
    )
  }

  return entries
}

async function setTurn($: EngineInterface, phase: TurnPhase, detail: string): Promise<void> {
  const now = await $.clock.now()
  await update($, turn, () => ({ phase, detail, at: now }))
}

// A reload keeps the prompt in $.state; a mod loaded mid-session reads it from the transcript.
async function loadLatestPrompt($: EngineInterface): Promise<void> {
  if ((await read($, latestPrompt)) !== null) {
    return
  }

  const found = lastPrompt(await $.session.messages())

  if (found !== null) {
    await update($, latestPrompt, () => found)
  }
}

// A prompt of the person's own shows at the top and starts what "since your prompt" counts.
async function notePrompt($: EngineInterface, text: string): Promise<void> {
  const now = await $.clock.now()
  await update($, activity, () => ({ ...NO_ACTIVITY, since: now }))
  const line = promptLine(text)

  if (line !== null) {
    await update($, latestPrompt, () => line)
  }
}

const HUE_TOUCH_MS = 10 * 60_000
let huedKey = ''
let huedAt = 0

// Colours are handed out across sessions through the store; a session marks its worktree's as in use now and then,
// so a session opened later picks another.
async function claimHue($: EngineInterface, git: GitStatus): Promise<void> {
  const key = hueKey(git)
  const now = await $.clock.now()

  if (key === huedKey && now - huedAt < HUE_TOUCH_MS) {
    return
  }

  huedKey = key
  huedAt = now
  const stored = await $.store.get('hues')
  const table = stored !== null && typeof stored === 'object' ? (stored as HueTable) : {}
  const picked = pickHue(table, key, WORKTREE_HUES)
  await $.store.set('hues', withHue(table, key, picked, now))
  await update($, hue, () => picked)
}

async function noteToolStart($: EngineInterface, tool: string, args: ToolArgs): Promise<void> {
  const question = waitsFor(tool, args)

  if (question !== null) {
    await setTurn($, 'waiting', question)
  } else if (tool === 'mcp__ccd_turn__wrap_up') {
    pendingAsk = typeof args.ask === 'string' && args.ask !== '' ? args.ask : null
    await update($, plan, steps => steps.map(step => ({ ...step, status: 'completed' as const })))
  } else if (tool === 'mcp__ccd_turn__update_plan') {
    await update($, plan, steps => applyPlanUpdate(steps, args))
  } else if (tool === 'TodoWrite') {
    await update($, plan, () => todosOf(args))
  } else {
    const detail = describeTool(tool, args)

    if (detail !== null) {
      await setTurn($, 'working', detail)
    }
  }
}

// Subagents' edits and commands count too: they are part of what happened since the prompt.
async function noteToolEnd($: EngineInterface, tool: string, args: ToolArgs, result: ToolCallResult, startedAt: number, isMain: boolean): Promise<void> {
  const now = await $.clock.now()
  const isOk = !('deny' in result && result.deny !== undefined) && (result as { isError?: boolean }).isError !== true
  const path = editedPath(tool, args)

  if (isMain && isTurnRunning && describeTool(tool, args) !== null) {
    await setTurn($, 'working', 'Thinking')
  }

  if ((await read($, activity)).since === null) {
    return
  }

  if (path !== null && isOk) {
    await update($, activity, current => withEdit(current, shortPath(path)))
  } else if (tool === 'Bash' || tool === 'PowerShell') {
    await update($, activity, current => withCommand(current, commandOf(args), isOk, now - startedAt, now))
  }
}

function endedPhase(isAborted: boolean, reason: string): [TurnPhase, string] {
  if (isAborted || reason === 'aborted') {
    return ['stopped', '']
  }

  if (reason !== 'answer') {
    return ['failed', '']
  }

  return pendingAsk === null ? ['done', ''] : ['waiting', pendingAsk]
}

let redrawAt = Infinity
let redrawTimer: Timer | null = null

// "12 m ago" changes with no event to say so: one redraw, when the soonest of the shown times next changes.
function redrawWhenTimesChange($: EngineInterface, now: number, times: number[]): void {
  const due = Math.min(...times.map(at => now + agoChangesIn(now - at)))

  if (!Number.isFinite(due) || due >= redrawAt) {
    return
  }

  redrawTimer?.cancel()
  redrawAt = due
  redrawTimer = $.clock.after(due - now, () => {
    redrawTimer = null
    redrawAt = Infinity
    $.ui.invalidate('ui.render')
  })
}

// Band mods share the band: each puts its own in a Box keyed `band:<name>`, inside one column keyed `bands` that
// the next mod unpacks, so no band hides another. A survey or a mod that draws no column is one more item.
const BANDS = 'bands'

function bandsBelow(rest: RenderElement | null | undefined): RenderNode[] {
  if (!rest || (rest.type === 'Box' && (rest.children ?? []).length === 0)) {
    return []
  }

  if (rest.type !== 'Box' || rest.props?.key !== BANDS) {
    return [rest]
  }

  // The engine stamps a hook's root with its owner; unpacked, that stamp belongs on the owner's own band.
  const owner = rest.part?.plugin

  return (rest.children ?? []).map(child =>
    owner !== undefined && typeof child !== 'string' && child.type === 'Box' && child.props?.key === `band:${owner}` && child.part === undefined
      ? { ...child, part: rest.part }
      : child,
  )
}

function stackBands(band: RenderNode, rest: RenderElement | null | undefined): RenderElement {
  return {
    type: 'Box',
    props: { key: BANDS, flexDirection: 'column' },
    children: [{ type: 'Box', props: { key: 'band:git-band', flexDirection: 'column' }, children: [band] }, ...bandsBelow(rest)],
  }
}

export const register: Register = on => {
  // A reload keeps the values in $.state but not the band's drawing, which otherwise waits for the next prompt.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await loadLatestPrompt($).catch(() => undefined)
    isAwaitingPerson = true
    $.ui.invalidate('ui.render')
    void refresh($)
    void syncAgents($)
    const now = await $.session.usage().catch(() => null)

    if (now) {
      void recordUsage($, now.context, now.rateLimits)
    }

    return result
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    void recordUsage($, e.context, e.rateLimits)

    return result
  })

  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    const paths = await gitFilesToWatch($)

    return paths.length === 0 ? result : { ...result, watchPaths: [...(result.watchPaths ?? []), ...paths] }
  })

  on('classic.FileChanged', async ($, e, next) => {
    const result = await next(e)
    scheduleRefresh($)

    return result
  })

  on('classic.CwdChanged', async ($, e, next) => {
    const result = await next(e)
    scheduleRefresh($)

    return result
  })

  // Catches edits made outside the session (an editor, a terminal) once the person is back at the prompt.
  on('prompt.edit', async ($, e, next) => {
    const result = await next(e)

    if (isAwaitingPerson) {
      isAwaitingPerson = false
      scheduleRefresh($)
    }

    return result
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    void dropFinished($)

    if (isOwnPrompt(e)) {
      void notePrompt($, e.text).catch(() => undefined)
    }

    return result
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)

    if ('agentId' in result && typeof result.agentId === 'string') {
      void addAgent($, result.agentId, e.description, e.subagentType)
    }

    return result
  }).catch(($, e, next) => next(e))

  // A subagent's hooks read its own directory, which may be another worktree than the session's.
  on('tool.call', async ($, e, next) => {
    const args = e as unknown as ToolArgs
    const isMain = e.agentId === undefined
    const startedAt = await $.clock.now()

    if (isMain && isTurnRunning) {
      await noteToolStart($, e.tool, args).catch(() => undefined)
    }

    const result = await next(e)
    void noteToolEnd($, e.tool, args, result, startedAt, isMain).catch(() => undefined)

    if (e.agentId !== undefined) {
      void countTool($, e.agentId)
    } else if (REFRESHING_TOOLS.test(e.tool)) {
      scheduleRefresh($)
    }

    return result
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      isTurnRunning = true
      pendingAsk = null
      await setTurn($, 'working', 'Thinking').catch(() => undefined)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId === undefined) {
      const [phase, detail] = endedPhase(e.isAborted, e.reason)
      pendingAsk = null
      await setTurn($, phase, detail).catch(() => undefined)
      isTurnRunning = false
      isAwaitingPerson = true
      scheduleRefresh($)

      if (compactMode === 'queued') {
        setCompactMode($, 'compacting')
      }
    }

    void syncAgents($)

    return result
  })

  on('ui.message', async ($, e, next) => {
    const result = await next(e)
    const data = e.data as { action?: unknown } | null

    if (e.element === 'compact' && data?.action === 'compact') {
      compactNow($)
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const gitStatus = await read($, status)

    if (gitStatus === null) {
      return next(e)
    }

    const board: Dashboard = { git: gitStatus, usage: await read($, usage), agents: await read($, agents), now: await $.clock.now() }
    const [turnNow, promptNow, planNow, activityNow, claimed] = await Promise.all([read($, turn), read($, latestPrompt), read($, plan), read($, activity), read($, hue)])
    board.hue = WORKTREE_HUES.find(tone => tone === claimed) ?? sessionHue(board.git)
    const statusRow = turnNow.phase !== 'idle' || promptNow !== null || planNow.length > 0 ? statusOf(turnNow, promptNow, planNow, board.now) : null
    const since = activityNow.since === null ? null : sinceOf(activityNow, board.agents, board.now)
    const shownTimes = [...(['idle', 'working'].includes(turnNow.phase) ? [] : [turnNow.at]), ...(activityNow.since === null ? [] : [activityNow.since])]
    redrawWhenTimesChange($, board.now, shownTimes)
    const { Box, Text } = $.ui.resolve(e)
    let band

    // Box borders on the desktop take a whole row above and below; one image keeps the dashboard compact.
    if (e.surface === 'terminal') {
      const word = (content: string, tone: Tone) => (
        <Text color={THEME_KEYS[tone]} bold wrap="truncate-end">
          {content}
        </Text>
      )

      const chip = (item: Item, tone: Tone) => (
        <Text color={THEME_KEYS[tone]} inverse bold wrap="truncate-end">
          {` ${[item.icon && GLYPHS[item.icon.name], item.tokens[0]?.text].filter(Boolean).join(' ')} `}
        </Text>
      )

      const line = (items: Item[]) => (
        <Box flexDirection="row" columnGap="sm" overflow="hidden">
          {items.map(item => (
            <Box flexDirection="row" columnGap="sm" flexShrink={1}>
              {item.chip !== undefined ? chip(item, item.chip) : item.icon && GLYPHS[item.icon.name] && word(GLYPHS[item.icon.name] ?? '', item.icon.tone)}
              {item.tokens.slice(item.chip === undefined ? 0 : 1).map(token => word(token.text, token.tone))}
            </Box>
          ))}
        </Box>
      )

      band = (
        <Box flexDirection="column">
          {statusRow && line(statusRow.items)}
          {since && line(since)}
          <Box flexDirection="row" columnGap="md" overflow="hidden">
            {groupsOf(board.git, undefined, board.hue).map(group => (
              <Box key={group.key} flexDirection="row" columnGap="sm" flexShrink={group.key === 'changes' ? 0 : 1}>
                {group.icon && GLYPHS[group.icon.name] && word(GLYPHS[group.icon.name] ?? '', group.icon.tone)}
                {group.tokens.map(token => word(token.text, token.tone))}
              </Box>
            ))}
            {board.usage?.limits.map(limit => (
              <Box key={limit.kind} flexDirection="row" columnGap="sm">
                {word(limitName(limit.kind), 'gray')}
                {word(`${Math.round(limit.percent)}%`, limitTone(limit.percent))}
              </Box>
            ))}
          </Box>
          {board.usage && (
            <Box flexDirection="row" columnGap="sm" overflow="hidden">
              {word(`context ${board.usage.percent}%`, limitTone(board.usage.percent))}
              {board.usage.slices.map((slice, index) => word(`${slice.name} ${kilo(slice.tokens)}`, sliceTones(board.usage?.slices ?? [])[index] ?? 'gray'))}
            </Box>
          )}
          {orderAgents(board.agents).map(agent => (
            <Box key={agent.id} flexDirection="row" columnGap="sm" overflow="hidden">
              {word(stateOf(agent.status).glyph, stateOf(agent.status).tone)}
              {word(agent.name, isActive(agent) ? 'text' : 'inactive')}
              {word(`${agent.type} · ${agent.tools} tools · ${agentTime(agent, board.now)}`, 'gray')}
            </Box>
          ))}
        </Box>
      )
    } else {
      const { Svg } = $.ui.resolve(e)
      // The desktop alone draws a Client; elsewhere the context row goes without the control.
      const Client = e.surface === 'desktop' ? $.ui.resolve(e).Client : undefined
      const tint = board.hue
      const guess = e.props.bodyColumns * PX_PER_COLUMN - STRIPE_WIDTH
      const statusAlt = statusRow ? describeStatus(statusRow) : ''
      const statusImage = statusRow ? cachedImage('status', `${Math.floor(guess)} ${statusAlt}`, () => drawStatus(statusRow, guess)) : null
      const sinceAlt = since ? describeItems(since) : ''
      const sinceImage = since ? cachedImage('since', sinceAlt, () => drawSince(since)) : null
      const topAlt = describeTop(board)
      const top = cachedImage('top', `${tint} ${topAlt}`, () => drawTop(board, guess))
      const usageNow = board.usage
      const contextAlt = usageNow ? describeContext(usageNow) : ''
      const context = usageNow ? cachedImage('context', contextAlt, () => drawContext(usageNow, guess - COMPACT_COLUMNS * PX_PER_COLUMN)) : null
      const agentsAlt = describeAgents(board.agents, board.now)
      const cards = board.agents.length > 0 ? cachedImage('agents', `${Math.floor(guess)} ${agentsAlt}`, () => drawAgents(board.agents, guess, board.now)) : null
      const details = detailsOf(board.git)
      const detailsWidth = Math.max(...details.map(line => line.reduce((sum, token) => sum + token.text.length + 3, 0)))
      const sinceCard = sinceDetails(activityNow, board.agents, board.now)
      const sinceWidth = Math.max(...sinceCard.map(entry => entry.text.length + entry.note.length + 4))
      const rowsHeight = [statusImage, sinceImage, top, context, cards].reduce((sum, image) => sum + (image?.height ?? 0), 0)
      const stripe = drawStripe(tint, rowsHeight)

      // An Svg given no width fills the column Box it is in, so each image is laid out at the band's real width.
      const rows = (
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          {statusImage && <Svg source={statusImage.source} alt={statusAlt} height={statusImage.height} />}
          {sinceImage && (
            <Box key="since" flexDirection="column" width="100%">
              <Svg source={sinceImage.source} alt={sinceAlt} height={sinceImage.height} />
              {sinceCard.length > 0 && (
                <Box position="absolute" top={0} left={0} width={Math.min(e.props.bodyColumns, sinceWidth)} display="none" hover={{ display: 'flex' }} flexDirection="column">
                  {sinceCard.map(entry =>
                    entry.isHeading ? (
                      <Text dimColor bold>
                        {entry.text}
                      </Text>
                    ) : (
                      <Text wrap="truncate-end">
                        <Text color={THEME_KEYS[entry.tone]}>{entry.mark ? `${entry.mark} ` : ''}</Text>
                        <Text>{entry.text}</Text>
                        <Text dimColor>{entry.note ? `  ${entry.note}` : ''}</Text>
                      </Text>
                    ),
                  )}
                </Box>
              )}
            </Box>
          )}
          <Box key="git" flexDirection="column" width="100%">
            <Svg source={top.source} alt={topAlt} height={top.height} />
            <Box position="absolute" top={0} left={0} width={Math.min(e.props.bodyColumns, detailsWidth)} display="none" hover={{ display: 'flex' }} flexDirection="column">
              {details.map((line, index) => (
                <Text wrap="truncate-end">
                  {line.map((token, at) => [
                    at > 0 ? <Text dimColor>{' · '}</Text> : '',
                    <Text color={THEME_KEYS[token.tone]} bold={index === 0}>
                      {token.text}
                    </Text>,
                  ])}
                </Text>
              ))}
            </Box>
          </Box>
          {context && (
            <Box flexDirection="row" alignItems="center" width="100%">
              <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
                <Svg source={context.source} alt={contextAlt} height={context.height} />
              </Box>
              {Client && <Client key="compact" module="./compact-button.tsx" props={{ mode: compactMode }} width={COMPACT_COLUMNS} height={1} />}
            </Box>
          )}
          {cards && <Svg source={cards.source} alt={agentsAlt} height={cards.height} />}
        </Box>
      )

      band = (
        <Box flexDirection="row" width="100%">
          <Svg source={stripe.source} alt={`worktree colour ${tint}`} width={stripe.width} height={stripe.height} />
          {rows}
        </Box>
      )
    }

    return stackBands(band, await next(e))
  })
}
