# git-band

A band above the Claude Code prompt that shows where the session is in git:

- **Branch**: its name, `↑n` / `↓n` ahead of and behind its upstream, `no upstream` when it has none, and
  the short commit id when the checkout is detached.
- **Worktree**: `<repo> · main worktree`, or `<name> · worktree of <repo>` in a linked worktree.
- **Changes**: conflicted, added, modified, deleted, renamed and untracked files, each counted once in
  its own colour, how many are staged, and `+lines −lines` against `HEAD`. A clean tree shows `✓ clean`.

The band follows the person's theme. On the desktop app the branch and worktree marks are small icons;
in the terminal they are glyphs.

## How it stays current

It runs `git` itself (`rev-parse`, `status --porcelain=v2 --branch`, `diff HEAD --shortstat`) with
`--no-optional-locks`, so it never takes the index lock from your own git commands. It refreshes every
10 seconds, after each Bash, PowerShell, Edit, Write or NotebookEdit call, and when a turn ends, and redraws
only when something changed. Outside a git repository it draws nothing.

It adds nothing to what Claude reads and makes no model calls or network requests, so it costs no tokens.

## Requirements

- Claude Code 2.1.287 or later; built and tested on 2.1.308.
- `git` 2.31 or later on the PATH.

## Install

```text
/plugin install git-band --marketplace zdenyhraz/claude-mods
```

See the [repository README](../../README.md#install) for the desktop app and shell.
