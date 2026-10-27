import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { describe, drawAgents, drawContext, drawTop, groupsOf, sliceTones } from '../hooks/look'

type TestEngine = Parameters<TestBody>[0]

const BAND = {
  plugin: 'git-band',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const WORKTREE_LAYOUT = 'C:/code/my-app/.claude/worktrees/feature-x\nC:/code/my-app/.git/worktrees/feature-x\nC:/code/my-app/.git\n'
const MAIN_LAYOUT = 'C:/code/my-app\nC:/code/my-app/.git\nC:/code/my-app/.git\n'

const DIRTY = [
  '# branch.oid 9e3f718f7bf74bf607c415db93a811adc9b45d13',
  '# branch.head feature-x',
  '# branch.upstream origin/feature-x',
  '# branch.ab +2 -1',
  '1 .M N... 100644 100644 100644 aaa aaa src/a.cpp',
  '1 M. N... 100644 100644 100644 aaa bbb src/b.cpp',
  '1 A. N... 000000 100644 100644 000 ccc src/new.cpp',
  '1 .D N... 100644 100644 000000 ddd ddd src/gone.cpp',
  '2 R. N... 100644 100644 100644 eee eee R100 src/moved.cpp\tsrc/old.cpp',
  'u UU N... 100644 100644 100644 100644 f g h src/clash.cpp',
  '? notes.txt',
  '? scratch.md',
].join('\n')

const CLEAN = ['# branch.oid 9e3f718f7bf74bf607c415db93a811adc9b45d13', '# branch.head main', '# branch.upstream origin/main', '# branch.ab +0 -0'].join('\n')

function fakeGit(on: On, layout: string | null, porcelain: string, shortstat = '') {
  on('process.run', (_, e) => {
    const args = e.argv.join(' ')
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

    if (args.includes('rev-parse')) {
      return layout === null
        ? { value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository', isStdoutTruncated: false, isStderrTruncated: false } }
        : ok(layout)
    }

    return ok(args.includes('status') ? porcelain : shortstat)
  })
}

async function start($: TestEngine, on: On) {
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('classic.FileChanged', () => ({}))
  await $.session.start({ cwd: 'C:/code/my-app', surface: 'desktop', isInteractive: true })
  await clock.settle()

  return clock
}

type Drawing = { drawn: () => Promise<unknown> }

// The desktop band is an image per row, each alt naming what it draws; the terminal band is text.
async function shown(ui: Drawing): Promise<string> {
  const alts: string[] = []
  const texts: string[] = []
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      texts.push(node)
    } else if (Array.isArray(node)) {
      node.forEach(walk)
    } else if (node !== null && typeof node === 'object') {
      const element = node as { type?: unknown; props?: Record<string, unknown>; children?: unknown }

      if (element.type === 'Svg' && typeof element.props?.alt === 'string') {
        alts.push(element.props.alt)
      }

      walk(element.children)
    }
  }

  walk(await ui.drawn())

  return alts.length > 0 ? alts.join(' · ') : texts.join('')
}

test('a linked worktree with changes shows its branch, worktree and counts, on terminal and desktop', async ($, on) => {
  fakeGit(on, WORKTREE_LAYOUT, DIRTY, ' 6 files changed, 120 insertions(+), 8 deletions(-)\n')
  await start($, on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const text = await shown(ui)

    for (const part of ['my-app', 'feature-x', '↑2', '↓1', '!1', '+1', '~2', '−1', '→1', '?2', '●3', '+120', '−8']) {
      expect(text).toContain(part)
    }

    expect(text).not.toContain('clean')
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await shown(ui)).toBe('repo my-app · worktree feature-x · branch feature-x ↑2 ↓1 · changes !1 +1 ~2 −1 →1 ?2 ●3 +120 −8')
  await ui.unmount()
})

test('a clean main worktree shows the repo, branch and clean, with no worktree group', async ($, on) => {
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  await start($, on)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await shown(ui)).toBe('repo my-app · branch main · changes ✓ clean')
  await ui.unmount()
})

