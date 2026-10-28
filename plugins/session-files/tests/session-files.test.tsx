import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
  baselineOf,
  diffRows,
  firstChangedLine,
  hunksOf,
  newFileDiff,
  parseDiff,
  parseNameStatus,
  parseNumstat,
  parseStatus,
  repoPath,
  touchedChanges,
  treeOf,
  withinLength,
} from '../hooks/changes'
import type { TouchedFile } from '../types'

type TestEngine = Parameters<TestBody>[0]

const PANE = {
  plugin: 'session-files',
  component: 'Pane',
  requestId: 'session-files',
  props: { title: 'Files', isFocused: false, bodyColumns: 46, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const TOP = 'C:/code/my-app'
const HEAD = '9e3f718f7bf74bf607c415db93a811adc9b45d13'
const LATER = '1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d'

const z = (...fields: string[]): string => `${fields.join('\0')}\0`
const tracked = (xy: string, path: string): string => `1 ${xy} N... 100644 100644 100644 aaa bbb ${path}`

// What git answers, as a test changes it: the status and line counts against HEAD, and what was committed since.
type Repo = { head: string; status: string[]; numstat: string[]; committed: string[]; diff: string; files: Record<string, string> }

const repoAt = (status: string[], numstat: string[] = []): Repo => ({ head: HEAD, status, numstat, committed: [], diff: '', files: {} })

function fakeGit(on: On, repo: Repo | null) {
  on('process.run', (_, e) => {
    const args = e.argv.join(' ')
    const answer = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: exitCode === 0 ? '' : 'fatal: not a git repository', isStdoutTruncated: false, isStderrTruncated: false } })

    if (repo === null) {
      return answer('', 128)
    }

    if (args.includes('--show-toplevel')) {
      return answer(`${TOP}\n`)
    }

    if (args.includes('--git-dir')) {
      return answer(`${TOP}/.git\n`)
    }

    if (args.includes(' status ')) {
      return answer(z(`# branch.oid ${repo.head}`, '# branch.head main', ...repo.status))
    }

    if (args.includes('merge-base')) {
      return answer('')
    }

    if (args.includes('--name-status')) {
      return answer(z(...repo.committed))
    }

    if (args.includes('--numstat')) {
      return answer(args.includes(HEAD) ? z('6\t1\tREADME.md') : z(...repo.numstat))
    }

    return answer(/ -U\d+ /.test(args) ? repo.diff : '')
  })
  on('fs.read', (_, e) => {
    const name = e.path.replace(/\\/g, '/').slice(TOP.length + 1)
    const content = repo?.files[name]

    if (content === undefined) {
      throw new Error('ENOENT')
    }

    return { value: content }
  })
}

async function start($: TestEngine, on: On, messages: unknown[] = []) {
  const clock = mock.clock(on)
  const saved = new Map<string, unknown>()
  const opened: string[] = []

  on('session.id', () => ({ value: 'session-1' }))
  on('session.messages', () => ({ value: messages }) as never)
  on('store.get', (_, e) => ({ value: saved.get(e.key) ?? null }))
  on('store.set', (_, e) => {
    saved.set(e.key, e.value)

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    saved.delete(e.key)

    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'files' } }) as never)
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('classic.FileChanged', () => ({}))
  const calls: Record<string, unknown>[] = []
  on('tool.call', (_, e) => {
    calls.push(e as unknown as Record<string, unknown>)

    return { result: {} } as never
  })
  on('turn.complete', () => ({ text: '', reason: 'answer' }) as never)
  await $.session.start({ cwd: TOP, surface: 'desktop', isInteractive: true })
  await clock.settle()

  return { clock, saved, opened, calls }
}

type Drawn = { type?: unknown; props?: Record<string, unknown>; children?: unknown }

function elements(node: unknown, found: Drawn[] = []): Drawn[] {
  if (Array.isArray(node)) {
    node.forEach(child => elements(child, found))
  } else if (node !== null && typeof node === 'object') {
    found.push(node as Drawn)
    elements((node as Drawn).children, found)
  }

  return found
}

async function alts($: TestEngine): Promise<string[]> {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const found = elements(await ui.drawn()).filter(element => element.type === 'Svg').map(element => String(element.props?.alt))
  await ui.unmount()

  return found
}

