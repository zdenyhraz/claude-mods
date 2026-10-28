import type { Kind, TouchedFile } from '../types'

export type Change = { path: string; from: string | null; kind: Exclude<Kind, 'committed'> }
export type Count = { plus: number; minus: number; isBinary: boolean }
export type Status = { head: string; changes: Change[] }
export type Snippet = { diff: string[]; more: number }

// Where the session began: HEAD then, and a mark of each file that already differed from it.
export type Baseline = { head: string; marks: Record<string, string> }

export const KIND_ORDER: Kind[] = ['added', 'modified', 'deleted', 'renamed', 'committed']

const DIFF_LINES = 14

const fieldsOf = (z: string): string[] => z.split('\0')

function kindOf(xy: string): Change['kind'] {
  if (xy.includes('A')) {
    return 'added'
  }

  return xy.includes('D') ? 'deleted' : 'modified'
}

// `git status --porcelain=v2 -z --branch --untracked-files=all`; a rename's original path is the field after it.
export function parseStatus(z: string): Status {
  const fields = fieldsOf(z)
  const changes: Change[] = []
  let head = ''

  for (let index = 0; index < fields.length; index++) {
    const field = fields[index] ?? ''
    const parts = field.split(' ')

    if (field.startsWith('# branch.oid ')) {
      head = field.slice('# branch.oid '.length)
    } else if (field.startsWith('1 ')) {
      changes.push({ path: parts.slice(8).join(' '), from: null, kind: kindOf(parts[1] ?? '') })
    } else if (field.startsWith('2 ')) {
      index += 1
      changes.push({ path: parts.slice(9).join(' '), from: fields[index] ?? null, kind: 'renamed' })
    } else if (field.startsWith('u ')) {
      changes.push({ path: parts.slice(10).join(' '), from: null, kind: 'modified' })
    } else if (field.startsWith('? ')) {
      changes.push({ path: field.slice(2), from: null, kind: 'added' })
    }
  }

  return { head, changes }
}

// `git diff --numstat -z`: `plus\tminus\tpath`, or for a rename `plus\tminus\t` and then its two paths as fields of
// their own; `-` counts a binary file.
export function parseNumstat(z: string): Map<string, Count> {
  const fields = fieldsOf(z)
  const counts = new Map<string, Count>()

  for (let index = 0; index < fields.length; index++) {
    const [plus = '', minus = '', ...rest] = (fields[index] ?? '').split('\t')

    if (plus === '') {
      continue
    }

    let path = rest.join('\t')

    if (path === '') {
      index += 2
      path = fields[index] ?? ''
    }

    counts.set(path, { plus: Number(plus) || 0, minus: Number(minus) || 0, isBinary: plus === '-' })
  }

  return counts
}

