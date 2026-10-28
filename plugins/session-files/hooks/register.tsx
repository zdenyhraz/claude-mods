import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, ProcessRunResult, Register, ToolCallResult } from 'claude-code'

import type { FilesView, Kind, OpenedFile, TouchedFile } from '../types'
import {
  KIND_ORDER,
  addedSnippet,
  baseName,
  baselineOf,
  committedChanges,
  fileOf,
  firstChangedLine,
  hunksOf,
  lineRows,
  nearChanges,
  newFileDiff,
  parseDiff,
  parseNameStatus,
  parseNumstat,
  parseStatus,
  repoPath,
  summaryOf,
  touchedChanges,
  treeOf,
  withinLength,
  wrapRows,
} from './changes'
import type { Baseline, Change, Count, Detail, DiffRow, Row, Snippet, Status } from './changes'
import type { OpenMode } from './file-click'
import {
  KINDS,
  MONO_PX,
  ROW,
  codeGutter,
  describeFile,
  describeSummary,
  drawCard,
  drawDiffRows,
  drawFile,
  drawFolder,
  drawHeader,
  drawLegend,
  drawNote,
  drawOpenedHeader,
} from './look'
import type { Image } from './look'

const PANE = 'session-files'
const PANE_COLUMNS = 46
// An estimate of a cell's width in CSS pixels on the desktop, for where the shown file's lines wrap.
const PX_PER_COLUMN = 7.6
// The most of a file's diff the pane holds; past it, only its changes with a few lines around each.
const MAX_HELD = 500_000
// What the terminal's diff drawing gets of it, the rest of the pane being text too.
const MAX_TERMINAL_HUNKS = 60_000
// The lines kept around each change when a file is too long to show whole: the most that fits, at least the last.
const CONTEXTS = [400, 150, 50, 8]
const NEAR_LINES = 8
// Context wide enough that git's diff holds every line of any file.
const WHOLE_FILE = 1_000_000
const SETTLE_MS = 300
// Files beyond this many keep their kind and place in the tree, without lines or a diff.
const MAX_DETAILED = 120
const MAX_SESSIONS_KEPT = 30
const REFRESHING_TOOLS = /^(Bash|PowerShell|Edit|Write|NotebookEdit|EnterWorktree|ExitWorktree)$/
const EDITING = /^(Edit|Write|NotebookEdit)$/

const view = atom({ plugin: 'session-files', key: 'view' } as const, { isRepo: true, files: null })
const edits = atom({ plugin: 'session-files', key: 'edits' } as const, {})
const openedFile = atom({ plugin: 'session-files', key: 'opened' } as const, null)

// The terminal draws text alone, so each kind maps to the theme key nearest its colour.
const THEME_KEYS: Record<Kind, Color> = { added: 'success', modified: 'warning', deleted: 'error', renamed: 'permission', committed: 'inactive' }

type SessionRecord = { baseline: Baseline; edits: Record<string, number> }

let baseline: Baseline | null = null
let toplevel: string | null = null

async function git($: EngineInterface, args: string[]): Promise<ProcessRunResult | null> {
  return $.process.run(['git', '--no-optional-locks', ...args], { timeoutMs: 15_000 }).catch(() => null)
}

const recordKey = (id: string): string => `session:${id}`

async function sessionId($: EngineInterface): Promise<string | null> {
  return $.session.id().catch(() => null)
}

// Keeps the newest sessions' records, so the store does not grow with every session ever run.
async function saveRecord($: EngineInterface): Promise<void> {
  const id = await sessionId($)

  if (id === null || baseline === null) {
    return
  }

  const record: SessionRecord = { baseline, edits: await read($, edits) }
  const listed = await $.store.get('sessions').catch(() => null)
  const ids = [...(Array.isArray(listed) ? (listed as string[]) : []).filter(other => other !== id), id]

  await $.store.set(recordKey(id), record)
  await $.store.set('sessions', ids.slice(-MAX_SESSIONS_KEPT))
  await Promise.all(ids.slice(0, -MAX_SESSIONS_KEPT).map(old => $.store.delete(recordKey(old)).catch(() => undefined)))
}

