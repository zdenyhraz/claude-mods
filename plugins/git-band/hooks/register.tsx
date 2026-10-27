import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { GitStatus } from '../types'
import { changedFiles, parseBranch, parseFiles, parseLayout, parseShortstat, repoName, worktreeName } from './git'

const POLL_MS = 10_000
const REFRESHING_TOOLS = /^(Bash|PowerShell|Edit|Write|NotebookEdit|EnterWorktree|ExitWorktree)$/

const status = atom({ plugin: 'git-band', key: 'status' } as const, null)

// Svg is drawn as an isolated image, so it cannot follow the theme: a mid grey reads on light and dark.
const icon = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8b919a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

const ICONS = {
  branch: icon('<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>'),
  worktree: icon('<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'),
}

const GLYPHS = { branch: '⎇', worktree: '▣' }

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
        return <Text dimColor>{GLYPHS[name]}</Text>
      }

      const { Svg } = $.ui.resolve(e)

      return <Svg source={ICONS[name]} alt={name} width={14} height={14} />
    }

    const counts: { value: number; label: string; color: Color }[] = [
      { value: git.conflicted, label: 'conflicted', color: 'error' },
      { value: git.added, label: 'added', color: 'success' },
      { value: git.modified, label: 'modified', color: 'warning' },
      { value: git.deleted, label: 'deleted', color: 'error' },
      { value: git.renamed, label: 'renamed', color: 'suggestion' },
      { value: git.untracked, label: 'untracked', color: 'inactive' },
    ].filter(count => count.value > 0)

    return (
      <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap="md" rowGap="xs">
        <Box flexDirection="row" alignItems="center" columnGap="xs">
          {drawIcon('branch')}
          <Text color="claude" weight="semibold" wrap="truncate-end">
            {git.branch}
          </Text>
          {git.isDetached && <Text dimColor>detached</Text>}
          {git.ahead > 0 && <Text color="success">↑{git.ahead}</Text>}
          {git.behind > 0 && <Text color="warning">↓{git.behind}</Text>}
          {git.upstream === null && !git.isDetached && <Text dimColor>no upstream</Text>}
        </Box>
        <Text dimColor>·</Text>
        <Box flexDirection="row" alignItems="center" columnGap="xs">
          {drawIcon('worktree')}
          {git.worktree === null ? (
            <>
              <Text weight="medium">{git.repo}</Text>
              <Text dimColor>main worktree</Text>
            </>
          ) : (
            <>
              <Text color="merged" weight="medium">
                {git.worktree}
              </Text>
              <Text dimColor>worktree of {git.repo}</Text>
            </>
          )}
        </Box>
        <Text dimColor>·</Text>
        {changedFiles(git) === 0 ? (
          <Box flexDirection="row" columnGap="xs">
            <Text color="success">✓</Text>
            <Text dimColor>clean</Text>
          </Box>
        ) : (
          <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap="sm">
            {counts.map(count => (
              <Box key={count.label} flexDirection="row">
                <Text color={count.color} weight="semibold" tabular>
                  {count.value}
                </Text>
                <Text dimColor> {count.label}</Text>
              </Box>
            ))}
            {git.staged > 0 && <Text dimColor>({git.staged} staged)</Text>}
            {(git.insertions > 0 || git.deletions > 0) && (
              <Box flexDirection="row" columnGap="xs">
                <Text color="success" tabular>
                  +{git.insertions}
                </Text>
                <Text color="error" tabular>
                  −{git.deletions}
                </Text>
                <Text dimColor>lines</Text>
              </Box>
            )}
          </Box>
        )}
      </Box>
    )
  })
}
