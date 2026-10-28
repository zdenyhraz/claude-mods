import type { Kind, TouchedFile } from '../types'
import type { DiffRow, Row, Summary } from './changes'

const baseName = (path: string): string => path.split('/').at(-1) ?? path

type Tone =
  | 'text'
  | 'body'
  | 'inactive'
  | 'gray'
  | 'subtle'
  | 'success'
  | 'warning'
  | 'error'
  | 'blue'
  | 'tan'
  | 'line'
  | 'card'
  | 'plusBg'
  | 'plusText'
  | 'minusBg'
  | 'minusText'
  | 'hunk'
  | 'select'

// Claude Code's dark and light theme colours, git-band's own. An Svg is drawn as an image that cannot read the
// theme, so the prefers-color-scheme media query, which follows the app's theme, picks between them.
const DARK: Record<Tone, string> = {
  text: '#ecebe4',
  body: '#d6d4cc',
  inactive: '#9a9893',
  gray: '#8a8882',
  subtle: '#6b6a65',
  success: '#4eba65',
  warning: '#ffc107',
  error: '#ff6b80',
  blue: '#b1b9f9',
  tan: '#c9a27a',
  line: '#4a4945',
  card: '#2b2a27',
  plusBg: 'rgba(78,186,101,0.16)',
  plusText: '#9fe0ad',
  minusBg: 'rgba(255,107,128,0.15)',
  minusText: '#ffb3be',
  hunk: '#6cb4ee',
  select: 'rgba(255,255,255,0.07)',
}

const LIGHT: Record<Tone, string> = {
  text: '#2b2a27',
  body: '#3d3c38',
  inactive: '#6b6a65',
  gray: '#8a8882',
  subtle: '#b4b2a9',
  success: '#2c7a39',
  warning: '#966c1e',
  error: '#ab2b3f',
  blue: '#4b5fe0',
  tan: '#8a6338',
  line: '#d9d7cf',
  card: '#ffffff',
  plusBg: 'rgba(44,122,57,0.12)',
  plusText: '#1f6b30',
  minusBg: 'rgba(171,43,63,0.10)',
  minusText: '#9b2335',
  hunk: '#1a66c9',
  select: 'rgba(0,0,0,0.06)',
}

type Icon = 'added' | 'modified' | 'deleted' | 'renamed' | 'committed' | 'folder' | 'files'

const ICON_PATHS: Record<Icon, string> = {
  added: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/>',
  modified: '<path d="M12.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v9.5"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m13.4 12.6-6.9 6.9-.8 3 3-.8 6.9-6.9z"/>',
  deleted: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m14.5 12.5-5 5"/><path d="m9.5 12.5 5 5"/>',
  renamed: '<path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M2 15h10"/><path d="m9 18 3-3-3-3"/>',
  committed: '<circle cx="12" cy="12" r="3"/><path d="M3 12h6"/><path d="M15 12h6"/>',
  folder:
    '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  files: '<path d="M20 7h-3a2 2 0 0 1-2-2V2"/><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z"/><path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8"/>',
}

export const KINDS: Record<Kind, { tone: Tone; letter: string; sign: string; word: string }> = {
  added: { tone: 'success', letter: 'A', sign: '+', word: 'added' },
  modified: { tone: 'warning', letter: 'M', sign: '~', word: 'changed' },
  deleted: { tone: 'error', letter: 'D', sign: '−', word: 'deleted' },
  renamed: { tone: 'blue', letter: 'R', sign: '→', word: 'renamed' },
  committed: { tone: 'gray', letter: '✓', sign: '✓', word: 'committed' },
}

type Style = 'title' | 'name' | 'meta' | 'small' | 'letter'

const SIZES: Record<Style, number> = { title: 14, name: 13, meta: 11.5, small: 11.5, letter: 12 }

export const ROW = 26
const INDENT = 16
const HEADER = 52
const DIFF_ROW = 18
const CARD_HEAD = 32