const edit = (path: string) => ({ tool: 'Edit', file_path: `${TOP}/${path}`, old_string: 'a', new_string: 'b' }) as never

test('git output is read whole: renames, untracked files, binary counts and committed files', () => {
  const status = parseStatus(
    z(`# branch.oid ${HEAD}`, tracked('.M', 'src/a b.ts'), '2 R. N... 100644 100644 100644 e e R100 src/items.ts', 'src/menuItems.ts', tracked('D.', 'src/old.ts'), '? docs/shot.png'),
  )

  expect(status.head).toBe(HEAD)
  expect(status.changes).toEqual([
    { path: 'src/a b.ts', from: null, kind: 'modified' },
    { path: 'src/items.ts', from: 'src/menuItems.ts', kind: 'renamed' },
    { path: 'src/old.ts', from: null, kind: 'deleted' },
    { path: 'docs/shot.png', from: null, kind: 'added' },
  ])

  const counts = parseNumstat(z('84\t21\tsrc/a b.ts', '3\t3\t', 'src/menuItems.ts', 'src/items.ts', '-\t-\tdocs/logo.png'))
  expect(counts.get('src/a b.ts')).toEqual({ plus: 84, minus: 21, isBinary: false })
  expect(counts.get('src/items.ts')).toEqual({ plus: 3, minus: 3, isBinary: false })
  expect(counts.get('docs/logo.png')?.isBinary).toBe(true)

  expect(parseNameStatus(z('M', 'README.md', 'R087', 'a.ts', 'b.ts', 'D', 'gone.ts'))).toEqual([
    { path: 'README.md', from: null, kind: 'modified' },
    { path: 'b.ts', from: 'a.ts', kind: 'renamed' },
    { path: 'gone.ts', from: null, kind: 'deleted' },
  ])

  expect(repoPath('c:\\code\\my-app\\src\\nav.ts', TOP)).toBe('src/nav.ts')
  expect(repoPath('C:/code/other/nav.ts', TOP)).toBeNull()
})

test('a file that already differed when the session began counts only once it changes again or is edited', () => {
  const before = parseStatus(z(`# branch.oid ${HEAD}`, tracked('.M', 'src/old.ts')))
  const start = baselineOf(before, parseNumstat(z('2\t0\tsrc/old.ts')))
  const now = parseStatus(z(`# branch.oid ${HEAD}`, tracked('.M', 'src/old.ts'), tracked('.M', 'src/nav.ts')))
  const counts = parseNumstat(z('2\t0\tsrc/old.ts', '5\t1\tsrc/nav.ts'))

  expect(touchedChanges(start, now, counts, {}).map(change => change.path)).toEqual(['src/nav.ts'])
  expect(touchedChanges(start, now, counts, { 'src/old.ts': 1 }).map(change => change.path)).toEqual(['src/old.ts', 'src/nav.ts'])
  expect(touchedChanges(start, now, parseNumstat(z('9\t0\tsrc/old.ts', '5\t1\tsrc/nav.ts')), {}).map(change => change.path)).toEqual(['src/old.ts', 'src/nav.ts'])
})

test('the tree puts folders first, joins a folder holding only a folder, and counts what changed beneath', () => {
  const file = (path: string, kind: TouchedFile['kind']): TouchedFile => ({ path, from: null, kind, plus: 1, minus: 0, isBinary: false, edits: 0, diff: [], more: 0 })
  const rows = treeOf([file('src/nav/NavBar.tsx', 'modified'), file('src/nav/useBreakpoint.ts', 'added'), file('src/menu/Menu.tsx', 'deleted'), file('README.md', 'committed'), file('apps/web/src/main.ts', 'modified')])

  expect(rows.map(row => (row.type === 'folder' ? `${'  '.repeat(row.depth)}${row.name}/ ${row.count} ${row.kinds.join(',')}` : `${'  '.repeat(row.depth)}${row.file.path}`))).toEqual([
    'apps/web/src/ 1 modified',
    '  apps/web/src/main.ts',
    'src/ 3 added,modified,deleted',
    '  menu/ 1 deleted',
    '    src/menu/Menu.tsx',
    '  nav/ 2 added,modified',
    '    src/nav/NavBar.tsx',
    '    src/nav/useBreakpoint.ts',
    'README.md',
  ])
})

