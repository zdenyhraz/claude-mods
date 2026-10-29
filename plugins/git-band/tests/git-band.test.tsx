import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { ago, describe, drawAgents, drawContext, drawPlan, drawState, drawStatus, drawTop, groupsOf, sessionHue, shorten, sliceTones, statusOf, stepOf } from '../hooks/look'
import { applyPlanUpdate, commandDir, describeTool, isOwnPrompt, isTestCommand, lastPrompt, pickHue, promptText, withHue } from '../hooks/session'
import { isOwnBase, parseDivergence } from '../hooks/git'

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

function fakeGit(on: On, layout: string | null, porcelain: string, shortstat = '', divergence: string | null = null) {
  on('process.run', (_, e) => {
    const args = e.argv.join(' ')
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    const fail = { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }

    if (args.includes('log -1')) {
      return ok('abc1234\tFix the nav\n')
    }

    if (args.includes('symbolic-ref')) {
      return divergence === null ? fail : ok('origin/main\n')
    }

    if (args.includes('rev-list')) {
      return divergence === null ? fail : ok(divergence)
    }

    if (args.includes('--verify')) {
      return fail
    }

    if (args.includes('rev-parse')) {
      return layout === null
        ? { value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository', isStdoutTruncated: false, isStderrTruncated: false } }
        : ok(layout)
    }

    return ok(args.includes('status') ? porcelain : shortstat)
  })
}

// Unless a test draws something beneath the plugin itself, the engine draws nothing there.
async function start($: TestEngine, on: On, drawsBeneath = false) {
  const clock = mock.clock(on)

  if (!drawsBeneath) {
    on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))
  }

  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: 'C:/code/my-app', surface: 'desktop', isInteractive: true })
  await clock.settle()

  return clock
}

type Drawing = { drawn: () => Promise<unknown> }

type Drawn = { type?: unknown; props?: Record<string, unknown>; hover?: unknown; children?: unknown }

function findElement(node: unknown, matches: (element: Drawn) => boolean): Drawn | undefined {
  if (Array.isArray(node)) {
    return node.map(child => findElement(child, matches)).find(Boolean)
  }

  if (node === null || typeof node !== 'object') {
    return undefined
  }

  const element = node as Drawn

  return matches(element) ? element : findElement(element.children, matches)
}

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

      if (element.type === 'Svg' && typeof element.props?.alt === 'string' && !element.props.alt.startsWith('worktree colour')) {
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
  expect(await shown(ui)).toBe('repo my-app · worktree feature-x · branch ↑2 ↓1 · changes !1 +1 ~2 −1 →1 ?2 ●3 +120 −8')
  await ui.unmount()
})

test('a clean main worktree shows the repo, branch and clean, with no worktree group', async ($, on) => {
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  await start($, on)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await shown(ui)).toBe('repo my-app · branch main · branch up to date · changes ✓ clean')
  await ui.unmount()
})