// Widths of Segoe UI Semibold at 14px, scaled to the size drawn, close enough that textLength's small stretch to
// them is invisible.
function charWidth(char: string): number {
  if ('il.,:;|!\'`'.includes(char)) {
    return 3.6
  }

  if ('fjrt()[]/\\-'.includes(char)) {
    return 4.9
  }

  if ('mwMW%'.includes(char)) {
    return 11.6
  }

  if ('←→✓−…'.includes(char)) {
    return 10
  }

  return /[A-Z]/.test(char) ? 9 : 7.6
}

const textWidth = (content: string, size: number): number => Math.ceil(([...content].reduce((sum, char) => sum + charWidth(char), 0) * size) / 14)

// Double quotes too, so the finished image can take single-quoted attributes.
const escape = (content: string): string => content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#34;')

const isTone = (name: string): name is Tone => name in DARK

function palette(colors: Record<Tone, string>, fills: Tone[], strokes: Tone[]): string {
  return [...fills.map(tone => `.f-${tone}{fill:${colors[tone]}}`), ...strokes.map(tone => `.s-${tone}{stroke:${colors[tone]}}`)].join('')
}

function text(content: string, x: number, y: number, tone: Tone, style: Style, anchor: 'start' | 'end' = 'start'): string {
  const placing = anchor === 'start' ? ` textLength="${textWidth(content, SIZES[style])}" lengthAdjust="spacingAndGlyphs"` : ' text-anchor="end"'

  return `<text class="${style} f-${tone}" x="${x}" y="${y}"${placing}>${escape(content)}</text>`
}

function icon(name: Icon, x: number, y: number, tone: Tone, size: number): string {
  return `<g class="s-${tone}" fill="none" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" transform="translate(${x} ${y}) scale(${(size / 24).toFixed(3)})">${ICON_PATHS[name]}</g>`
}

const atRightEdge = (content: string, height: number): string => `<svg x="100%" width="1" height="${height}" overflow="visible">${content}</svg>`

export type Image = { source: string; height: number }

const FONT = "text{font-family:'Segoe UI Variable Text','Segoe UI',system-ui,sans-serif}"

const FONT_RULES: Record<Style | 'mono', string> = {
  title: `font-size:${SIZES.title}px;font-weight:700`,
  name: `font-size:${SIZES.name}px;font-weight:600`,
  meta: `font-size:${SIZES.meta}px;font-weight:500`,
  small: `font-size:${SIZES.small}px;font-weight:600`,
  letter: `font-size:${SIZES.letter}px;font-weight:700`,
  mono: "font-family:'Cascadia Mono',Consolas,Menlo,monospace;font-size:11.5px;white-space:pre",
}

const classesOf = (body: string, prefix: string): Tone[] => [...new Set([...body.matchAll(new RegExp(`\\b${prefix}-(\\w+)`, 'g'))].map(match => match[1] ?? ''))].filter(isTone)

