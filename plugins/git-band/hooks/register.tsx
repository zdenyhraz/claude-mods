import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { GitStatus } from '../types'
import { changedFiles, parseBranch, parseFiles, parseLayout, parseShortstat, repoName, worktreeName } from './git'

const POLL_MS = 10_000
const REFRESHING_TOOLS = /^(Bash|PowerShell|Edit|Write|NotebookEdit|EnterWorktree|ExitWorktree)$/

const status = atom({ plugin: 'git-band', key: 'status' } as const, null)

// Pills are theme colours with white text; Svg is an isolated image that cannot follow the theme, so its stroke is white too.
const PILL_TEXT = '#ffffff'

const icon = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${PILL_TEXT}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

const ICONS = {
  branch: icon('<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>'),
  worktree: icon('<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'),
}

const GLYPHS = { branch: '⎇', worktree: '▣' }

type Chip = { key: string; text: string; color: Color }

async function git($: EngineInterface, args: string[]): Promise<string | null> {
  const result = await $.process.run(['git', '--no-optional-locks', ...args], { timeoutMs: 15_000 }).catch(() => null)

  return result?.exitCode === 0 ? result.stdout : null
}

async function readStatus($: EngineInterface): Promise<GitStatus | null> {
  const layoutText = await git($, ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'])
  const layout = layoutText === null ? null : parseLayout(layoutText)

  if (layout === null) {
    return null
  }

  const [porcelain, shortstat] = await Promise.all([
    git($, ['status', '--porcelain=v2', '--branch']),
    git($, ['diff', 'HEAD', '--shortstat']),
  ])

  if (porcelain === null) {
    return null
  }

  return {
    repo: repoName(layout),
    worktree: worktreeName(layout),
    ...parseBranch(porcelain),
    ...parseFiles(porcelain),
    ...parseShortstat(shortstat ?? ''),
  }
}

let isRefreshing = false
let isQueued = false
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

      if (json !== lastJson) {
        lastJson = json
        await update($, status, () => fresh)
      }
    } while (isQueued)
  } finally {
    isRefreshing = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    void refresh($)
    $.clock.every(POLL_MS, () => void refresh($))

    return result
  })

  // A subagent's hooks read its own directory, which may be another worktree than the session's.
  on('tool.call', { tool: REFRESHING_TOOLS }, async ($, e, next) => {
    const result = await next(e)

    if (e.agentId === undefined) {
      void refresh($)
    }

    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId === undefined) {
      void refresh($)
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const git = await read($, status)

    if (git === null || e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    const drawIcon = (name: keyof typeof ICONS) => {
      if (e.surface === 'terminal') {
        return (
          <Text color={PILL_TEXT} bold>
            {GLYPHS[name]}
          </Text>
        )
      }

      const { Svg } = $.ui.resolve(e)

      return <Svg source={ICONS[name]} alt={name} width={14} height={14} />
    }

    const isLinked = git.worktree !== null

    const sync: Chip[] = []

    if (git.ahead > 0) {
      sync.push({ key: 'ahead', text: `↑${git.ahead}`, color: 'success' })
    }

    if (git.behind > 0) {
      sync.push({ key: 'behind', text: `↓${git.behind}`, color: 'warning' })
    }

    if (git.isDetached) {
      sync.push({ key: 'detached', text: 'detached', color: 'warning' })
    } else if (git.upstream === null) {
      sync.push({ key: 'local', text: 'no upstream', color: 'subtle' })
    }

    const changes: Chip[] = [
      { key: 'conflicted', value: git.conflicted, color: 'error' },
      { key: 'added', value: git.added, color: 'success' },
      { key: 'modified', value: git.modified, color: 'warning' },
      { key: 'deleted', value: git.deleted, color: 'error' },
      { key: 'renamed', value: git.renamed, color: 'suggestion' },
      { key: 'untracked', value: git.untracked, color: 'autoAccept' },
      { key: 'staged', value: git.staged, color: 'permission' },
    ]
      .filter(count => count.value > 0)
      .map(({ key, value, color }) => ({ key, text: `${value} ${key}`, color }))

    if (changedFiles(git) === 0) {
      changes.push({ key: 'clean', text: '✓ clean', color: 'success' })
    }

    const drawChip = (chip: Chip) => (
      <Box key={chip.key} flexShrink={0}>
        <Text color={chip.color} bold weight="bold" wrap="truncate-end">
          {chip.text}
        </Text>
      </Box>
    )

    return (
      <Box flexDirection="row" flexWrap="nowrap" alignItems="center" columnGap="md" overflow="hidden">
        <Box flexDirection="row" alignItems="center" columnGap="xs" paddingX={1} backgroundColor="claude" flexShrink={1}>
          {drawIcon('branch')}
          <Text color={PILL_TEXT} bold weight="bold" wrap="truncate-end">
            {git.branch}
          </Text>
        </Box>
        {sync.map(drawChip)}
        <Box
          flexDirection="row"
          alignItems="center"
          columnGap="xs"
          paddingX={1}
          backgroundColor={isLinked ? 'merged' : 'permission'}
          flexShrink={1}
        >
          {drawIcon('worktree')}
          <Text color={PILL_TEXT} bold weight="bold" wrap="truncate-end">
            {git.worktree ?? git.repo}
          </Text>
          <Text color={PILL_TEXT} wrap="truncate-end">
            {isLinked ? `worktree of ${git.repo}` : 'main checkout'}
          </Text>
        </Box>
        {changes.map(drawChip)}
        {(git.insertions > 0 || git.deletions > 0) && (
          <Box flexDirection="row" columnGap="xs" flexShrink={0}>
            <Text color="success" bold weight="bold" tabular>
              +{git.insertions}
            </Text>
            <Text color="error" bold weight="bold" tabular>
              −{git.deletions}
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
