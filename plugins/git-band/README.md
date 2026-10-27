# git-band

A band above the Claude Code prompt that shows where the session is in git, on one line:

- **Branch**: a pill in the theme's accent colour with the branch name, or the short commit id when the
  checkout is detached; then `↑n` / `↓n` ahead of and behind its upstream, or `no upstream`.
- **Worktree**: a blue pill `<repo> main checkout`, or a purple one `<name> worktree of <repo>` in a linked
  worktree.
- **Changes**: conflicted, added, modified, deleted, renamed and untracked files, each counted once, how many
  are staged, and `+lines −lines` against `HEAD`, all in bold and each in its own colour. A clean tree shows
  `✓ clean`.

Colours are theme keys, so the band follows the person's theme; only the text and icons inside the pills
are white. On the desktop app the branch and worktree marks are small icons; in the terminal they are
glyphs. A narrow window shortens the pills rather than wrapping the band.

## How it stays current

It runs `git` itself (`rev-parse`, `status --porcelain=v2 --branch`, `diff HEAD --shortstat`) with
`--no-optional-locks`, so it never takes the index lock from your own git commands. It refreshes every
10 seconds, after each Bash, PowerShell, Edit, Write or NotebookEdit call, right after the session enters or
leaves a worktree, and when a turn ends, and redraws only when something changed. Outside a git repository
it draws nothing.

The band always describes the session's own directory. Subagents' tool calls and turns don't refresh it,
since a subagent may work in a worktree of its own.

It adds nothing to what Claude reads and makes no model calls or network requests, so it costs no tokens.

## Requirements

- Claude Code 2.1.287 or later; built and tested on 2.1.308.
- `git` 2.31 or later on the PATH.

## Install

```text
/plugin install git-band --marketplace zdenyhraz/claude-mods
```

See the [repository README](../../README.md#install) for the desktop app and shell.