test('a unified diff splits into each file’s first lines, without its headers', () => {
  const diff = [
    'diff --git a/src/nav.ts b/src/nav.ts',
    'index 1111111..2222222 100644',
    '--- a/src/nav.ts',
    '+++ b/src/nav.ts',
    '@@ -1,3 +1,3 @@',
    ' const a = 1',
    '-const b = 2',
    '+const b = 3',
    'diff --git a/gone.ts b/gone.ts',
    'deleted file mode 100644',
    '--- a/gone.ts',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-bye',
    '',
  ].join('\n')
  const snippets = parseDiff(diff)

  expect(snippets.get('src/nav.ts')?.diff).toEqual(['@@ -1,3 +1,3 @@', ' const a = 1', '-const b = 2', '+const b = 3'])
  expect(snippets.get('gone.ts')?.diff).toEqual(['@@ -1 +0,0 @@', '-bye'])
})

test('the pane shows what the session changed, not what already differed, and opens itself in a repository', async ($, on) => {
  const repo = repoAt([tracked('.M', 'src/old.ts')], ['2\t0\tsrc/old.ts'])
  fakeGit(on, repo)
  const { clock, opened, saved } = await start($, on)

  expect(opened).toEqual(['session-files'])
  expect(await alts($)).toContain('No files changed yet.')

  repo.status = [tracked('.M', 'src/old.ts'), tracked('.M', 'src/nav/NavBar.tsx'), tracked('D.', 'src/menu/MenuOld.tsx'), '2 R. N... 100644 100644 100644 e e R100 src/menu/items.ts', 'src/menu/menuItems.ts', '? src/nav/useBreakpoint.ts']
  repo.numstat = ['2\t0\tsrc/old.ts', '84\t21\tsrc/nav/NavBar.tsx', '0\t137\tsrc/menu/MenuOld.tsx', '3\t3\t', 'src/menu/menuItems.ts', 'src/menu/items.ts']
  repo.files = { 'src/nav/useBreakpoint.ts': 'export const a = 1\nexport const b = 2\n' }
  await $.tool.call(edit('src/nav/NavBar.tsx'))
  await clock.advance(500)

  const shown = await alts($)
  expect(shown).toContain('changed src/nav/NavBar.tsx +84 −21')
  expect(shown).toContain('added src/nav/useBreakpoint.ts +2 −0')
  expect(shown).toContain('deleted src/menu/MenuOld.tsx +0 −137')
  expect(shown).toContain('renamed src/menu/items.ts from src/menu/menuItems.ts +3 −3')
  expect(shown.some(alt => alt.includes('src/old.ts'))).toBe(false)
  expect(shown[0]).toBe('Files this session: 4 files, 1 added, 1 changed, 1 deleted, 1 renamed, +89 −161')
  expect((saved.get('session:session-1') as { edits: Record<string, number> }).edits).toEqual({ 'src/nav/NavBar.tsx': 1 })

  await $.tool.call(edit('src/old.ts'))
  await clock.advance(500)
  expect(await alts($)).toContain('changed src/old.ts +2 −0')
})

test('a file committed during the session stays, marked committed, until it changes again', async ($, on) => {
  const repo = repoAt([])
  fakeGit(on, repo)
  const { clock } = await start($, on)

  repo.head = LATER
  repo.committed = ['M', 'README.md']
  await $.tool.call({ tool: 'Bash', command: 'git commit -am "Docs"' } as never)
  await clock.advance(500)
  expect(await alts($)).toContain('committed README.md +6 −1')

  repo.status = [tracked('.M', 'README.md')]
  repo.numstat = ['1\t0\tREADME.md']
  await $.tool.call(edit('README.md'))
  await clock.advance(500)
  expect(await alts($)).toContain('changed README.md +1 −0')
})

