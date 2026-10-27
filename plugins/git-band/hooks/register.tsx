import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, ProcessRunResult, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { AgentView, GitStatus, UsageView } from '../types'
import { parseBranch, parseFiles, parseLayout, parseShortstat, repoName, worktreeName } from './git'
import type { Layout } from './git'
import { agentTime, describeDashboard, drawDashboard, groupsOf, isActive, kilo, limitName, limitTone, orderAgents, sliceTones, stateOf } from './look'
import type { Dashboard, Icon, Tone } from './look'

const SETTLE_MS = 300
const TICK_MS = 5_000
// The desktop lays the band out in cells; this is a cell's width in CSS pixels there, so the image can be drawn
// at the band's own width rather than scaled into it.
const PX_PER_COLUMN = 7.6
const REFRESHING_TOOLS = /^(Bash|PowerShell|Edit|Write|NotebookEdit|EnterWorktree|ExitWorktree)$/

const status = atom({ plugin: 'git-band', key: 'status' } as const, null)
const usage = atom({ plugin: 'git-band', key: 'usage' } as const, null)
const agents = atom({ plugin: 'git-band', key: 'agents' } as const, [])

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
  gray: 'inactive',
  free: 'subtle',
  line: 'subtle',
}

const GLYPHS: Partial<Record<Icon, string>> = { repo: '▤', worktree: '⑂', branch: '⎇' }

// The band redraws for reasons of the app's own (a turn starting, a resize); the image is rebuilt only when what it shows changed.
let cached: { key: string; image: ReturnType<typeof drawDashboard> } | null = null

function cachedDashboard(board: Dashboard, columns: number): { image: ReturnType<typeof drawDashboard>; alt: string } {
  const alt = describeDashboard(board)
  const key = `${columns} ${alt}`

  if (cached?.key !== key) {
    cached = { key, image: drawDashboard(board, columns * PX_PER_COLUMN) }
  }

  return { image: cached.image, alt }
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

export const register: Register = on => {
  // A reload keeps the values in $.state but not the band's drawing, which otherwise waits for the next prompt.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
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
    const result = await next(e)

    if (e.agentId !== undefined) {
      void countTool($, e.agentId)
    } else if (REFRESHING_TOOLS.test(e.tool)) {
      scheduleRefresh($)
    }

    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId === undefined) {
      isAwaitingPerson = true
      scheduleRefresh($)
    }

    void syncAgents($)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const gitStatus = await read($, status)

    if (gitStatus === null) {
      return next(e)
    }

    const board: Dashboard = { git: gitStatus, usage: await read($, usage), agents: await read($, agents), now: await $.clock.now() }
    const { Box, Text } = $.ui.resolve(e)
    let band

    // Box borders on the desktop take a whole row above and below; one image keeps the dashboard compact.
    if (e.surface === 'terminal') {
      const word = (content: string, tone: Tone) => (
        <Text color={THEME_KEYS[tone]} bold wrap="truncate-end">
          {content}
        </Text>
      )

      band = (
        <Box flexDirection="column">
          <Box flexDirection="row" columnGap="md" overflow="hidden">
            {groupsOf(board.git).map(group => (
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
              {word(`${kilo(board.usage.tokens)}/${kilo(board.usage.window)}`, 'gray')}
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
      const { image, alt } = cachedDashboard(board, e.props.bodyColumns)
      band = (
        <Box flexDirection="row">
          <Svg source={image.source} alt={alt} width={image.width} height={image.height} />
        </Box>
      )
    }

    if (!e.props.hasSurvey) {
      return band
    }

    const survey = await next(e)

    return (
      <Box flexDirection="column" rowGap="xs">
        {band}
        {survey}
      </Box>
    )
  })
}