function isRecord(value: unknown): value is SessionRecord {
  return value !== null && typeof value === 'object' && 'baseline' in value && 'edits' in value
}

// The files this session's transcript already edited, for a mod loaded partway through a session.
async function editsInTranscript($: EngineInterface, top: string): Promise<Record<string, number>> {
  const counted: Record<string, number> = {}
  const rows = await $.session.messages().catch(() => [])

  for (const use of rows.flatMap(row => row.toolUses)) {
    const path = EDITING.test(use.tool) && use.isError !== true ? editedPath(use.input, top) : null

    if (path !== null) {
      counted[path] = (counted[path] ?? 0) + 1
    }
  }

  return counted
}

function editedPath(args: Record<string, unknown>, top: string): string | null {
  const path = typeof args.file_path === 'string' ? args.file_path : typeof args.notebook_path === 'string' ? args.notebook_path : ''

  return path === '' ? null : repoPath(path, top)
}

// Where the session began, kept across reloads and resumes; a session met for the first time begins now.
async function baselineFor($: EngineInterface, top: string, status: Status, counts: Map<string, Count>): Promise<Baseline> {
  if (baseline !== null) {
    return baseline
  }

  const id = await sessionId($)
  const stored = id === null ? null : await $.store.get(recordKey(id)).catch(() => null)

  if (isRecord(stored)) {
    baseline = stored.baseline
    await update($, edits, known => ({ ...stored.edits, ...known }))

    return baseline
  }

  baseline = baselineOf(status, counts)
  const seen = await editsInTranscript($, top)
  await update($, edits, known => ({ ...seen, ...known }))
  await saveRecord($).catch(() => undefined)

  return baseline
}

async function committedSince($: EngineInterface, top: string, base: string, status: Status): Promise<Change[]> {
  if (base === '' || base === '(initial)' || base === status.head) {
    return []
  }

  // A checkout of another branch is no commit of the session's.
  const isAncestor = await git($, ['-C', top, 'merge-base', '--is-ancestor', base, status.head])

  if (isAncestor?.exitCode !== 0) {
    return []
  }

  const run = await git($, ['-C', top, 'diff', '-M', '--name-status', '-z', base, status.head])

  return run?.exitCode === 0 ? committedChanges(parseNameStatus(run.stdout), status) : []
}

const pathsOf = (changes: Change[]): string[] => changes.flatMap(change => (change.from === null ? [change.path] : [change.path, change.from]))

async function diffSnippets($: EngineInterface, top: string, range: string[], changes: Change[]): Promise<Map<string, Snippet>> {
  if (changes.length === 0) {
    return new Map()
  }

  const run = await git($, ['-C', top, 'diff', ...range, '-M', '-U2', '--no-color', '--no-ext-diff', '--', ...pathsOf(changes)])

  return run?.exitCode === 0 ? parseDiff(run.stdout) : new Map()
}

async function untrackedDetail($: EngineInterface, top: string, path: string): Promise<Detail> {
  const content = await $.fs.read(`${top}/${path}`).catch(() => '\0')
  const added = addedSnippet(content)

  return added === null
    ? { count: { plus: 0, minus: 0, isBinary: true }, snippet: { diff: [], more: 0 } }
    : { count: { plus: added.lines, minus: 0, isBinary: false }, snippet: added }
}