test('outside a repository the band is left to the engine', async ($, on) => {
  fakeGit(on, null, '')
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  await start($, on)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test("nothing refreshes on a timer, and a change to git's files does", async ($, on) => {
  let porcelain = CLEAN
  on('process.run', (_, e) => {
    const args = e.argv.join(' ')
    const stdout = args.includes('rev-parse') ? MAIN_LAYOUT : args.includes('status') ? porcelain : ''

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const clock = await start($, on)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await shown(ui)).toContain('clean')

  porcelain = `${CLEAN}\n? fresh.txt`
  await clock.advance(120_000)
  expect(await shown(ui)).toContain('clean')

  await $.classic.FileChanged({ file_path: 'C:/code/my-app/.git/index', event: 'change' })
  await clock.advance(500)

  expect(await shown(ui)).toContain('?1')
  expect(await shown(ui)).not.toContain('clean')
  await ui.unmount()
})

const FEATURE = CLEAN.replace('# branch.head main', '# branch.head feature-x').replace('origin/main', 'origin/feature-x')

function fakeWorld(on: On) {
  const world = { layout: MAIN_LAYOUT, porcelain: CLEAN }
  on('process.run', (_, e) => {
    const args = e.argv.join(' ')
    const stdout = args.includes('rev-parse') ? world.layout : args.includes('status') ? world.porcelain : ''

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('tool.call', (_, e) => {
    if (e.tool === 'EnterWorktree') {
      world.layout = WORKTREE_LAYOUT
      world.porcelain = FEATURE
    } else if (e.tool === 'ExitWorktree') {
      world.layout = MAIN_LAYOUT
      world.porcelain = CLEAN
    }

    return { result: {} }
  })

  return world
}

test("a subagent's tool calls leave the band to the session", async ($, on) => {
  const world = fakeWorld(on)
  const clock = await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  world.porcelain = `${CLEAN}\n? from-subagent.txt`
  await $.tool.call({ tool: 'Bash', command: 'touch from-subagent.txt', agentId: 'a1' })
  await clock.advance(500)
  expect(await shown(ui)).toContain('clean')

  await $.tool.call({ tool: 'Bash', command: 'git status' })
  await clock.advance(500)
  expect(await shown(ui)).toContain('?1')
  await ui.unmount()
})

test('entering and leaving a worktree updates the band at once', async ($, on) => {
  fakeWorld(on)
  const clock = await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await shown(ui)).not.toContain('worktree')

  await $.tool.call({ tool: 'EnterWorktree', name: 'feature-x' })
  await clock.advance(500)
  expect(await shown(ui)).toContain('worktree feature-x · branch feature-x')

  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })
  await clock.advance(500)
  expect(await shown(ui)).toBe('repo my-app · branch main · changes ✓ clean')
  await ui.unmount()
})

test('a git command that fails keeps the band as it last was', async ($, on) => {
  const world = { fails: false }
  on('process.run', (_, e) => {
    const args = e.argv.join(' ')

    if (world.fails && args.includes('status')) {
      return { value: { exitCode: 128, stdout: '', stderr: 'fatal: unable to read index', isStdoutTruncated: false, isStderrTruncated: false } }
    }

    const stdout = args.includes('rev-parse') ? MAIN_LAYOUT : args.includes('status') ? CLEAN : ''

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const clock = await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  world.fails = true
  await $.classic.FileChanged({ file_path: 'C:/code/my-app/.git/index', event: 'change' })
  await clock.advance(500)

  expect(await shown(ui)).toBe('repo my-app · branch main · changes ✓ clean')
  await ui.unmount()
})

test('a survey shows below the band instead of hiding it', async ($, on) => {
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>How is Claude doing?</Text>
  })
  await start($, on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: { ...BAND.props, hasSurvey: true } })

    expect(await shown(ui)).toContain('main')
    expect(await ui.find({ type: 'Text', text: /Claude doing/ })).toBeDefined()
    await ui.unmount()
  }
})

test('starting or reloading asks for the band to be drawn again', async ($, on) => {
  const asked: string[] = []
  on('ui.invalidate', (_, e) => {
    asked.push(e.event)

    return { value: undefined }
  })
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  await start($, on)

  expect(asked.filter(event => event === 'ui.render').length).toBe(2)
})

test("the session watches git's own files for changes made outside it", async ($, on) => {
  fakeGit(on, WORKTREE_LAYOUT, DIRTY)
  on('classic.SessionStart', () => ({}))
  await start($, on)

  const result = await $.classic.SessionStart({ source: 'startup' })

  expect(result.watchPaths).toEqual([
    'C:/code/my-app/.git/worktrees/feature-x/HEAD',
    'C:/code/my-app/.git/worktrees/feature-x/index',
    'C:/code/my-app/.git/worktrees/feature-x/logs/HEAD',
    'C:/code/my-app/.git/FETCH_HEAD',
  ])
})