test('outside a repository the band is left to the engine', async ($, on) => {
  fakeGit(on, null, '')
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  await start($, on, true)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test("nothing refreshes on a timer, and the end of a turn catches changes made outside the session", async ($, on) => {
  let porcelain = CLEAN
  on('process.run', (_, e) => {
    const args = e.argv.join(' ')
    const stdout = args.includes('rev-parse') ? MAIN_LAYOUT : args.includes('status') ? porcelain : ''

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('turn.complete', () => ({ text: '', reason: 'answer' }) as never)
  const clock = await start($, on)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await shown(ui)).toContain('clean')

  porcelain = `${CLEAN}\n? fresh.txt`
  await clock.advance(120_000)
  expect(await shown(ui)).toContain('clean')

  await $.turn.complete(ended('t1'))
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
  expect(await shown(ui)).toContain('worktree feature-x · branch up to date')

  await $.tool.call({ tool: 'ExitWorktree', action: 'keep' })
  await clock.advance(500)
  expect(await shown(ui)).toBe('repo my-app · branch main · branch up to date · changes ✓ clean')
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
  on('turn.complete', () => ({ text: '', reason: 'answer' }) as never)
  const clock = await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  world.fails = true
  await $.turn.complete(ended('t1'))
  await clock.advance(500)

  expect(await shown(ui)).toBe('Done just now · repo my-app · branch main · branch up to date · changes ✓ clean')
  await ui.unmount()
})

test("another mod's band stays below this one, in one column of bands", async ($, on) => {
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box key="bands" flexDirection="column">
        <Box key="band:other" flexDirection="column">
          <Text>other band</Text>
        </Box>
      </Box>
    )
  })
  await start($, on, true)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const root = (await ui.drawn()) as { props?: { key?: string }; children?: { props?: { key?: string } }[] }

  expect(root.props?.key).toBe('bands')
  expect(root.children?.map(child => child.props?.key)).toEqual(['band:git-band', 'band:other'])
  expect(await ui.find({ type: 'Text', text: /other band/ })).toBeDefined()
  await ui.unmount()
})

test('a survey shows below the band instead of hiding it', async ($, on) => {
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>How is Claude doing?</Text>
  })
  await start($, on, true)

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
  expect(image.source).not.toContain('<rect class=')
  expect(image.height).toBe(22)
})

test('the context row and the agent cards are images of their own', () => {
  const usage = { tokens: 84_000, window: 200_000, percent: 42, slices: [{ name: 'Messages', tokens: 53_400, color: 'autoAccept' }], limits: [] }
  const running = { id: 'a1', name: 'Explore auth flow', type: 'Explore', status: 'running', startedAt: 0, tools: 14 }
  const context = drawContext(usage, 690)
  const cards = drawAgents([running], 720, 72_000)

  expect(context.source).toContain('42%')
  expect(context.source).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="30">')
  expect(context.height).toBe(4 + 22 + 4)
  expect(cards.source).toContain('Explore auth flow')
  expect(cards.source).toContain('1m 12s')
  expect(cards.source).toContain('class="s-sky"')
  expect(cards.height).toBe(8 + 56)
})

test('every image fills the band at any width, never scaled: the bar is a share of it and cards wrap', () => {
  const usage = {
    tokens: 84_000,
    window: 200_000,
    percent: 42,
    slices: [{ name: 'Messages', tokens: 53_400, color: 'autoAccept' }],
    limits: [{ kind: 'five_hour', percent: 31 }, { kind: 'seven_day', percent: 18 }],
  }
  const agents = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: `Task ${id}`, type: 'Explore', status: 'running', startedAt: 0, tools: 1 }))
  const board = { git: { ...SMALL_REPO, repo: 'my-app' }, usage, agents, now: 0 }

  for (const image of [drawTop(board, 900), drawContext(usage, 900), drawAgents(agents, 900, 0)]) {
    expect(image.source).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="100%" height="\d+">/)
    expect(image.source).not.toContain('viewBox')
  }

  expect(drawTop(board, 420).source.match(/font-size:[\d.]+px/g)).toEqual(drawTop(board, 900).source.match(/font-size:[\d.]+px/g))
  expect(drawContext(usage, 900).source).toContain('width:max(0px, calc(100% - ')
  expect(drawContext(usage, 900).source).toContain('<svg x="100%"')
  expect(drawAgents(agents, 900, 0).height).toBe(8 + 56)
  expect(drawAgents(agents, 420, 0).height).toBe(8 + 56 + 6 + 56)
  expect(drawAgents(agents, 900, 0).source).toContain('<svg x="80.000%" y="8" width="20.000%" height="56">')
})

