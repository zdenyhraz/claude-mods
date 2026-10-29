import type { ActivityView, PlanStep } from '../types'

const TESTS =
  /(^|[\s;&|(])((npm|pnpm|yarn|bun)\s+(run\s+)?test\b|pytest\b|jest\b|vitest\b|mocha\b|ctest\b|(go|cargo|dotnet)\s+test\b)|run_test\w*|\bplugin\s+test\b|gtest_filter|\w-test(\.exe)?\b/i
const BUILDS = /\bsetup\.py\b|\bcmake\s+--build\b|(^|[\s;&|])(make|msbuild|tsc)\b|\b(npm|pnpm|yarn)\s+run\s+build\b|\b(cargo|go|dotnet)\s+build\b/i
const COMMIT = /\bgit\s+(-c\s+\S+\s+)*commit\b/
const PUSH = /\bgit\s+(-c\s+\S+\s+)*push\b/
const EDITING = /^(Edit|Write|NotebookEdit)$/

export type ToolArgs = Record<string, unknown>

const textOf = (value: unknown): string => (typeof value === 'string' ? value : '')

const parts = (path: string): string[] => path.split(/[\\/]/).filter(Boolean)

const baseName = (path: string): string => parts(path).at(-1) ?? path

// The last two parts of a path: enough to tell files apart without the checkout's own location.
export const shortPath = (path: string): string => parts(path).slice(-2).join('/')

export const commandOf = (args: ToolArgs): string => textOf(args.command)

export const editedPath = (tool: string, args: ToolArgs): string | null =>
  EDITING.test(tool) ? textOf(args.file_path) || textOf(args.notebook_path) || null : null

export const isTestCommand = (command: string): boolean => TESTS.test(command)

export const isCommit = (command: string): boolean => COMMIT.test(command)

function describeCommand(command: string): string {
  if (TESTS.test(command)) {
    return 'Running tests'
  }

  if (BUILDS.test(command)) {
    return 'Building'
  }

  if (COMMIT.test(command)) {
    return 'Committing'
  }

  return PUSH.test(command) ? 'Pushing' : 'Running a command'
}

const TOOL_WORDS: Record<string, string> = {
  Grep: 'Searching the code',
  Glob: 'Searching the code',
  WebSearch: 'Searching the web',
  WebFetch: 'Reading the web',
  Agent: 'Starting a subagent',
  Task: 'Starting a subagent',
  Skill: 'Using a skill',
}

// What the session is doing while a tool runs, in a few words; null for bookkeeping tools that change nothing shown.
export function describeTool(tool: string, args: ToolArgs): string | null {
  if (tool === 'Bash' || tool === 'PowerShell') {
    return describeCommand(commandOf(args))
  }

  const path = editedPath(tool, args) ?? textOf(args.file_path)

  if (tool === 'Read') {
    return `Reading ${baseName(path)}`
  }

  if (EDITING.test(tool)) {
    return `${tool === 'Write' ? 'Writing' : 'Editing'} ${baseName(path)}`
  }

  if (tool.startsWith('mcp__ccd_') || tool === 'ToolSearch') {
    return null
  }

  return TOOL_WORDS[tool] ?? (tool.startsWith('mcp__') ? 'Using a connector' : `Using ${tool}`)
}

// The tools that stop for the person's answer, and what they wait on.
export function waitsFor(tool: string, args: ToolArgs): string | null {
  if (tool === 'ExitPlanMode') {
    return 'approve the plan'
  }

  if (tool !== 'AskUserQuestion') {
    return null
  }

  const questions = Array.isArray(args.questions) ? (args.questions as { question?: unknown }[]) : []
  const question = textOf(questions[0]?.question)

  return question === '' ? 'answer a question' : question
}

type PlanUpdate = { items?: PlanStep[]; advance?: boolean; done?: number[]; start?: number }

// The desktop app's task list: a whole new list, or steps advanced, finished or started by their number from 1.
export function applyPlanUpdate(plan: readonly PlanStep[], args: ToolArgs): PlanStep[] {
  const change = args as PlanUpdate
  const steps = (Array.isArray(change.items) ? change.items : plan).map(({ content, status }) => ({ content, status }))

  if (change.advance === true) {
    const current = steps.find(step => step.status === 'in_progress')
    const pending = steps.find(step => step.status === 'pending')

    if (current) {
      current.status = 'completed'
    }

    if (pending) {
      pending.status = 'in_progress'
    }
  }

  for (const number of change.done ?? []) {
    const step = steps[number - 1]

    if (step) {
      step.status = 'completed'
    }
  }

  if (typeof change.start === 'number') {
    steps.filter(step => step.status === 'in_progress').forEach(step => (step.status = 'pending'))
    const step = steps[change.start - 1]

    if (step) {
      step.status = 'in_progress'
    }
  }

  return steps
}

export function todosOf(args: ToolArgs): PlanStep[] {
  const todos = Array.isArray(args.todos) ? (args.todos as PlanStep[]) : []

  return todos.map(({ content, status }) => ({ content, status }))
}

const MAX_PROMPT = 160
const MAX_HELD = 4000
const IMAGES = /\[Image[^\]]*\]/g
// Blocks the engine wraps around a prompt (reminders, notifications), which the person never typed.
const SYSTEM_BLOCKS = /<([a-z][\w-]*)[^>]*>[\s\S]*?<\/\1>/gi