const SMALL_REPO = {
  repo: 'a<b>&c',
  branch: 'main',
  isDetached: false,
  worktree: null,
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  staged: 0,
  added: 0,
  modified: 1,
  deleted: 0,
  renamed: 0,
  untracked: 0,
  conflicted: 0,
  insertions: 3,
  deletions: 1,
}

test('the top row is one line, follows the theme and escapes names', () => {
  const image = drawTop({ git: SMALL_REPO, usage: null, agents: [], now: 0 }, 720)

  expect(describe(groupsOf(SMALL_REPO))).toBe('repo a<b>&c · branch main · changes ~1 +3 −1')
  expect(image.source).toContain('a&lt;b&gt;&amp;c')
  expect(image.source).toContain('@media (prefers-color-scheme: light)')
  expect(image.source).not.toContain('<rect')
  expect(image.height).toBe(22)
})

test('the context row and the agent cards are images of their own', () => {
  const usage = { tokens: 84_000, window: 200_000, percent: 42, slices: [{ name: 'Messages', tokens: 53_400, color: 'autoAccept' }], limits: [] }
  const running = { id: 'a1', name: 'Explore auth flow', type: 'Explore', status: 'running', startedAt: 0, tools: 14 }
  const context = drawContext(usage, 690)
  const cards = drawAgents([running], 720, 72_000)

  expect(context.source).toContain('42%')
  expect(context.width).toBe(690)
  expect(context.height).toBe(4 + 22 + 4)
  expect(cards.source).toContain('Explore auth flow')
  expect(cards.source).toContain('1m 12s')
  expect(cards.source).toContain('class="s-sky"')
  expect(cards.height).toBe(8 + 56)
})

test('a narrower band keeps the text size: the bar shrinks, the branch shortens and cards wrap', () => {
  const usage = {
    tokens: 84_000,
    window: 200_000,
    percent: 42,
    slices: [{ name: 'Messages', tokens: 53_400, color: 'autoAccept' }],
    limits: [{ kind: 'five_hour', percent: 31 }, { kind: 'seven_day', percent: 18 }],
  }
  const agents = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: `Task ${id}`, type: 'Explore', status: 'running', startedAt: 0, tools: 1 }))
  const git = { ...SMALL_REPO, repo: 'my-app', branch: 'zdenyhraz/long-feature-branch' }
  const board = { git, usage, agents, now: 0 }
  const barWidth = (source: string): number => Number(/<rect class="f-free" x="21" y="[\d.]+" width="([\d.]+)"/.exec(source)?.[1])
  const fontSizes = (source: string): string[] => source.match(/font-size:[\d.]+px/g) ?? []

  expect(drawTop(board, 900).width).toBe(900)
  expect(drawTop(board, 420).width).toBe(420)
  expect(fontSizes(drawTop(board, 420).source)).toEqual(fontSizes(drawTop(board, 900).source))
  expect(barWidth(drawContext(usage, 420).source)).toBeLessThan(barWidth(drawContext(usage, 900).source) - 400)
  expect(drawTop(board, 900).source).toContain('long-feature-branch')
  expect(drawTop(board, 420).source).not.toContain('long-feature-branch')
  expect(drawAgents(agents, 900, 0).height).toBe(8 + 56)
  expect(drawAgents(agents, 420, 0).height).toBe(8 + 56 + 6 + 56)
})

function fakeUsage(on: On) {
  const context = { tokens: 84_000, window: 200_000, percent: 42 }
  const categories = [
    { name: 'System prompt', tokens: 3_100, color: 'promptBorder', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 53_400, color: 'autoAccept', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 116_000, color: 'promptBorder', isDeferred: false, kind: 'free' },
  ]
  on('session.usage', () => ({ value: { startedAt: 0, context: { ...context, breakdown: { categories } }, rateLimits: [] } }) as never)

  return context
}