// Lines and the start of the diff: live files against HEAD, committed ones against where the session began.
async function detailsOf($: EngineInterface, top: string, base: string, live: Change[], committed: Change[], counts: Map<string, Count>): Promise<Map<string, Detail>> {
  const shownLive = live.slice(0, MAX_DETAILED)
  const shownCommitted = committed.slice(0, Math.max(0, MAX_DETAILED - shownLive.length))
  const tracked = shownLive.filter(change => counts.has(change.path))
  const untracked = shownLive.filter(change => !counts.has(change.path))
  const committedRange = [base, 'HEAD']
  const [liveDiffs, committedDiffs, committedCounts, fresh] = await Promise.all([
    diffSnippets($, top, ['HEAD'], tracked),
    diffSnippets($, top, committedRange, shownCommitted),
    shownCommitted.length === 0
      ? Promise.resolve(new Map<string, Count>())
      : git($, ['-C', top, 'diff', '-M', '--numstat', '-z', ...committedRange, '--', ...pathsOf(shownCommitted)]).then(run => (run?.exitCode === 0 ? parseNumstat(run.stdout) : new Map<string, Count>())),
    Promise.all(untracked.map(async change => [change.path, await untrackedDetail($, top, change.path)] as const)),
  ])
  const details = new Map<string, Detail>(fresh)
  const none: Snippet = { diff: [], more: 0 }

  for (const change of tracked) {
    const count = counts.get(change.path)

    if (count !== undefined) {
      details.set(change.path, { count, snippet: liveDiffs.get(change.path) ?? none })
    }
  }

  for (const change of shownCommitted) {
    const count = committedCounts.get(change.path)

    if (count !== undefined) {
      details.set(change.path, { count, snippet: committedDiffs.get(change.path) ?? none })
    }
  }

  return details
}

// undefined when git could not answer, so the pane keeps what it last showed.
async function readFiles($: EngineInterface): Promise<FilesView | undefined> {
  const layout = await git($, ['rev-parse', '--path-format=absolute', '--show-toplevel'])

  if (layout === null) {
    return undefined
  }

  if (layout.exitCode !== 0) {
    return /not a git repository/i.test(layout.stderr) ? { isRepo: false, files: [] } : undefined
  }

  const top = layout.stdout.trim()
  toplevel = top
  const [statusRun, numstatRun] = await Promise.all([
    git($, ['-C', top, 'status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all']),
    git($, ['-C', top, 'diff', 'HEAD', '-M', '--numstat', '-z']),
  ])

  if (statusRun?.exitCode !== 0) {
    return undefined
  }

  const status = parseStatus(statusRun.stdout)
  const counts = numstatRun?.exitCode === 0 ? parseNumstat(numstatRun.stdout) : new Map<string, Count>()
  const start = await baselineFor($, top, status, counts)
  const edited = await read($, edits)
  const live = touchedChanges(start, status, counts, edited)
  const committed = await committedSince($, top, start.head, status)
  const details = await detailsOf($, top, start.head, live, committed, counts)
  const files = [
    ...live.map(change => fileOf(change, false, details.get(change.path), edited[change.path] ?? 0)),
    ...committed.map(change => fileOf(change, true, details.get(change.path), edited[change.path] ?? 0)),
  ]

  return { isRepo: true, files }
}

let isRefreshing = false
let isQueued = false
let isScheduled = false
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
      const fresh = await readFiles($)
      const json = JSON.stringify(fresh)

      if (fresh !== undefined && json !== lastJson) {
        lastJson = json
        await update($, view, () => fresh)
        await refreshOpened($, fresh.files ?? []).catch(() => undefined)
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

async function noteEdit($: EngineInterface, args: Record<string, unknown>): Promise<void> {
  const top = toplevel ?? (await git($, ['rev-parse', '--path-format=absolute', '--show-toplevel']))?.stdout.trim() ?? ''
  const path = top === '' ? null : editedPath(args, top)

  if (path !== null) {
    await update($, edits, known => ({ ...known, [path]: (known[path] ?? 0) + 1 }))
    await saveRecord($).catch(() => undefined)
  }
}

const isFailed = (result: ToolCallResult): boolean => ('deny' in result && result.deny !== undefined) || (result as { isError?: boolean }).isError === true

async function gitFilesToWatch($: EngineInterface): Promise<string[]> {
  const run = await git($, ['rev-parse', '--path-format=absolute', '--git-dir'])

  if (run?.exitCode !== 0) {
    return []
  }

  const gitDir = run.stdout.trim()

  return [`${gitDir}/HEAD`, `${gitDir}/index`, `${gitDir}/logs/HEAD`]
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'Files', columns: PANE_COLUMNS })

const isOpenMode = (mode: unknown): mode is OpenMode => mode === 'file' || mode === 'diff' || mode === 'editor'