test('a long branch is cut in the middle, keeping both ends', () => {
  const cut = shorten('zdenyhraz/camera-da-structure-caf29d', 16)

  expect(cut).toBe('zdenyhra…-caf29d')
  expect([...cut].length).toBe(16)
  expect(shorten('main', 16)).toBe('main')
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

  expect(await shown(ui)).toBe('repo my-app · branch main · 5h 31% · week 18% · branch up to date · changes ✓ clean · context 42%')
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

test('the yellow compact control beside the context row runs /compact', async ($, on) => {
  const runs: string[] = []
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  fakeUsage(on)
  on('command.run', (_, e) => {
    runs.push(e.command)

    return { text: '' }
  })
  on('ui.toast', () => ({ value: undefined }) as never)
  const clock = await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await ui.find({ type: 'Client', key: 'compact' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /compact/, in: 'compact' }))?.props.color).toBe('warning')
  expect((await ui.find({ type: 'Text', text: /compact/, in: 'compact' }))?.props.inverse).toBe(false)

  await ui.pointer({ type: 'enter', x: 1, y: 0, in: 'compact' })
  expect((await ui.find({ type: 'Text', text: /compact/, in: 'compact' }))?.props.inverse).toBe(true)

  await ui.pointer({ type: 'down', button: 'left', x: 1, y: 0, in: 'compact' })
  await ui.pointer({ type: 'up', button: 'left', x: 1, y: 0, in: 'compact' })
  await clock.advance(10)
  expect(runs).toEqual(['compact'])

  await ui.pointer({ type: 'leave', x: 4, y: 0, in: 'compact' })
  expect((await ui.find({ type: 'Text', text: /compact/, in: 'compact' }))?.props.inverse).toBe(false)
  await ui.unmount()
})

test('a click while a turn runs shows the compaction queued until the turn ends', async ($, on) => {
  const runs: string[] = []
  const toasts: string[] = []
  let finish = (): void => undefined
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  fakeUsage(on)
  // The engine holds a command run mid-turn until the session is idle.
  on('command.run', (_, e) => {
    runs.push(e.command)

    return new Promise(resolve => {
      finish = () => resolve({ text: '' })
    })
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
  await clock.advance(10)
  expect(runs).toEqual(['compact'])
  expect(toasts.join(' ')).toContain('when this turn ends')
  expect((await ui.find({ type: 'Text', text: /compact/, in: 'compact' }))?.props.dimColor).toBe(true)

  await ui.post({ action: 'compact' }, { in: 'compact' })
  await clock.advance(10)
  expect(runs).toEqual(['compact'])

  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 1000, isAborted: false, reason: 'answer' } as never)
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /compact/, in: 'compact' })).toBeUndefined()

  finish()
  await clock.settle()
  expect((await ui.find({ type: 'Text', text: /compact/, in: 'compact' }))?.props.dimColor).toBe(false)
  await ui.unmount()
})

test('hovering the git row shows its names whole, the upstream and the changes in words', async ($, on) => {
  const long = DIRTY.replace('# branch.head feature-x', '# branch.head zdenyhraz/camera-da-structure-caf29d-and-then-some-more')
  fakeGit(on, WORKTREE_LAYOUT, long, ' 6 files changed, 120 insertions(+), 8 deletions(-)\n')
  await start($, on)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const card = findElement(await ui.drawn(), element => element.type === 'Box' && element.props?.position === 'absolute' && element.props?.display === 'none')
  const has = async (whole: string) => (await ui.find({ type: 'Text', text: new RegExp(`^${whole.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`) })) !== undefined

  expect(card?.props?.display).toBe('none')
  expect(card?.hover).toEqual({ display: 'flex' })

  for (const whole of ['zdenyhraz/camera-da-structure-caf29d-and-then-some-more', 'worktree feature-x', 'origin/feature-x', '2 ahead', '1 behind', '2 modified', '2 untracked', '+120 −8 lines']) {
    expect(await has(whole)).toBe(true)
  }

  expect(await shown(ui)).toContain('branch zdenyhraz/camera-da-…-and-then-some-more ')
  await ui.unmount()
})