test('context and the session and weekly limits come from each measurement', async ($, on) => {
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  const context = fakeUsage(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  const clock = await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await $.session.measure({
    context,
    rateLimits: [
      { kind: 'five_hour', percentUsed: 31 },
      { kind: 'seven_day', percentUsed: 18 },
    ],
    changed: ['context'],
  } as never)
  await clock.settle()

  expect(await shown(ui)).toBe('repo my-app · branch main · changes ✓ clean · 5h 31% · week 18% · context 42%')
  await ui.unmount()
})

test('subagents show while they run, count their tools, stop the clock when done and leave on the next prompt', async ($, on) => {
  const world = { status: 'running' }
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  on('agent.list', () => ({ value: [{ id: 'a1', description: 'Explore auth flow', type: 'Explore', status: world.status }] }) as never)
  on('tool.call', () => ({ result: {} }))
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  const clock = await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await shown(ui)).toContain('agent running Explore auth flow 0s 0 tools')

  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1' })
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1' })
  await clock.advance(5_000)
  expect(await shown(ui)).toContain('agent running Explore auth flow 5s 2 tools')

  world.status = 'completed'
  await clock.advance(5_000)
  expect(await shown(ui)).toContain('agent done Explore auth flow 10s 2 tools')

  await clock.advance(30_000)
  expect(await shown(ui)).toContain('agent done Explore auth flow 10s 2 tools')

  await $.prompt.submit({ text: 'next' } as never)
  await clock.settle()
  expect(await shown(ui)).not.toContain('agent')
  await ui.unmount()
})

test('every context slice gets a hue of its own, even where /context gives greys', () => {
  const tones = sliceTones([
    { name: 'System prompt', tokens: 3_100, color: 'promptBorder' },
    { name: 'System tools', tokens: 14_200, color: 'inactive' },
    { name: 'Memory files', tokens: 2_400, color: 'warning' },
    { name: 'Messages', tokens: 53_400, color: 'unknownKey' },
  ])

  expect(new Set(tones).size).toBe(4)
  expect(tones).not.toContain('gray')
  expect(tones[2]).toBe('warning')
})

test('each plan limit is a ring with its window named inside and its percentage beside it', () => {
  const usage = { tokens: 1, window: 200_000, percent: 0, slices: [], limits: [{ kind: 'five_hour', percent: 72 }, { kind: 'seven_day', percent: 5 }] }
  const image = drawTop({ git: SMALL_REPO, usage, agents: [], now: 0 }, 720)

  expect(image.source).toContain('>5h</text>')
  expect(image.source).toContain('>wk</text>')
  expect(image.source).toMatch(/<circle class="s-warning"[^>]*stroke-dasharray/)
  expect(image.source).toMatch(/<circle class="s-success"[^>]*stroke-dasharray/)
  expect(image.source).toContain('>72%</text>')
  expect(image.source).not.toContain('>week</text>')
})

test('the yellow compact control beside the context row compacts the conversation', async ($, on) => {
  let compactions = 0
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  fakeUsage(on)
  on('session.compact', () => {
    compactions += 1

    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] } as never
  })
  on('ui.toast', () => ({ value: undefined }) as never)
  await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await ui.find({ type: 'Client', key: 'compact' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /compact/, in: 'compact' }))?.props.color).toBe('warning')
  expect((await ui.find({ type: 'Text', text: /compact/, in: 'compact' }))?.props.inverse).toBe(false)

  await ui.pointer({ type: 'enter', x: 1, y: 0, in: 'compact' })
  expect((await ui.find({ type: 'Text', text: /compact/, in: 'compact' }))?.props.inverse).toBe(true)

  await ui.pointer({ type: 'down', button: 'left', x: 1, y: 0, in: 'compact' })
  await ui.pointer({ type: 'up', button: 'left', x: 1, y: 0, in: 'compact' })
  expect(compactions).toBe(1)

  await ui.pointer({ type: 'leave', x: 4, y: 0, in: 'compact' })
  expect((await ui.find({ type: 'Text', text: /compact/, in: 'compact' }))?.props.inverse).toBe(false)
  await ui.unmount()
})

test('a click while a turn runs compacts once the turn ends', async ($, on) => {
  let compactions = 0
  const toasts: string[] = []
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  fakeUsage(on)
  on('session.compact', () => {
    compactions += 1

    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] } as never
  })
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text?: unknown }).text ?? e))

    return { value: undefined } as never
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '', reason: 'answer' }) as never)
  const clock = await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await $.turn.start({ text: 'work', turnId: 't1' })
  await ui.post({ action: 'compact' }, { in: 'compact' })
  expect(compactions).toBe(0)
  expect(toasts.join(' ')).toContain('when this turn ends')

  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 1000, isAborted: false, reason: 'answer' } as never)
  await clock.advance(500)
  expect(compactions).toBe(1)
  await ui.unmount()
})