// A new file's first lines, as many as one drawing holds.
function newFileHunks(content: string): Omit<OpenedFile, 'file'> {
  const whole = newFileDiff(content)

  if (whole.length <= MAX_HELD) {
    return { hunks: whole, note: null }
  }

  const kept: string[] = []
  let size = 0

  for (const line of content.split(/\r?\n/)) {
    size += line.length + 2

    if (size > MAX_HELD) {
      break
    }

    kept.push(line)
  }

  return { hunks: newFileDiff(kept.join('\n')), note: `Too long to show whole: its first ${kept.length} lines.` }
}

// The whole file as hunks, against HEAD or, once committed, against where the session began; a new file git does not
// track yet is read from disk. A file too long to draw whole shows its changes with a few lines around each.
async function hunksFor($: EngineInterface, top: string, file: TouchedFile): Promise<Omit<OpenedFile, 'file'>> {
  if (file.isBinary) {
    return { hunks: '', note: null }
  }

  const range = file.kind === 'committed' ? [baseline?.head ?? 'HEAD', 'HEAD'] : ['HEAD']
  const paths = file.from === null ? [file.path] : [file.path, file.from]
  const diff = async (context: number) => {
    const run = await git($, ['-C', top, 'diff', ...range, '-M', `-U${context}`, '--no-color', '--no-ext-diff', '--', ...paths])

    return run?.exitCode === 0 ? hunksOf(run.stdout) : ''
  }
  const whole = await diff(WHOLE_FILE)

  if (whole === '' && file.kind === 'added') {
    return newFileHunks(await $.fs.read(`${top}/${file.path}`).catch(() => ''))
  }

  if (whole.length <= MAX_HELD) {
    return { hunks: whole, note: null }
  }

  return { hunks: withinLength(await diff(NEAR_LINES), MAX_HELD), note: `Too long to show whole: its changes, with ${NEAR_LINES} lines around each.` }
}

// Keeps the opened file as it is now, while the session goes on changing it.
async function refreshOpened($: EngineInterface, files: readonly TouchedFile[]): Promise<void> {
  const shown = await read($, openedFile)
  const file = shown === null ? undefined : files.find(one => one.path === shown.file.path)

  if (file === undefined || toplevel === null || JSON.stringify(file) === JSON.stringify(shown?.file)) {
    return
  }

  const content = await hunksFor($, toplevel, file)
  await update($, openedFile, () => ({ file, ...content }))
}

// A click on the file already shown under the tree closes it again.
async function toggleShown($: EngineInterface, top: string, file: TouchedFile): Promise<void> {
  if ((await read($, openedFile))?.file.path === file.path) {
    await update($, openedFile, () => null)
    return
  }

  const content = await hunksFor($, top, file)
  await update($, openedFile, () => ({ file, ...content }))
}

// The desktop app's own views, through the tools it gives Claude: the session's diff at the file, or the person's
// editor at its first change. A deleted file has only its diff.
function appCall(file: TouchedFile, absolute: string, mode: Exclude<OpenMode, 'file'>): Record<string, unknown> {
  if (mode === 'editor' && file.kind !== 'deleted') {
    return { tool: 'mcp__ccd_host__open_in_editor', path: absolute, line: firstChangedLine(file.diff) }
  }

  return { tool: 'mcp__ccd_view__show_pane', pane: 'diff', path: absolute, ...(file.kind === 'committed' ? {} : { diff_scope: 'uncommitted' }) }
}

