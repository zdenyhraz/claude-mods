import type { GitStatus } from '../types'

export type Layout = { toplevel: string; gitDir: string; commonDir: string }

export type BranchInfo = Pick<GitStatus, 'branch' | 'isDetached' | 'upstream' | 'ahead' | 'behind'>
export type FileCounts = Pick<GitStatus, 'staged' | 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'>
export type LineCounts = Pick<GitStatus, 'insertions' | 'deletions'>

const trimSlashes = (path: string): string => path.replace(/[\\/]+$/, '')
const baseName = (path: string): string => trimSlashes(path).split(/[\\/]/).pop() ?? path
const normalize = (path: string): string => trimSlashes(path).replace(/\\/g, '/').toLowerCase()

export function parseLayout(stdout: string): Layout | null {
  const [toplevel, gitDir, commonDir] = stdout.trim().split(/\r?\n/)

  if (!toplevel || !gitDir || !commonDir) {
    return null
  }

  return { toplevel, gitDir, commonDir }
}

export function repoName(layout: Layout): string {
  const common = trimSlashes(layout.commonDir)

  return /[\\/]\.git$/.test(common) ? baseName(common.slice(0, -'.git'.length)) : baseName(common)
}

// A linked worktree has a git dir of its own under the common dir's worktrees/.
export function worktreeName(layout: Layout): string | null {
  return normalize(layout.gitDir) === normalize(layout.commonDir) ? null : baseName(layout.toplevel)
}

export function parseBranch(porcelain: string): BranchInfo {
  const info: BranchInfo = { branch: '', isDetached: false, upstream: null, ahead: 0, behind: 0 }
  let oid = ''

  for (const line of porcelain.split(/\r?\n/)) {
    if (line.startsWith('# branch.oid ')) {
      oid = line.slice('# branch.oid '.length)
    } else if (line.startsWith('# branch.head ')) {
      info.branch = line.slice('# branch.head '.length)
    } else if (line.startsWith('# branch.upstream ')) {
      info.upstream = line.slice('# branch.upstream '.length)
    } else if (line.startsWith('# branch.ab ')) {
      const [ahead, behind] = line.slice('# branch.ab '.length).split(' ')
      info.ahead = Math.abs(Number(ahead) || 0)
      info.behind = Math.abs(Number(behind) || 0)
    }
  }

  if (info.branch === '(detached)') {
    info.isDetached = true
    info.branch = oid === '(initial)' ? 'detached' : oid.slice(0, 8)
  }

  return info
}

// Each changed file counts once, under its most notable change; `staged` counts index changes on top.
export function parseFiles(porcelain: string): FileCounts {
  const counts: FileCounts = { staged: 0, added: 0, modified: 0, deleted: 0, renamed: 0, untracked: 0, conflicted: 0 }

  for (const line of porcelain.split(/\r?\n/)) {
    const kind = line[0]

    if (kind === '?') {
      counts.untracked += 1
    } else if (kind === 'u') {
      counts.conflicted += 1
    } else if (kind === '1' || kind === '2') {
      const index = line[2]
      const tree = line[3]

      if (index !== '.') {
        counts.staged += 1
      }

      if (index === 'A') {
        counts.added += 1
      } else if (index === 'D' || tree === 'D') {
        counts.deleted += 1
      } else if (kind === '2') {
        counts.renamed += 1
      } else {
        counts.modified += 1
      }
    }
  }

  return counts
}

export function parseShortstat(stdout: string): LineCounts {
  return {
    insertions: Number(/(\d+) insertions?\(\+\)/.exec(stdout)?.[1] ?? 0),
    deletions: Number(/(\d+) deletions?\(-\)/.exec(stdout)?.[1] ?? 0),
  }
}

export function changedFiles(status: GitStatus): number {
  return status.added + status.modified + status.deleted + status.renamed + status.untracked + status.conflicted
}
