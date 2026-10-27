import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

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
  await $.session.start({ cwd: 'C:/code/my-app', surface: 'desktop', isInteractive: true })
  await clock.settle()

  return clock
}

test('a linked worktree with changes shows its branch, worktree and counts, on terminal and desktop', async ($, on) => {
  fakeGit(on, WORKTREE_LAYOUT, DIRTY, ' 6 files changed, 120 insertions(+), 8 deletions(-)\n')
  await start($, on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /^feature-x$/ }))?.text).toBe('feature-x')
    expect((await ui.find({ type: 'Text', text: /↑/ }))?.text).toBe('↑2')
    expect((await ui.find({ type: 'Text', text: /↓/ }))?.text).toBe('↓1')
    expect((await ui.find({ type: 'Text', text: /worktree of/ }))?.text).toBe('worktree of my-app')

    for (const label of ['conflicted', 'added', 'modified', 'deleted', 'renamed', 'untracked']) {
      expect(await ui.find({ type: 'Text', text: new RegExp(` ${label}$`) })).toBeDefined()
    }

    expect((await ui.find({ type: 'Text', text: /staged/ }))?.text).toBe('(3 staged)')
    expect((await ui.find({ type: 'Text', text: /^\+\d/ }))?.text).toBe('+120')
    expect((await ui.find({ type: 'Text', text: /^−\d/ }))?.text).toBe('−8')
    await ui.unmount()
  }
})

test('a clean main worktree says clean', async ($, on) => {
  fakeGit(on, MAIN_LAYOUT, CLEAN)
  await start($, on)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /main worktree/ }))?.text).toBe('main worktree')
  expect((await ui.find({ type: 'Text', text: /clean/ }))?.text).toBe('clean')
  expect(await ui.find({ type: 'Text', text: /↑|↓/ })).toBeUndefined()
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

test('the band picks up a change on the next poll', async ($, on) => {
  let porcelain = CLEAN
  on('process.run', (_, e) => {
    const args = e.argv.join(' ')
    const stdout = args.includes('rev-parse') ? MAIN_LAYOUT : args.includes('status') ? porcelain : ''

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const clock = await start($, on)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /clean/ })).toBeDefined()

  porcelain = `${CLEAN}\n? fresh.txt`
  await clock.advance(10_000)

  expect(await ui.find({ type: 'Text', text: / untracked$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /clean/ })).toBeUndefined()
  await ui.unmount()
})