test('the git row shows how far the branch has gone from the base branch, and the base itself shows none', async ($, on) => {
  fakeGit(on, WORKTREE_LAYOUT, DIRTY, '', '12\t3\n')
  await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await shown(ui)).toContain('base main ↑3 ↓12')
  expect(await ui.find({ type: 'Text', text: /^against origin\/main$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^12 behind$/ })).toBeDefined()
  expect(isOwnBase('main', 'origin/main')).toBe(true)
  expect(isOwnBase('zdenyhraz/fix-nav', 'origin/main')).toBe(false)
  expect(parseDivergence('origin/main', '0\t0')).toEqual({ name: 'origin/main', ahead: 0, behind: 0 })
  expect(groupsOf({ ...SMALL_REPO, base: { name: 'origin/main', ahead: 0, behind: 0 } }).some(group => group.key === 'base')).toBe(false)
  await ui.unmount()
})

type Layout = { shapes: number[]; limits: string[]; room: number }

// What the top row's media queries show at a band width: the git shapes, the limits' form and the git row's room.
function layoutAt(source: string, width: number): Layout {
  const layout: Layout = { shapes: [], limits: [], room: width }

  for (const block of source.matchAll(/@media ([^{]+)\{((?:[^{}]*\{[^{}]*\})*)\}/g)) {
    const min = Number(/min-width:([\d.]+)px/.exec(block[1] ?? '')?.[1] ?? 0)
    const max = Number(/max-width:([\d.]+)px/.exec(block[1] ?? '')?.[1] ?? Infinity)

    if (width < min || width > max) {
      continue
    }

    const rules = block[2] ?? ''
    layout.shapes.push(...[...rules.matchAll(/\.v(\d+)\{display:inline\}/g)].map(match => Number(match[1])))
    layout.limits.push(...[...rules.matchAll(/\.(l[pr])\{display:inline\}/g)].map(match => match[1] ?? ''))
    const reserve = /#names-room\{width:calc\(100% - ([\d.]+)px\)\}/.exec(rules)?.[1]

    if (reserve !== undefined) {
      layout.room = width - Number(reserve)
    }
  }

  return layout
}

function shapeSource(source: string, shape: number): string {
  return new RegExp(`<g class="v v${shape}"[^>]*>(.*?)</g>(?=<g class="v |</g>)`).exec(source)?.[1] ?? ''
}

test('at every band width one shape of the git row shows, and it never reaches the limits', () => {
  const git = {
    ...SMALL_REPO,
    repo: 'my-app',
    worktree: 'camera-da-structure-caf29d',
    branch: 'zdenyhraz/camera-da-structure-caf29d',
    ahead: 2,
    behind: 1,
    modified: 5,
    untracked: 2,
    staged: 1,
    insertions: 176,
    deletions: 12,
  }
  const usage = { tokens: 1, window: 200_000, percent: 0, slices: [], limits: [{ kind: 'five_hour', percent: 23 }, { kind: 'seven_day', percent: 7 }] }
  const source = drawTop({ git, usage, agents: [], now: 0 }, 900).source
  const ends = (piece: string): number[] =>
    [...piece.matchAll(/<text class="strong f-[a-z]+" x="([\d.]+)" y="15" textLength="(\d+)"/g)].map(match => Number(match[1]) + Number(match[2]))

  for (let width = 200; width <= 1200; width += 7) {
    const layout = layoutAt(source, width)

    expect(layout.shapes.length).toBe(1)
    expect(layout.limits.length).toBe(width < 360 ? 0 : 1)

    if (width >= 300) {
      expect(Math.max(...ends(shapeSource(source, layout.shapes[0] ?? -1)))).toBeLessThanOrEqual(layout.room + 1)
    }
  }

  expect(shapeSource(source, layoutAt(source, 1100).shapes[0] ?? -1)).toContain('>camera-da-structure-caf29d<')
  expect(shapeSource(source, layoutAt(source, 200).shapes[0] ?? -1)).not.toContain('>camera-da-structure-caf29d<')
  expect(drawState(git, 900).source).toContain('>zdenyhraz/…<')
  expect(layoutAt(source, 460).limits).toEqual(['lp'])
  expect(layoutAt(source, 380).limits).toEqual(['lr'])
  expect(source).toContain('>23%</text>')
  expect(source).toContain('>5h</text>')
})

function fakeTools(on: On, failing: RegExp = /^$/) {
  on('tool.call', (_, e) => {
    const command = String((e as { command?: unknown }).command ?? '')

    const output = (e as { run_in_background?: boolean }).run_in_background === true ? { backgroundTaskId: 'bg-1' } : {}

    return (failing.test(command) ? { result: {}, text: 'failed', isError: true } : { result: output }) as never
  })
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '', reason: 'answer' }) as never)
}