test('hovering a file shows a card with its diff, and the terminal draws the tree as text', async ($, on) => {
  const repo = repoAt([])
  fakeGit(on, repo)
  const { clock } = await start($, on)

  repo.status = [tracked('.M', 'src/nav.ts')]
  repo.numstat = ['1\t1\tsrc/nav.ts']
  repo.diff = ['diff --git a/src/nav.ts b/src/nav.ts', '--- a/src/nav.ts', '+++ b/src/nav.ts', '@@ -1 +1 @@', '-const width = 640', '+const width = useBreakpoint()', ''].join('\n')
  await $.tool.call(edit('src/nav.ts'))
  await clock.advance(500)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const drawn = elements(await ui.drawn())
  const card = drawn.find(element => element.type === 'Svg' && element.props?.alt === 'diff of src/nav.ts')
  const scope = drawn.find(element => element.type === 'Box' && element.props?.key === 'file:src/nav.ts')
  expect(String(card?.props?.source)).toContain('+const width = useBreakpoint()')
  expect(String(card?.props?.source)).toContain('edited once')
  expect(scope).toBeDefined()
  await ui.unmount()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await terminal.find({ type: 'Text', text: /nav\.ts/ }))?.text).toContain('M nav.ts +1 −1')
  await terminal.unmount()
})

test('outside a repository the pane stays closed, and /files says so when opened', async ($, on) => {
  fakeGit(on, null)
  const { opened } = await start($, on)

  expect(opened).toEqual([])
  expect(await alts($)).toContain('Not in a git repository.')

  const reply = await $.command.run({ command: 'files', args: '' } as never)
  expect((reply as { text?: string }).text).toBe('Files pane opened.')
  expect(opened).toEqual(['session-files'])
})

test('a session met partway through takes the files its transcript already edited', async ($, on) => {
  const repo = repoAt([tracked('.M', 'src/nav.ts')], ['4\t0\tsrc/nav.ts'])
  fakeGit(on, repo)
  await start($, on, [{ role: 'assistant', text: '', toolUses: [{ tool_use_id: 't1', tool: 'Edit', input: { file_path: `${TOP}/src/nav.ts` } }] }])

  expect(await alts($)).toContain('changed src/nav.ts +4 −0')
})

test('a click shows the whole file under the tree and a second click hides it; shift shows the app’s diff, ctrl the editor', async ($, on) => {
  const repo = repoAt([])
  fakeGit(on, repo)
  const { clock, calls, opened: panes } = await start($, on)

  repo.status = [tracked('.M', 'src/nav.ts'), tracked('D.', 'src/old.ts')]
  repo.numstat = ['1\t1\tsrc/nav.ts', '0\t3\tsrc/old.ts']
  repo.diff = ['diff --git a/src/nav.ts b/src/nav.ts', '--- a/src/nav.ts', '+++ b/src/nav.ts', '@@ -10,3 +10,3 @@', ' a', ' b', '-c', '+d', ''].join('\n')
  await $.tool.call(edit('src/nav.ts'))
  await clock.advance(500)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const click = async (path: string, held: { shift?: true; ctrl?: true } = {}) => {
    await ui.pointer({ type: 'down', button: 'left', x: 1, y: 0, in: `open:${path}`, ...held })
    await ui.pointer({ type: 'up', button: 'left', x: 1, y: 0, in: `open:${path}`, ...held })
    await clock.advance(10)
  }
  const opened = () =>
    calls
      .filter(call => String(call.tool).startsWith('mcp__ccd_'))
      .map(call => Object.fromEntries(['tool', 'pane', 'path', 'line', 'diff_scope'].filter(key => key in call).map(key => [key, call[key]])))

  const svgs = async () => elements(await ui.drawn()).filter(element => element.type === 'Svg').map(element => ({ alt: String(element.props?.alt), source: String(element.props?.source) }))

  await click('src/nav.ts')
  expect(panes).toEqual(['session-files'])
  const whole = (await svgs()).find(image => image.alt === 'the whole of src/nav.ts')
  expect(whole?.source).toContain('>d</text>')
  expect(whole?.source).toContain("class='f-plusBg'")
  expect(whole?.source).toContain("class='f-minusBg'")
  expect((await svgs()).find(image => image.alt === 'changed src/nav.ts +1 −1')?.source).toContain("class='f-select'")

  await click('src/nav.ts')
  expect((await svgs()).some(image => image.alt === 'the whole of src/nav.ts')).toBe(false)

  await click('src/nav.ts')
  await ui.pointer({ type: 'down', button: 'left', x: 1, y: 0, in: 'close:src/nav.ts' })
  await ui.pointer({ type: 'up', button: 'left', x: 1, y: 0, in: 'close:src/nav.ts' })
  await clock.advance(10)
  expect((await svgs()).some(image => image.alt === 'the whole of src/nav.ts')).toBe(false)

  await click('src/nav.ts', { shift: true })
  await click('src/nav.ts', { ctrl: true })
  await click('src/old.ts', { ctrl: true })
  await ui.unmount()

  expect(opened()).toEqual([
    { tool: 'mcp__ccd_view__show_pane', pane: 'diff', path: `${TOP}/src/nav.ts`, diff_scope: 'uncommitted' },
    { tool: 'mcp__ccd_host__open_in_editor', path: `${TOP}/src/nav.ts`, line: 12 },
    { tool: 'mcp__ccd_view__show_pane', pane: 'diff', path: `${TOP}/src/old.ts`, diff_scope: 'uncommitted' },
  ])
  expect(firstChangedLine(['+export const a = 1'])).toBe(1)
})

