# git-band

A session dashboard above the Claude Code prompt. Screenshots are in the [repository README](../../README.md#git-band).

1. **Git**, then the plan limits on the right:
   - **Repo** (blue): a book icon and the repository's name.
   - **Worktree** (purple), only in a linked worktree: a fork icon and its name.
   - **Branch** (orange): its name, or the short commit id when detached; then `↑n` / `↓n` ahead of and
     behind its upstream, or `no upstream`.
   - **Changes**: a count for each kind present, each file counted once: `!` conflicted (red), `+` added
     (green), `~` modified (amber), `−` deleted (red), `→` renamed (blue), `?` untracked (teal), `●` staged
     (blue), then `+lines −lines` against `HEAD`; or `✓ clean`.
   - **Limits**: a small ring per plan window, `5h` and `wk` written inside, filling green under 50%, amber
     from 50% and red from 80%, with the percentage beside it. They appear after the session's first reply,
     on a Pro or Max plan.
2. **Context**: a bar of the context window, each category in its own colour, then the percentage used. On
   the desktop app a yellow `compact` at the end of the row compacts the conversation, as `/compact` does.
3. **Subagents**, only while there are any: a card per agent with its state (running, waiting, queued,
   done, failed, stopped) in its own colour, its time, its task and type, and how many tools it has called.
   Active agents come first; finished ones stay until the next prompt. Ten cards at most, the last saying
   how many more.

On the desktop app the dashboard is one small vector image, since the app gives a bordered box a full row
above and below; the image keeps it compact and picks Claude Code's dark or light colours to match the
app's theme. It is rebuilt only when what it shows changed. The terminal shows the same rows as coloured
text. Names longer than 40 characters are shortened with an ellipsis.

## How it stays current

It runs `git` itself (`rev-parse`, `status --porcelain=v2 --branch`, `diff HEAD --shortstat`) with
`--no-optional-locks`, so it never takes the index lock from your own git commands. It never polls: it
refreshes only when something that can change the answer happens.

- The session starts, or the mod reloads.
- Claude runs Bash, PowerShell, Edit, Write or NotebookEdit, enters or leaves a worktree, or ends a turn.
- One of git's own files changes: the worktree's `HEAD`, `index` and `logs/HEAD`, and the repository's
  `FETCH_HEAD`. Every commit, checkout, stage, reset, merge, rebase, pull or fetch writes one of these, so
  git commands you run yourself, in a terminal or an editor, show up too.
- You start typing at the prompt after a turn, which catches files you edited outside the session without
  staging them.

A burst of these is one refresh, and the band redraws only when the answer changed. Outside a git repository
it draws nothing. When git can't answer (a timeout, a busy index), the band keeps what it last showed, and a
survey in the band shows below it rather than in its place.

The band always describes the session's own directory. Subagents' tool calls and turns don't refresh it,
since a subagent may work in a worktree of its own.

Context and limits update with each measurement Claude Code makes after a reply; the category breakdown is
estimated locally, with no request sent. Subagents update when one starts, calls a tool or ends a turn.
While at least one is active, a 5-second clock keeps their times and states current; it stops as soon as
none is, and runs no git.

It adds nothing to what Claude reads and makes no model calls or network requests, so it costs no tokens.

## Requirements

- Claude Code 2.1.287 or later; built and tested on 2.1.308.
- `git` 2.31 or later on the PATH.

## Install

```text
/plugin install git-band --marketplace zdenyhraz/claude-mods
```

See the [repository README](../../README.md#install) for the desktop app and shell.