const ended = (turnId: string, reason = 'answer') => ({ turnId, answer: 'done', durationMs: 1000, isAborted: reason === 'aborted', reason }) as never

test('your latest prompt shows at the top, and the state follows the turn: working, waiting on a question, done', async ($, on) => {
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  fakeTools(on)
  const clock = await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await $.prompt.submit({ text: 'Make the band fill its width\nand keep the text size' } as never)
  await $.turn.start({ text: 'work', turnId: 't1' })
  await clock.settle()
  expect(await shown(ui)).toContain('Thinking · Make the band fill its width')

  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'Done.', ask: 'Which fix first?' } as never)
  await $.turn.complete(ended('t1'))
  await clock.settle()
  expect(await shown(ui)).toContain('Waiting for you Which fix first? just now · Make the band fill its width')

  await $.prompt.submit({ text: 'Fix the width first' } as never)
  await $.turn.start({ text: 'go', turnId: 't2' })
  await $.turn.complete(ended('t2'))
  await clock.settle()
  expect(await shown(ui)).toContain('Done just now · Fix the width first')

  await clock.advance(5 * 60_000)
  expect(await shown(ui)).toContain('Done 5 m ago')
  await ui.unmount()
})

test('a turn that leaves work running in the background is not done, and a new prompt drops the last plan', async ($, on) => {
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  fakeTools(on)
  const clock = await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const steps = [
    { content: 'Run the tests', status: 'in_progress' },
    { content: 'Fix what fails', status: 'pending' },
  ]

  await $.prompt.submit({ text: 'Run the slow suite' } as never)
  await $.turn.start({ text: 'work', turnId: 't1' })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: steps } as never)
  await $.tool.call({ tool: 'Bash', command: 'python run_test.py', description: 'Slow test suite', run_in_background: true } as never)
  await $.turn.complete(ended('t1'))
  await clock.settle()
  expect(await shown(ui)).toContain('Running in background Slow test suite just now')
  expect(await shown(ui)).toContain('plan step 1 of 2')

  await $.tool.call({ tool: 'TaskStop', task_id: 'bg-1' } as never)
  await clock.settle()
  expect(await shown(ui)).toContain('Done just now')

  await $.prompt.submit({ text: 'Now something else' } as never)
  await clock.settle()
  expect(await shown(ui)).not.toContain('plan step')
  await ui.unmount()
})