async function openFile($: EngineInterface, path: string, mode: OpenMode): Promise<void> {
  const file = ((await read($, view)).files ?? []).find(one => one.path === path)

  if (file === undefined || toplevel === null) {
    return
  }

  if (mode === 'file') {
    await toggleShown($, toplevel, file)
    return
  }

  try {
    const result = await $.tool.call(appCall(file, `${toplevel}/${path}`, mode) as never)

    if (isFailed(result)) {
      $.ui.toast(`Could not open ${baseName(path)}: ${(result as { text?: string }).text ?? 'refused'}`)
    }
  } catch (error) {
    $.ui.toast(`Could not open ${baseName(path)}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// An image is rebuilt only when what it shows changed.
const cache = new Map<string, { key: string; image: Image }>()

function cachedImage(slot: string, key: string, draw: () => Image): Image {
  const hit = cache.get(slot)

  if (hit?.key === key) {
    return hit.image
  }

  const image = draw()
  cache.set(slot, { key, image })

  return image
}

const imageOf = (row: Row, shownPath: string | undefined): Image => {
  const isSelected = row.type === 'file' && row.file.path === shownPath

  return cachedImage(`row:${row.key}`, `${isSelected} ${JSON.stringify(row)}`, () => (row.type === 'folder' ? drawFolder(row) : drawFile(row, isSelected)))
}

const CODE_ROWS_PER_IMAGE = 120
// The engine draws about 100000 characters of a pane's tree, serialized; this leaves room for the elements around the
// images. The tree takes what it needs of it first, then the shown file, then the hover cards while they fit.
const BUDGET = 80_000
const TREE_SHARE = 0.8

const weigh = (image: Image): number => image.source.length + 120
// A note's image, and a file row's hover scope and click layer around its image.
const NOTE_WEIGHT = 1_000
const FILE_ROW_WEIGHT = 300

const weighAll = (images: readonly Image[]): number => images.reduce((sum, image) => sum + weigh(image), 0)

function codeImages(rows: readonly DiffRow[], digits: number): Image[] {
  const images: Image[] = []

  for (let at = 0; at < rows.length; at += CODE_ROWS_PER_IMAGE) {
    const chunk = rows.slice(at, at + CODE_ROWS_PER_IMAGE)
    images.push(cachedImage(`code:${at}`, `${digits} ${JSON.stringify(chunk)}`, () => drawDiffRows(chunk, digits)))
  }

  return images
}

// The shown file in the room left: whole, each line wrapped to what the pane's width holds of the monospace font; else
// its changes with a few lines around each; else as many of those as fit.
function shownView(shown: OpenedFile, bodyColumns: number, room: number): { images: Image[]; note: string | null } {
  const lines = lineRows(shown.hunks)
  const digits = String(lines.reduce((most, row) => Math.max(most, row.number ?? 0), 1)).length
  const width = Math.max(20, Math.floor((bodyColumns * PX_PER_COLUMN - codeGutter(digits) - 14) / MONO_PX))
  const whole = codeImages(wrapRows(lines, width), digits)

  if (weighAll(whole) <= room) {
    return { images: whole, note: shown.note }
  }

  for (const context of CONTEXTS) {
    const images = codeImages(wrapRows(nearChanges(lines, context), width), digits)

    if (weighAll(images) <= room) {
      return { images, note: `Too long to show whole here: its changes, with ${context} lines around each. Ctrl-click opens it whole in your editor.` }
    }
  }

  const near = wrapRows(nearChanges(lines, NEAR_LINES), width)
  const kept = Math.max(1, Math.floor((near.length * room * 0.9) / weighAll(codeImages(near, digits))))

  return { images: codeImages(near.slice(0, kept), digits), note: 'Too long to show here: its first changes. Ctrl-click opens it in your editor.' }
}

const kindsIn = (files: readonly TouchedFile[]): Kind[] => KIND_ORDER.filter(kind => files.some(file => file.kind === kind))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    void $.command.register({ name: 'files', description: 'Show the files this session changed, in a pane beside the transcript' }).catch(() => undefined)
    await refresh($)

    if ((await read($, view)).isRepo) {
      void openPane($).catch(() => undefined)
    }

    return result
  })

  on('command.run', { command: 'files' }, async $ => {
    const placed = await openPane($)
    void refresh($)

    return { text: placed.isPlaced ? 'Files pane opened.' : `The files pane could not open: ${placed.reason}` }
  })

  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    const paths = await gitFilesToWatch($)

    return paths.length === 0 ? result : { ...result, watchPaths: [...(result.watchPaths ?? []), ...paths] }
  }).catch(($, e, next) => next(e))

  on('classic.FileChanged', async ($, e, next) => {
    const result = await next(e)
    scheduleRefresh($)

    return result
  }).catch(($, e, next) => next(e))

  on('classic.CwdChanged', async ($, e, next) => {
    const result = await next(e)
    baseline = null
    scheduleRefresh($)

    return result
  }).catch(($, e, next) => next(e))

  // Subagents' edits count as the session's own.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)

    if (EDITING.test(e.tool) && !isFailed(result)) {
      void noteEdit($, e as unknown as Record<string, unknown>).catch(() => undefined)
    }

    if (REFRESHING_TOOLS.test(e.tool)) {
      scheduleRefresh($)
    }

    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    scheduleRefresh($)

    return result
  }).catch(($, e, next) => next(e))

  // Not awaited: the editor may ask the person first, and the click's own dispatch should not wait on that.
  on('ui.message', async ($, e, next) => {
    const result = await next(e)
    const data = e.data as { path?: unknown; mode?: unknown } | null

    if (e.element.startsWith('close:')) {
      await update($, openedFile, () => null)
    } else if (e.element.startsWith('open:') && typeof data?.path === 'string' && isOpenMode(data.mode)) {
      void openFile($, data.path, data.mode)
    }

    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Code } = $.ui.resolve(e)
    const shown = await read($, view)
    const opened = await read($, openedFile)
    const files = shown.files ?? []
    const rows = treeOf(files)
    const summary = summaryOf(files)
    const note = !shown.isRepo ? 'Not in a git repository.' : shown.files === null ? 'Reading git…' : files.length === 0 ? 'No files changed yet.' : null
    const empty = opened?.file.isBinary === true ? 'A binary file: nothing to show.' : 'No lines changed.'

    if (e.surface !== 'desktop') {
      const indent = (depth: number) => '  '.repeat(depth)
      const terminalHunks = opened === null ? '' : withinLength(opened.hunks, MAX_TERMINAL_HUNKS)

      return (
        <Box flexDirection="column">
          <Text bold>
            Files <Text dimColor>this session</Text>
          </Text>
          {note !== null ? (
            <Text dimColor>{note}</Text>
          ) : (
            <Text>
              {summary.kinds.map(entry => (
                <Text color={THEME_KEYS[entry.kind]}>{`${KINDS[entry.kind].sign}${entry.count} `}</Text>
              ))}
              <Text color="success">{`+${summary.plus} `}</Text>
              <Text color="error">{`−${summary.minus}`}</Text>
            </Text>
          )}
          {rows.map(row =>
            row.type === 'folder' ? (
              <Text wrap="truncate-end">
                {indent(row.depth)}
                <Text bold>{`${row.name}/`}</Text>
                <Text dimColor>{row.count > 0 ? ` ${row.count}` : ''}</Text>
              </Text>
            ) : (
              <Text wrap="truncate-end">
                {indent(row.depth)}
                <Text color={THEME_KEYS[row.file.kind]} bold>{`${KINDS[row.file.kind].letter} `}</Text>
                <Text color={THEME_KEYS[row.file.kind]} strikethrough={row.file.kind === 'deleted'}>
                  {baseName(row.file.path)}
                </Text>
                <Text dimColor>{row.file.from === null ? '' : ` ← ${baseName(row.file.from)}`}</Text>
                <Text color="success">{row.file.plus > 0 ? ` +${row.file.plus}` : ''}</Text>
                <Text color="error">{row.file.minus > 0 ? ` −${row.file.minus}` : ''}</Text>
              </Text>
            ),
          )}
          {opened !== null && (
            <Text bold color={THEME_KEYS[opened.file.kind]}>
              {`${KINDS[opened.file.kind].letter} ${opened.file.path}`}
            </Text>
          )}
          {opened !== null && opened.note !== null && <Text dimColor>{opened.note}</Text>}
          {opened !== null && (terminalHunks === '' ? <Text dimColor>{empty}</Text> : <Code source={terminalHunks} format="diff" path={opened.file.path} />)}
        </Box>
      )
    }

    const { Svg, Client } = $.ui.resolve(e)
    const header = cachedImage('header', JSON.stringify(summary), () => drawHeader(summary))
    const kinds = kindsIn(files)
    const legend = cachedImage('legend', kinds.join(), () => drawLegend(kinds))
    const shownHeader = opened === null ? null : cachedImage('shown', JSON.stringify(opened.file), () => drawOpenedHeader(opened.file))
    let used = weigh(header) + weigh(legend) + 2 * NOTE_WEIGHT + (shownHeader === null ? 0 : weigh(shownHeader) + 2 * NOTE_WEIGHT)
    const drawn: { row: Row; image: Image }[] = []

    for (const row of rows) {
      const image = imageOf(row, opened?.file.path)
      const weight = weigh(image) + (row.type === 'file' ? FILE_ROW_WEIGHT : 0)

      if (used + weight > BUDGET * TREE_SHARE) {
        break
      }

      used += weight
      drawn.push({ row, image })
    }

    const leftOut = rows.slice(drawn.length).filter(row => row.type === 'file').length
    const shownNow = opened === null || opened.hunks === '' ? null : shownView(opened, e.props.bodyColumns, BUDGET - used)
    used += shownNow === null ? 0 : weighAll(shownNow.images)
    const cards = new Map<string, Image>()

    for (const { row } of drawn) {
      const card = row.type === 'file' ? cachedImage(`card:${row.key}`, JSON.stringify(row.file), () => drawCard(row.file)) : null

      if (card !== null && used + weigh(card) <= BUDGET) {
        used += weigh(card)
        cards.set(row.key, card)
      }
    }

    const shownNote = shownNow?.note ?? opened?.note ?? null

    // A placed card paints over what comes before it, so the rows go in reverse and column-reverse puts them back:
    // each file's card, opening downward over the rows below it, then comes after them. The click layer comes after
    // its own card, so the row stays clickable while the card covers it.
    return (
      <Box flexDirection="column" width="100%">
        <Svg source={header.source} alt={describeSummary(summary)} height={header.height} />
        {note !== null && <Svg source={drawNote(note).source} alt={note} height={ROW} />}
        <Box flexDirection="column-reverse" width="100%">
          {[...drawn].reverse().map(({ row, image }) => {
            if (row.type === 'folder') {
              return <Svg source={image.source} alt={`folder ${row.name}`} height={image.height} />
            }

            const card = cards.get(row.key)

            return (
              <Box key={`file:${row.key}`} flexDirection="column" width="100%">
                <Svg source={image.source} alt={describeFile(row.file)} height={image.height} />
                {card !== undefined && (
                  <Box position="absolute" left={0} right={0} top={0} display="none" hover={{ display: 'flex' }} flexDirection="column">
                    <Svg source={card.source} alt={`diff of ${row.file.path}`} height={card.height} />
                  </Box>
                )}
                <Box position="absolute" left={0} right={0} top={0} bottom={0}>
                  <Client key={`open:${row.key}`} module="./file-click.tsx" props={{ path: row.file.path }} width="100%" height="100%" />
                </Box>
              </Box>
            )
          })}
        </Box>
        {leftOut > 0 && <Svg source={drawNote(`and ${leftOut} more files`).source} alt={`and ${leftOut} more files`} height={ROW} />}
        {kinds.length > 0 && <Svg source={legend.source} alt={kinds.map(kind => `${KINDS[kind].letter} ${KINDS[kind].word}`).join(', ')} height={legend.height} />}
        {opened !== null && (
          <Box flexDirection="column" width="100%">
            <Box key="shown" flexDirection="column" width="100%">
              {shownHeader !== null && <Svg source={shownHeader.source} alt={`showing ${describeFile(opened.file)}`} height={shownHeader.height} />}
              <Box position="absolute" right={0} top={0} bottom={0} width={4}>
                <Client key={`close:${opened.file.path}`} module="./file-click.tsx" props={{ path: opened.file.path }} width="100%" height="100%" />
              </Box>
            </Box>
            {shownNote !== null && <Svg source={drawNote(shownNote).source} alt={shownNote} height={ROW} />}
            {shownNow === null ? (
              <Svg source={drawNote(empty).source} alt={empty} height={ROW} />
            ) : (
              shownNow.images.map((image, index) => (
                <Svg source={image.source} alt={index > 0 ? `${opened.file.path}, continued` : shownNow.note === null ? `the whole of ${opened.file.path}` : `the changes of ${opened.file.path}`} height={image.height} />
              ))
            )}
          </Box>
        )}
      </Box>
    )
  })
}