// As wide as whatever holds it and with no viewBox, so nothing is ever scaled and text keeps its size. A pane draws
// about 100000 characters in all, so an image carries only the rules it uses, and single quotes, which the drawing's
// JSON holds without escaping.
function wrap(parts: string[], height: number, rules = ''): Image {
  const body = parts.join('')
  const fills = classesOf(body, 'f')
  const strokes = classesOf(body, 's')
  const fonts = (Object.keys(FONT_RULES) as (keyof typeof FONT_RULES)[]).filter(name => new RegExp(`class="${name}[ "]`).test(body))
  const style = `${fonts.length > 0 ? FONT : ''}${fonts.map(name => `.${name}{${FONT_RULES[name]}}`).join('')}${palette(DARK, fills, strokes)}@media (prefers-color-scheme: light){${palette(LIGHT, fills, strokes)}}${rules}`
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${height}"><style>${style}</style>${body}</svg>`

  return { source: source.replace(/"/g, "'"), height }
}

// The left part is clipped to what the right part leaves of the image's real width; `behind` is drawn under both.
function leftAndRight(id: string, left: string[], right: string[], rightWidth: number, behind: string[] = []): Image {
  const room = `calc(100% - ${rightWidth + 10}px)`
  const parts = [...behind, `<clipPath id="${id}"><rect width="0" height="${ROW}" style="width:max(0px, ${room})"/></clipPath>`, `<g clip-path="url(#${id})">`, ...left, '</g>']

  return wrap(right.length > 0 ? [...parts, atRightEdge(right.join(''), ROW)] : parts, ROW)
}

function linesOf(file: TouchedFile, endX: number, y = 17.5): { parts: string[]; width: number } {
  if (file.isBinary) {
    return { parts: [text('binary', endX, y, 'subtle', 'meta', 'end')], width: textWidth('binary', SIZES.meta) }
  }

  const minus = file.minus > 0 ? `−${file.minus}` : ''
  const plus = file.plus > 0 ? `+${file.plus}` : ''
  const minusWidth = minus === '' ? 0 : textWidth(minus, SIZES.small)
  const parts = [
    ...(minus === '' ? [] : [text(minus, endX, y, 'error', 'small', 'end')]),
    ...(plus === '' ? [] : [text(plus, endX - minusWidth - (minus === '' ? 0 : 5), y, 'success', 'small', 'end')]),
  ]

  return { parts, width: minusWidth + (plus === '' ? 0 : textWidth(plus, SIZES.small) + (minus === '' ? 0 : 5)) }
}

export function drawFolder(row: Extract<Row, { type: 'folder' }>): Image {
  const x = row.depth * INDENT
  const left = [icon('folder', x, 5.5, 'tan', 15), text(row.name, x + 21, 17.5, 'body', 'name')]
  let dot = x + 21 + textWidth(row.name, SIZES.name) + 9

  for (const kind of row.kinds) {
    left.push(`<circle class="f-${KINDS[kind].tone}" cx="${dot + 3.5}" cy="13" r="3.5"/>`)
    dot += 11
  }

  const count = row.count > 0 ? String(row.count) : ''

  return leftAndRight('folder', left, count === '' ? [] : [text(count, -4, 17.5, 'gray', 'meta', 'end')], textWidth(count, SIZES.meta))
}

// A selected file, the one shown under the tree, sits on a faint band.
export function drawFile(row: Extract<Row, { type: 'file' }>, isSelected: boolean): Image {
  const file = row.file
  const look = KINDS[file.kind]
  const x = row.depth * INDENT
  const name = baseName(file.path)
  const nameWidth = textWidth(name, SIZES.name)
  const isQuiet = file.kind === 'deleted' || file.kind === 'committed'
  const band = isSelected ? [`<rect class="f-select" x="0" y="1" width="0" height="${ROW - 2}" rx="5" style="width:100%"/>`] : []
  const left = [icon(file.kind, x, 6, look.tone, 14), text(name, x + 21, 17.5, isQuiet ? 'inactive' : look.tone, 'name')]

  if (file.kind === 'deleted') {
    left.push(`<rect class="f-error" x="${x + 21}" y="12.6" width="${nameWidth}" height="1.3"/>`)
  }

  if (file.from !== null) {
    left.push(text(`← ${baseName(file.from)}`, x + 21 + nameWidth + 6, 17.5, 'gray', 'meta'))
  }

  const lines = linesOf(file, -26)
  const right = [...lines.parts, text(look.letter, -4, 17.5, look.tone, 'letter', 'end')]

  return leftAndRight('file', left, right, lines.width + 30, band)
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

export function drawHeader(summary: Summary): Image {
  const parts = [
    icon('files', 0, 5, 'text', 16),
    text('Files', 23, 18, 'text', 'title'),
    text('this session', 23 + textWidth('Files', SIZES.title) + 7, 18, 'gray', 'meta'),
  ]
  parts.push(`<rect class="f-line" x="0" y="${HEADER - 1}" width="0" height="1" style="width:100%"/>`)

  if (summary.files === 0) {
    return wrap(parts, HEADER)
  }

  let x = 0
  const count = plural(summary.files, 'file')
  parts.push(text(count, x, 40, 'gray', 'small'))
  x += textWidth(count, SIZES.small) + 12

  for (const { kind, count: kindCount } of summary.kinds) {
    const label = `${KINDS[kind].sign}${kindCount}`
    parts.push(text(label, x, 40, KINDS[kind].tone, 'small'))
    x += textWidth(label, SIZES.small) + 9
  }

  const plus = `+${summary.plus}`
  const minus = `−${summary.minus}`
  parts.push(`<g class="tot">${text(plus, x + 3, 40, 'success', 'small')}${text(minus, x + 3 + textWidth(plus, SIZES.small) + 5, 40, 'error', 'small')}</g>`)
  const end = x + 3 + textWidth(plus, SIZES.small) + 5 + textWidth(minus, SIZES.small)

  return wrap(parts, HEADER, `@media (max-width:${end - 0.01}px){.tot{display:none}}`)
}

export function drawNote(words: string): Image {
  return wrap([text(words, 0, 17.5, 'gray', 'meta')], ROW)
}

// The kinds present, each with its letter, as the footer's key to the tree.
export function drawLegend(kinds: readonly Kind[]): Image {
  const parts: string[] = []
  let x = 0

  for (const kind of kinds) {
    parts.push(text(KINDS[kind].letter, x, 17.5, KINDS[kind].tone, 'letter'))
    x += textWidth(KINDS[kind].letter, SIZES.letter) + 4
    parts.push(text(KINDS[kind].word, x, 17.5, 'subtle', 'meta'))
    x += textWidth(KINDS[kind].word, SIZES.meta) + 12
  }

  return wrap(parts, ROW)
}

function diffTone(line: string): { text: Tone; back: Tone | null } {
  if (line.startsWith('@@')) {
    return { text: 'hunk', back: null }
  }

  if (line.startsWith('+')) {
    return { text: 'plusText', back: 'plusBg' }
  }

  return line.startsWith('-') ? { text: 'minusText', back: 'minusBg' } : { text: 'body', back: null }
}

function noteOf(file: TouchedFile): string {
  if (file.kind === 'committed') {
    return 'committed'
  }

  return file.edits > 0 ? `edited ${file.edits === 1 ? 'once' : `${file.edits} times`}` : 'changed by a command'
}

// A file's icon, name, folder and what touched it, from `x`; its lines at the right edge, `inset` from it.
function headOf(file: TouchedFile, x: number, inset: number): string[] {
  const name = baseName(file.path)
  const folder = file.path.slice(0, -name.length - 1)
  const about = [folder, noteOf(file)].filter(Boolean).join(' · ')

  return [
    icon(file.kind, x, 9, KINDS[file.kind].tone, 15),
    text(name, x + 22, 21, 'text', 'name'),
    text(about, x + 22 + textWidth(name, SIZES.name) + 8, 21, 'gray', 'meta'),
    atRightEdge(linesOf(file, -inset, 21).parts.join(''), CARD_HEAD),
  ]
}

// The shown file's header: a rule above, then as a card's, with a close mark at the right edge.
export function drawOpenedHeader(file: TouchedFile): Image {
  const close = atRightEdge(`<g class="s-gray" stroke-width="1.8" stroke-linecap="round"><path d="M-15 ${CARD_HEAD / 2 - 1}l8 8M-7 ${CARD_HEAD / 2 - 1}l-8 8"/></g>`, CARD_HEAD + 8)
  const rule = `<rect class="f-line" x="0" y="4" width="0" height="1" style="width:100%"/>`

  return wrap([rule, `<g transform="translate(0 8)">${headOf(file, 0, 30).join('')}${close}</g>`], CARD_HEAD + 8)
}

export const CODE_ROW = 18
// The advance of the monospace font drawn at 11.5px, rounded up so a wrapped line never runs past the edge.
export const MONO_PX = 7

export const codeGutter = (digits: number): number => digits * MONO_PX + 8

const DIFF_TONES: Record<Exclude<DiffRow['kind'], 'gap'>, { text: Tone; back: Tone | null; bar: Tone | null }> = {
  same: { text: 'body', back: null, bar: null },
  added: { text: 'plusText', back: 'plusBg', bar: 'success' },
  removed: { text: 'minusText', back: 'minusBg', bar: 'error' },
}

// Rows of the shown file: a number in the gutter, and an added or removed line on its colour with a bar at the edge.
// The marks are grouped by colour, each row then only its place and words, to keep the image small.
export function drawDiffRows(rows: readonly DiffRow[], digits: number): Image {
  const gutter = codeGutter(digits)
  const under = new Map<string, string[]>()
  const over = new Map<string, string[]>()
  const add = (layer: Map<string, string[]>, group: string, mark: string) => {
    const marks = layer.get(group) ?? []
    marks.push(mark)
    layer.set(group, marks)
  }

  rows.forEach((row, index) => {
    const y = index * CODE_ROW

    if (row.kind === 'gap') {
      add(over, `<g class="meta f-gray">`, `<text x="${gutter + 10}" y="${y + 13}">⋯</text>`)
      return
    }

    const tones = DIFF_TONES[row.kind]

    if (tones.back !== null && tones.bar !== null) {
      add(under, `<g class="f-${tones.back}">`, `<rect y="${y}" width="100%" height="${CODE_ROW}"/>`)
      add(under, `<g class="f-${tones.bar}">`, `<rect y="${y}" width="3" height="${CODE_ROW}"/>`)
    }

    if (row.number !== null) {
      add(over, `<g class="mono f-subtle" text-anchor="end">`, `<text x="${gutter}" y="${y + 13}">${row.number}</text>`)
    }

    if (row.text !== '') {
      add(over, `<g class="mono f-${tones.text}">`, `<text x="${gutter + 10}" y="${y + 13}">${escape(row.text)}</text>`)
    }
  })

  return wrap([...under, ...over].map(([open, marks]) => `${open}${marks.join('')}</g>`), rows.length * CODE_ROW)
}

// The card a hover shows over a file: its name and lines, then the start of its diff.
export function drawCard(file: TouchedFile): Image {
  const body = file.isBinary ? ['  binary file'] : file.diff.length > 0 ? file.diff : ['  no lines changed']
  const parts: string[] = []
  let y = CARD_HEAD + 4

  for (const line of body) {
    const tone = diffTone(line)

    if (tone.back !== null) {
      parts.push(`<rect class="f-${tone.back}" x="1" y="${y}" width="0" height="${DIFF_ROW}" style="width:calc(100% - 2px)"/>`)
    }

    parts.push(`<text class="mono f-${tone.text}" x="12" y="${y + 13}">${escape(line.replace(/\t/g, '    '))}</text>`)
    y += DIFF_ROW
  }

  if (file.more > 0) {
    parts.push(text(`${plural(file.more, 'more line')}`, 12, y + 16, 'gray', 'meta'))
    y += 22
  }

  const hint = file.kind === 'deleted' ? 'Click to view · shift-click for the diff' : 'Click to view · shift-click for the diff · ctrl-click in your editor'
  parts.push(`<rect class="f-line" x="1" y="${y + 4}" width="0" height="1" style="width:calc(100% - 2px)"/>`)
  parts.push(text(hint, 12, y + 22, 'subtle', 'meta'))
  y += 28

  const height = y + 8
  const frame = `<rect class="f-card s-line" x="0.5" y="0.5" width="0" height="${height - 1}" rx="8" style="width:calc(100% - 1px)"/>`
  const divider = `<rect class="f-line" x="1" y="${CARD_HEAD}" width="0" height="1" style="width:calc(100% - 2px)"/>`

  return wrap([frame, divider, ...headOf(file, 11, 12), ...parts], height)
}

export const describeFile = (file: TouchedFile): string =>
  `${KINDS[file.kind].word} ${file.path}${file.from === null ? '' : ` from ${file.from}`}${file.isBinary ? ' binary' : ` +${file.plus} −${file.minus}`}`

export const describeSummary = (summary: Summary): string =>
  summary.files === 0
    ? 'Files this session: none yet'
    : `Files this session: ${[plural(summary.files, 'file'), ...summary.kinds.map(entry => `${entry.count} ${KINDS[entry.kind].word}`), `+${summary.plus} −${summary.minus}`].join(', ')}`