test('a stopped turn says so, and only what you wrote counts as your prompt', async ($, on) => {
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  fakeTools(on)
  const clock = await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await $.prompt.submit({ text: '[Image #1]\nlook at the profile first' } as never)
  await $.turn.start({ text: 'work', turnId: 't1' })
  await $.turn.complete(ended('t1', 'aborted'))
  await clock.settle()
  expect(await shown(ui)).toContain('Stopped just now · look at the profile first')

  expect(promptText('<system-reminder>\nnotes\n</system-reminder>\nFix the nav')).toBe('Fix the nav')
  const typed = { origin: { kind: 'composer' } }
  expect(isOwnPrompt(typed)).toBe(true)
  expect(isOwnPrompt({ origin: { kind: 'auto-continuation' } })).toBe(true)
  expect(isOwnPrompt({ origin: { kind: 'sdk' } })).toBe(true)
  expect(isOwnPrompt({ origin: { kind: 'plugin', asUser: true } })).toBe(true)
  expect(isOwnPrompt({ ...typed, command: { name: 'compact' } })).toBe(false)
  expect(isOwnPrompt({ ...typed, isMeta: true })).toBe(false)
  expect(isOwnPrompt({ origin: { kind: 'task-notification' } })).toBe(false)
  expect(isOwnPrompt({ origin: { kind: 'peer' } })).toBe(false)
  expect(isOwnPrompt({ origin: { kind: 'plugin' } })).toBe(false)
  await ui.unmount()
})

test('the plan follows the task list as a bar of its own, and a plan of one step shows none', () => {
  const items = [
    { content: 'Read the code', status: 'in_progress' as const },
    { content: 'Write the fix', status: 'pending' as const },
    { content: 'Run the tests', status: 'pending' as const },
  ]
  const advanced = applyPlanUpdate(applyPlanUpdate([], { items }), { advance: true })
  const step = stepOf(advanced)

  expect(step).toEqual({ position: 2, total: 3, text: 'Write the fix', states: ['completed', 'in_progress', 'pending'], isComplete: false })
  expect(applyPlanUpdate(advanced, { done: [2], start: 3 }).map(each => each.status)).toEqual(['completed', 'completed', 'in_progress'])
  expect(stepOf([{ content: 'Commit and push', status: 'completed' }])).toBeNull()

  const image = drawPlan(step!, 760, true)
  // The step under way is a striped span with its number and words, after the steps done in green; its stripes move while the session works.
  expect(image.source).toContain('>2 · Write the fix</text>')
  expect(image.source).toContain('>2/3</text>')
  expect(image.source).toContain('class="f-success"')
  expect(image.source).toContain('fill="url(#stripes)"')
  expect(image.source).toContain('animateTransform')
  expect(drawPlan(step!, 760, false).source).not.toContain('animateTransform')
  expect(drawStatus(statusOf({ phase: 'working', detail: 'Editing look.ts', at: 0 }, 'Fix the nav', 0), 760).source).not.toContain('2/3')
})

test('tool calls read as what the session is doing, and test commands are recognised', () => {
  expect(describeTool('Bash', { command: 'python run_test.py --build_type Release' })).toBe('Running tests')
  expect(describeTool('Bash', { command: 'npm test' })).toBe('Running tests')
  expect(describeTool('Bash', { command: 'git commit -F msg.txt' })).toBe('Committing')
  expect(describeTool('Edit', { file_path: 'C:/code/my-app/src/nav.ts' })).toBe('Editing nav.ts')
  expect(describeTool('mcp__ccd_turn__update_plan', {})).toBeNull()
  expect(isTestCommand('ls tests')).toBe(false)
  expect(isTestCommand('build/Release/my-app-test --gtest_filter=Nav.*')).toBe(true)
  expect(ago(0)).toBe('just now')
  expect(ago(14 * 60_000)).toBe('14 m ago')
  expect(ago(3 * 3_600_000)).toBe('3 h ago')
})