// A prompt's text without system blocks and image placeholders, as kept for the hover card; null when nothing is left.
export function promptText(text: string): string | null {
  const kept = text.replace(SYSTEM_BLOCKS, '').replace(IMAGES, '').trim()

  if (kept === '') {
    return null
  }

  return kept.length > MAX_HELD ? `${kept.slice(0, MAX_HELD - 1)}…` : kept
}

// A prompt's first line of text, flattened and cut.
export function promptLine(text: string): string | null {
  const line = text
    .replace(IMAGES, '')
    .split(/\r?\n/)
    .map(part => part.trim())
    .find(Boolean)

  if (line === undefined) {
    return null
  }

  const flat = line.replace(/\s+/g, ' ')

  return flat.length > MAX_PROMPT ? `${flat.slice(0, MAX_PROMPT - 1)}…` : flat
}

const MACHINE_ORIGINS = new Set([
  'task-notification',
  'scheduled-trigger',
  'peer',
  'peer-send-message',
  'projects-relay',
  'channel',
  'coordinator',
  'observer',
  'observer-activity',
])

type Submission = { command?: unknown; isMeta?: true; origin?: { kind: string; asUser?: true } }

// What the person wrote, at the composer, from a phone or through a button of theirs; not a slash command, a
// notification, another session's message or a plugin's words of its own.
export function isOwnPrompt(e: Submission): boolean {
  if (e.command !== undefined || e.isMeta === true) {
    return false
  }

  const kind = e.origin?.kind ?? 'unclassified'

  return kind === 'plugin' ? e.origin?.asUser === true : !MACHINE_ORIGINS.has(kind)
}

export type BackgroundTask = { id: string; label: string }

const MAX_LABEL = 80

const labelOf = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim()

  return flat.length > MAX_LABEL ? `${flat.slice(0, MAX_LABEL - 1)}…` : flat
}

// Work a tool call left running after it answered: a command sent to the background, or a monitor.
export function startedTask(tool: string, args: ToolArgs, output: unknown): BackgroundTask | null {
  const record = output !== null && typeof output === 'object' ? (output as Record<string, unknown>) : {}
  const id = tool === 'Monitor' ? record.taskId : tool === 'Bash' || tool === 'PowerShell' ? record.backgroundTaskId : undefined

  if (typeof id !== 'string' || id === '') {
    return null
  }

  return { id, label: labelOf(textOf(args.description) || textOf(args.command)) }
}

// The tasks a task notification reports on.
export const finishedTasks = (text: string): string[] => [...text.matchAll(/<task-id>\s*([^<\s]+)\s*<\/task-id>/g)].map(match => match[1] ?? '')

type TranscriptRow = { role: string; text: string; toolResults?: readonly unknown[] }


// The session's latest prompt of the person's own, whole: system blocks and images stripped, a compaction's summary,
// slash commands and notices skipped.
export function lastPrompt(rows: readonly TranscriptRow[]): string | null {
  for (const row of [...rows].reverse()) {
    if (row.role !== 'user' || (row.toolResults?.length ?? 0) > 0) {
      continue
    }

    const text = row.text.replace(SYSTEM_BLOCKS, '').replace(IMAGES, '').trim()

    if (text !== '' && !/^[/[]/.test(text) && !/^This session is being continued/i.test(text)) {
      return promptText(text)
    }
  }

  return null
}

export type HueTable = Record<string, { hue: string; at: number }>

const MAX_HUES_KEPT = 40

// A worktree keeps the colour it was given; a new one gets the colour no other worktree has used for longest, so
// sessions open together tell apart for as long as there are colours to go round.
export function pickHue<T extends string>(table: HueTable, name: string, hues: readonly T[]): T {
  const known = table[name]?.hue

  for (const hue of hues) {
    if (hue === known) {
      return hue
    }
  }

  const lastUsed = (hue: T): number => Math.max(-1, ...Object.values(table).filter(entry => entry.hue === hue).map(entry => entry.at))

  return [...hues].sort((a, b) => lastUsed(a) - lastUsed(b))[0] ?? (hues[0] as T)
}

export function withHue(table: HueTable, name: string, hue: string, now: number): HueTable {
  const entries = Object.entries({ ...table, [name]: { hue, at: now } })

  return Object.fromEntries(entries.sort((a, b) => b[1].at - a[1].at).slice(0, MAX_HUES_KEPT))
}

export const NO_ACTIVITY: ActivityView = { since: null, files: [], commands: [], tests: null, commits: 0 }

const MAX_COMMANDS = 8

export function withEdit(activity: ActivityView, path: string): ActivityView {
  const known = activity.files.some(file => file.path === path)
  const files = known ? activity.files.map(file => (file.path === path ? { ...file, edits: file.edits + 1 } : file)) : [...activity.files, { path, edits: 1 }]

  return { ...activity, files }
}

export function withCommand(activity: ActivityView, command: string, isOk: boolean, ms: number, now: number): ActivityView {
  const text = command.split(/\r?\n/)[0]?.trim() ?? ''

  return {
    ...activity,
    commands: [...activity.commands, { text, isOk, ms }].slice(-MAX_COMMANDS),
    tests: isTestCommand(command) ? { isOk, at: now } : activity.tests,
    commits: activity.commits + (isOk && isCommit(command) ? 1 : 0),
  }
}
