export type Kind = 'added' | 'modified' | 'deleted' | 'renamed' | 'committed'

// A file the session changed: what it is now, its lines against HEAD (once committed, against where the session
// began), how often the session edited it, and the start of its diff.
export type TouchedFile = {
  path: string
  from: string | null
  kind: Kind
  plus: number
  minus: number
  isBinary: boolean
  edits: number
  diff: string[]
  more: number
}

// `files` is null until git has answered; `isRepo` false outside a repository.
export type FilesView = { isRepo: boolean; files: TouchedFile[] | null }

// The file a click opened: its whole diff as hunks, empty for a binary file or one with no lines changed, and a note
// when only its changed parts fit.
export type OpenedFile = { file: TouchedFile; hunks: string; note: string | null }

declare module 'claude-code' {
  interface PluginState {
    'session-files': {
      view: FilesView
      edits: Record<string, number>
      opened: OpenedFile | null
    }
  }
}