test('what happened since your prompt sits on the git row, each item with its own hover card', async ($, on) => {
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  fakeTools(on, /fail/)
  const clock = await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await $.prompt.submit({ text: 'Fix the nav' } as never)
  await clock.settle()
  expect(await shown(ui)).toContain('Ready · Fix the nav just now · repo my-app · branch main · branch up to date · changes ✓ clean')

  await $.tool.call({ tool: 'Edit', file_path: 'C:/code/my-app/src/nav.ts', old_string: 'a', new_string: 'b' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'C:/code/my-app/src/nav.ts', old_string: 'b', new_string: 'c' } as never)
  await $.tool.call({ tool: 'Write', file_path: 'C:/code/my-app/src/menu.ts', content: 'x' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "Fix the nav"' } as never)
  await clock.settle()
  expect(await shown(ui)).toContain('changes ✓ clean · this prompt · 2 files · tests ✓ · 1 commit')
  expect(await shown(ui)).not.toContain('Since your prompt')

  const has = async (text: string) => (await ui.find({ type: 'Text', text })) !== undefined
  expect(await has('src/nav.ts')).toBe(true)
  expect(await has('  2 edits')).toBe(true)
  expect(await has('npm test')).toBe(true)

  // Each item has its own card with its own list: the files' card holds no command, the tests' card no file.
  const drawn = await ui.drawn()
  const card = (topic: string) => JSON.stringify(findElement(drawn, element => element.type === 'Box' && element.props?.key === `since:${topic}`) ?? null)
  expect(card('files')).toContain('src/nav.ts')
  expect(card('files')).not.toContain('npm test')
  expect(card('tests')).toContain('npm test')
  expect(card('tests')).not.toContain('git commit')
  expect(card('tests')).not.toContain('src/nav.ts')
  expect(card('commits')).toContain('Fix the nav')
  expect(card('commits')).toContain('abc1234')
  expect(card('commits')).not.toContain('git commit')
  expect(commandDir('cd "D:/Work/app" && git commit -F msg.txt')).toBe('D:/Work/app')
  expect(commandDir('git -C repo commit -m x')).toBe('repo')
  expect(commandDir('git commit -m x')).toBeNull()
  expect(findElement(drawn, element => element.props?.key === 'since:files')?.props?.left).toBeGreaterThan(0)

  await $.tool.call({ tool: 'Bash', command: 'npm test -- fail' } as never)
  await clock.settle()
  expect(await shown(ui)).toContain('tests ✗')

  await clock.advance(14 * 60_000)
  expect(await shown(ui)).toContain('Fix the nav 14 m ago')
  await ui.unmount()
})

test('each worktree has a colour of its own, the same every time, drawn as a stripe down the band', async ($, on) => {
  const named = (worktree: string) => ({ ...SMALL_REPO, worktree })
  const hues = ['fix-nav', 'search-index', 'export-csv', 'perf-tuning', 'dark-theme'].map(name => sessionHue(named(name)))

  expect(sessionHue(named('fix-nav'))).toBe(hues[0])
  expect(new Set(hues).size).toBeGreaterThan(2)
  expect(groupsOf(named('fix-nav')).find(group => group.key === 'worktree')?.icon?.tone).toBe(hues[0])

  fakeGit(on, WORKTREE_LAYOUT, CLEAN)
  await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const stripe = findElement(await ui.drawn(), element => element.type === 'Svg' && String(element.props?.alt).startsWith('worktree colour'))

  expect(stripe?.props?.alt).toBe(`worktree colour ${sessionHue(named('feature-x'))}`)
  expect(stripe?.props?.width).toBe(11)
  expect(stripe?.props?.height).toBe(44)
  await ui.unmount()
})

test('the state leads the status row as a solid chip in its colour', async ($, on) => {
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  fakeTools(on)
  const clock = await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const chip = async (words: string) => {
    const row = findElement(await ui.drawn(), element => element.type === 'Svg' && String(element.props?.alt).startsWith(words))
    const source = String(row?.props?.source)

    return source.includes(`>${words}</text>`) && /class="strong f-ink"/.test(source) ? source.match(/<rect class="f-(\w+)"[^>]*rx="9"\/>/)?.[1] : undefined
  }

  await $.prompt.submit({ text: 'Fix the nav' } as never)
  await clock.settle()
  expect(await chip('Ready')).toBe('gray')

  await $.turn.start({ text: 'work', turnId: 't1' })
  await clock.settle()
  expect(await chip('Thinking')).toBe('sky')

  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'Done.', ask: 'Which index?' } as never)
  await $.turn.complete(ended('t1'))
  await clock.settle()
  expect(await chip('Waiting for you')).toBe('warning')

  await $.turn.start({ text: 'go', turnId: 't2' })
  await $.turn.complete(ended('t2'))
  await clock.settle()
  expect(await chip('Done')).toBe('success')
  await ui.unmount()
})