// `git diff --name-status -z`: a code, then one path, or two for a rename or copy.
export function parseNameStatus(z: string): Change[] {
  const fields = fieldsOf(z)
  const changes: Change[] = []

  for (let index = 0; index < fields.length; index++) {
    const code = fields[index] ?? ''

    if (code === '') {
      continue
    }

    if (code.startsWith('R') || code.startsWith('C')) {
      const from = fields[index + 1] ?? ''
      const path = fields[index + 2] ?? ''
      index += 2
      changes.push(code.startsWith('R') ? { path, from, kind: 'renamed' } : { path, from: null, kind: 'added' })
    } else {
      index += 1
      changes.push({ path: fields[index] ?? '', from: null, kind: code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified' })
    }
  }

  return changes
}

// Untracked files carry no line counts in a mark: git reports none, and the session's own edits of them count apart.
const markOf = (change: Change, count: Count | undefined): string => `${change.kind}|${change.from ?? ''}|${count?.plus ?? ''}|${count?.minus ?? ''}`

export function baselineOf(status: Status, counts: Map<string, Count>): Baseline {
  return { head: status.head, marks: Object.fromEntries(status.changes.map(change => [change.path, markOf(change, counts.get(change.path))])) }
}

// The changes that differ from where the session began, and those the session edited.
export function touchedChanges(baseline: Baseline, status: Status, counts: Map<string, Count>, edits: Record<string, number>): Change[] {
  return status.changes.filter(change => markOf(change, counts.get(change.path)) !== baseline.marks[change.path] || (edits[change.path] ?? 0) > 0)
}

// What was committed since the session began and has not changed again since.
export function committedChanges(committed: Change[], status: Status): Change[] {
  const live = new Set(status.changes.map(change => change.path))

  return committed.filter(change => !live.has(change.path))
}

function snippetOf(lines: string[]): Snippet {
  return { diff: lines.slice(0, DIFF_LINES), more: Math.max(0, lines.length - DIFF_LINES) }
}

const HEADER_LINE = /^(diff --git |index |--- |\+\+\+ |new file mode|deleted file mode|old mode|new mode|similarity index|dissimilarity index|rename from|rename to|copy from|copy to|Binary files|\\ )/

// A line a drawing can hold: no control characters but tabs.
const printable = (line: string): string => line.replace(/[\u0000-\u0008\u000a-\u001f\u007f]/g, '')

function linesOf(text: string): string[] {
  const lines = text.split(/\r?\n/)

  if (lines.at(-1) === '') {
    lines.pop()
  }

  return lines
}

// A file's hunks, its headers dropped, as the one text a diff drawing reads; empty when there are none.
export function hunksOf(text: string): string {
  const lines = linesOf(text)
  const first = lines.findIndex(line => line.startsWith('@@'))

  return first < 0 ? '' : lines.slice(first).filter(line => !line.startsWith('\\ ')).map(printable).join('\n')
}

// A new file as one hunk adding every line.
export function newFileDiff(content: string): string {
  const lines = linesOf(content)

  return lines.length === 0 ? '' : [`@@ -0,0 +1,${lines.length} @@`, ...lines.map(line => `+${printable(line)}`)].join('\n')
}

export type DiffRow = { kind: 'same' | 'added' | 'removed' | 'gap'; number: number | null; text: string }

// A line in pieces of at most `width` characters, each ending after a space where one falls late enough in it.
function wrapped(text: string, width: number): string[] {
  const pieces: string[] = []
  let rest = text

  while (rest.length > width) {
    const space = rest.lastIndexOf(' ', width - 1)
    const cut = space >= width * 0.6 ? space + 1 : width
    pieces.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }

  return [...pieces, rest]
}

const HUNK_RANGE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

// Hunks as rows, one a line: each numbered as the file has it now (a removed line as it had it), a gap row between
// hunks.
export function lineRows(hunks: string): DiffRow[] {
  const rows: DiffRow[] = []
  let before = 0
  let after = 0

  for (const line of hunks.split('\n')) {
    const range = HUNK_RANGE.exec(line)

    if (range !== null) {
      if (rows.length > 0) {
        rows.push({ kind: 'gap', number: null, text: '' })
      }

      before = Number(range[1])
      after = Number(range[2])
      continue
    }

    const kind = line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : 'same'
    rows.push({ kind, number: kind === 'removed' ? before : after, text: line.slice(1).replace(/\t/g, '    ') })
    before += kind === 'added' ? 0 : 1
    after += kind === 'removed' ? 0 : 1
  }

  return rows
}

// Each long line in pieces of `width` characters, the number on its first.
export function wrapRows(rows: readonly DiffRow[], width: number): DiffRow[] {
  return rows.flatMap(row => wrapped(row.text, width).map((text, index) => ({ ...row, number: index === 0 ? row.number : null, text })))
}

export const diffRows = (hunks: string, width: number): DiffRow[] => wrapRows(lineRows(hunks), width)

// Only the lines within `context` of a change, each run left out drawn as one gap row.
export function nearChanges(rows: readonly DiffRow[], context: number): DiffRow[] {
  const isChange = (row: DiffRow) => row.kind === 'added' || row.kind === 'removed'
  const distance = rows.map(() => Infinity)
  let last = -Infinity

  rows.forEach((row, index) => {
    last = isChange(row) ? index : last
    distance[index] = index - last
  })

  last = Infinity

  for (let index = rows.length - 1; index >= 0; index--) {
    last = isChange(rows[index] as DiffRow) ? index : last
    distance[index] = Math.min(distance[index] ?? Infinity, last - index)
  }

  const near: DiffRow[] = []

  rows.forEach((row, index) => {
    if (row.kind !== 'gap' && (distance[index] ?? Infinity) <= context) {
      near.push(row)
    } else if (near.at(-1)?.kind !== 'gap') {
      near.push({ kind: 'gap', number: null, text: '' })
    }
  })

  return near
}

// Hunks up to `max` characters, cut before the first hunk that would pass it, so what is left still parses.
export function withinLength(hunks: string, max: number): string {
  return hunks.length <= max ? hunks : hunks.slice(0, Math.max(0, hunks.lastIndexOf('\n@@', max)))
}

// The start of each file's hunks in a unified diff, by the path the file has after it.
export function parseDiff(text: string): Map<string, Snippet> {
  const snippets = new Map<string, Snippet>()

  for (const section of text.split(/^(?=diff --git )/m)) {
    const lines = section.split(/\r?\n/)
    const header = lines[0] ?? ''
    const after = lines.find(line => line.startsWith('+++ b/'))?.slice(6)
    const before = lines.find(line => line.startsWith('--- a/'))?.slice(6)
    const path = after ?? before ?? header.slice(header.lastIndexOf(' b/') + 3)

    if (!header.startsWith('diff --git ') || path === '') {
      continue
    }

    snippets.set(path, snippetOf(lines.filter(line => line !== '' && !HEADER_LINE.test(line)).map(printable)))
  }

  return snippets
}

// A new file's lines as a diff adding them; null for a binary one.
export function addedSnippet(content: string): (Snippet & { lines: number }) | null {
  if (content.includes('\0')) {
    return null
  }

  const lines = linesOf(content)

  return { ...snippetOf(lines.map(line => `+${printable(line)}`)), lines: lines.length }
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)/

// The first line the diff adds or removes, numbered as the file is now; a new file's first line.
export function firstChangedLine(diff: readonly string[]): number {
  let line = 1

  for (const text of diff) {
    const hunk = HUNK.exec(text)

    if (hunk !== null) {
      line = Number(hunk[1])
    } else if (text.startsWith('+') || text.startsWith('-')) {
      return Math.max(1, line)
    } else {
      line += 1
    }
  }

  return 1
}

export type Detail = { count: Count; snippet: Snippet }

export function fileOf(change: Change, isCommitted: boolean, detail: Detail | undefined, edits: number): TouchedFile {
  return {
    path: change.path,
    from: change.from,
    kind: isCommitted ? 'committed' : change.kind,
    plus: detail?.count.plus ?? 0,
    minus: detail?.count.minus ?? 0,
    isBinary: detail?.count.isBinary ?? false,
    edits,
    diff: detail?.snippet.diff ?? [],
    more: detail?.snippet.more ?? 0,
  }
}

const slashes = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/, '')

// A path as git names it, relative to the repository's top, or null outside it. Windows paths compare without case.
export function repoPath(path: string, toplevel: string): string | null {
  const file = slashes(path)
  const top = `${slashes(toplevel)}/`
  const isInside = /^[a-z]:/i.test(top) ? file.toLowerCase().startsWith(top.toLowerCase()) : file.startsWith(top)

  return isInside ? file.slice(top.length) : null
}

export type Row =
  | { type: 'folder'; key: string; depth: number; name: string; kinds: Kind[]; count: number }
  | { type: 'file'; key: string; depth: number; file: TouchedFile }

type Folder = { name: string; files: TouchedFile[]; folders: Map<string, Folder> }

export const baseName = (path: string): string => path.split('/').at(-1) ?? path

const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' })

const filesIn = (folder: Folder): TouchedFile[] => [...folder.files, ...[...folder.folders.values()].flatMap(filesIn)]

// A folder holding nothing but one folder is drawn as one row, `src/nav`.
function merged(folder: Folder): Folder {
  const [only] = folder.folders.values()

  if (folder.files.length === 0 && folder.folders.size === 1 && only !== undefined) {
    return merged({ ...only, name: `${folder.name}/${only.name}` })
  }

  return folder
}

function rowsOf(folder: Folder, depth: number, prefix: string): Row[] {
  const folders = [...folder.folders.values()].map(merged).sort((a, b) => byName(a.name, b.name))
  const files = [...folder.files].sort((a, b) => byName(baseName(a.path), baseName(b.path)))

  return [
    ...folders.flatMap(child => {
      const inside = filesIn(child).filter(file => file.kind !== 'committed')
      const kinds = KIND_ORDER.filter(kind => inside.some(file => file.kind === kind))
      const key = `${prefix}${child.name}/`

      return [{ type: 'folder' as const, key, depth, name: child.name, kinds, count: inside.length }, ...rowsOf(child, depth + 1, key)]
    }),
    ...files.map(file => ({ type: 'file' as const, key: file.path, depth, file })),
  ]
}

export function treeOf(files: readonly TouchedFile[]): Row[] {
  const root: Folder = { name: '', files: [], folders: new Map() }

  for (const file of files) {
    let folder = root

    for (const part of file.path.split('/').slice(0, -1)) {
      const next = folder.folders.get(part) ?? { name: part, files: [], folders: new Map() }
      folder.folders.set(part, next)
      folder = next
    }

    folder.files.push(file)
  }

  return rowsOf(root, 0, '')
}

export type Summary = { files: number; kinds: { kind: Kind; count: number }[]; plus: number; minus: number }

export function summaryOf(files: readonly TouchedFile[]): Summary {
  return {
    files: files.length,
    kinds: KIND_ORDER.map(kind => ({ kind, count: files.filter(file => file.kind === kind).length })).filter(entry => entry.count > 0),
    plus: files.reduce((sum, file) => sum + file.plus, 0),
    minus: files.reduce((sum, file) => sum + file.minus, 0),
  }
}