test('a whole file reads as hunks a diff drawing takes: headers dropped, control characters gone, cut between hunks', () => {
  const diff = ['diff --git a/a.ts b/a.ts', 'index 1..2 100644', '--- a/a.ts', '+++ b/a.ts', '@@ -1,2 +1,2 @@', ' keep\r', '-old\u001b[0m', '+new', '\\ No newline at end of file', ''].join('\n')

  expect(hunksOf(diff)).toBe(['@@ -1,2 +1,2 @@', ' keep', '-old[0m', '+new'].join('\n'))
  expect(newFileDiff('one\r\ntwo\r\n')).toBe(['@@ -0,0 +1,2 @@', '+one', '+two'].join('\n'))
  expect(newFileDiff('')).toBe('')
  expect(withinLength('@@ a\n+1\n@@ b\n+2', 12)).toBe('@@ a\n+1')
})

test('the shown file numbers its lines as the file has them now, wraps long ones and marks the gap between hunks', () => {
  const rows = diffRows(['@@ -1,2 +1,2 @@', ' keep', '-old', '+a much longer line', '@@ -40,1 +40,1 @@', ' far'].join('\n'), 8)

  expect(rows).toEqual([
    { kind: 'same', number: 1, text: 'keep' },
    { kind: 'removed', number: 2, text: 'old' },
    { kind: 'added', number: 2, text: 'a much ' },
    { kind: 'added', number: null, text: 'longer ' },
    { kind: 'added', number: null, text: 'line' },
    { kind: 'gap', number: null, text: '' },
    { kind: 'same', number: 40, text: 'far' },
  ])
})
test('a big file and many files still fit what one pane drawing holds: the file shows its changes, the cards what room is left', async ($, on) => {
  const repo = repoAt([])
  fakeGit(on, repo)
  const { clock } = await start($, on)
  const lines = Array.from({ length: 1500 }, (_, index) => ` line ${index + 1}: ${'words that fill a line of prose in a long document '.repeat(2)}`)
  lines[750] = '-the old middle line'
  lines.splice(751, 0, '+the new middle line')
  const others = Array.from({ length: 40 }, (_, index) => `src/part${index % 5}/file${index}.ts`)

  repo.status = [tracked('.M', 'docs/big.md'), ...others.map(path => tracked('.M', path))]
  repo.numstat = ['1\t1\tdocs/big.md', ...others.map(path => `3\t1\t${path}`)]
  repo.diff = ['diff --git a/docs/big.md b/docs/big.md', '--- a/docs/big.md', '+++ b/docs/big.md', '@@ -1,1500 +1,1500 @@', ...lines, ''].join('\n')
  await $.tool.call(edit('docs/big.md'))
  await clock.advance(500)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.pointer({ type: 'down', button: 'left', x: 1, y: 0, in: 'open:docs/big.md' })
  await ui.pointer({ type: 'up', button: 'left', x: 1, y: 0, in: 'open:docs/big.md' })
  await clock.advance(10)

  const drawn = await ui.drawn()
  const alts = elements(drawn).filter(element => element.type === 'Svg').map(element => String(element.props?.alt))
  expect(JSON.stringify(drawn).length).toBeLessThan(100_000)
  expect(alts).toContain('the changes of docs/big.md')
  expect(alts.some(alt => alt.startsWith('Too long to show whole here'))).toBe(true)
  const shownFiles = alts.filter(alt => alt.startsWith('changed src/')).length
  expect(shownFiles).toBeGreaterThanOrEqual(25)
  expect(alts).toContain(`and ${40 - shownFiles} more files`)
  await ui.unmount()
})