test('the chip keeps its words whole when the row is cut to fit', () => {
  const row = statusOf({ phase: 'waiting', detail: 'Which of the two search indexes should the band use?', at: 0 }, 'Make the band fill its width at every size', 0)
  const image = drawStatus(row, 300)

  expect(image.source).toContain('>Waiting for you</text>')
  expect(image.source).not.toContain('>Which of the two search indexes should the band use?</text>')
  expect(image.source).toContain('>Which of')
  expect(image.source).not.toContain('>Make the')
})

test('a session loaded mid-way takes your latest prompt from its transcript', async ($, on) => {
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  on('session.id', () => ({ value: 'session-2' }) as never)
  on('session.messages', () =>
    ({
      value: [
        { role: 'user', text: 'This session is being continued from a previous conversation.', toolUses: [] },
        { role: 'user', text: 'Make the band fill its width', toolUses: [] },
        { role: 'assistant', text: 'Done.', toolUses: [] },
        { role: 'user', text: '<system-reminder>notes</system-reminder>\nFix the nav bar on narrow windows\nand test it', toolUses: [] },
        { role: 'assistant', text: 'On it.', toolUses: [] },
        { role: 'user', text: '', toolUses: [], toolResults: [{ ok: true }] },
        { role: 'user', text: '<task-notification>tests passed</task-notification>', toolUses: [] },
        { role: 'user', text: '[SYSTEM NOTIFICATION] a background task ended', toolUses: [] },
      ],
    }) as never,
  )
  await start($, on)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await shown(ui)).toContain('Ready · Fix the nav bar on narrow windows')
  const card = findElement(await ui.drawn(), element => element.type === 'Box' && element.props?.key === 'status')
  const whole = findElement(card?.children, element => element.type === 'Box' && element.props?.position === 'absolute')
  expect(whole?.props?.display).toBe('none')
  expect(whole?.hover).toEqual({ display: 'flex' })
  expect(await ui.find({ type: 'Text', text: /^Your latest prompt$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^and test it$/ })).toBeDefined()
  expect(lastPrompt([{ role: 'user', text: '[Image #1] what is this' }, { role: 'user', text: '/compact' }])).toBe('what is this')
  expect(lastPrompt([{ role: 'user', text: 'This session is being continued from a previous conversation.' }])).toBeNull()
  await ui.unmount()
})

test('worktree colours go round: a new worktree gets the one unused longest, a known one keeps its own', () => {
  const hues = ['violet', 'teal', 'pink'] as const
  let table = {}

  table = withHue(table, 'my-app/fix-nav', pickHue(table, 'my-app/fix-nav', hues), 1)
  table = withHue(table, 'my-app/search', pickHue(table, 'my-app/search', hues), 2)
  table = withHue(table, 'my-app/export', pickHue(table, 'my-app/export', hues), 3)

  expect(new Set(Object.values(table).map(entry => (entry as { hue: string }).hue)).size).toBe(3)
  expect(pickHue(table, 'my-app/search', hues)).toBe('teal')
  expect(pickHue(table, 'my-app/new-one', hues)).toBe('violet')
})

test('a finished plan shows its full bar in green and says it is done', () => {
  const done = [
    { content: 'Write the fix', status: 'completed' as const },
    { content: 'Update the README', status: 'completed' as const },
  ]
  const image = drawPlan(stepOf(done)!, 760, false)

  expect(image.source).toContain('>2/2</text>')
  expect(image.source).toContain('>All 2 steps done</text>')
  expect(image.source).toContain('class="f-success"')
  expect(image.source).not.toContain('Update the README')
})
