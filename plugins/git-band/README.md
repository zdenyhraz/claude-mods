# git-band

A session dashboard above the Claude Code prompt, made for getting your bearings when you switch between
sessions. Screenshots are in the [repository README](../../README.md#git-band).

1. **Status**, once the session has a goal, a task list or a turn behind it:
   - **State**, as a solid chip in the state's colour: what the session is doing right now (`Running tests`,
     `Editing look.ts`, `Thinking`) in blue, or `Waiting for you` in amber and what it waits on (a question, a
     plan to approve, the question a turn ended with), or `Done` in green, `Stopped` in grey or `Failed` in red
     and how long ago; `Ready` before the first turn.
   - **Goal**: what the session is for: the first line of the session's first prompt, read from its
     transcript, or what you pin with `/purpose <what this session is for>`, which is kept across reloads
     and resumes.
   - **Step**, at the right: the task list's progress as a bar, the step's number and its words, e.g.
     `▰▰▰▱▱▱ 3/6 Run the test suite`; a finished plan shows its full bar alone.
2. **Since your prompt**, after your first prompt: how long ago you last wrote, then what happened since,
   subagents' work included: the files edited, the last test run (`tests ✓` or `tests ✗`), the commits and
   the subagents that finished; or `nothing changed`. On the desktop app, hovering it lists the files with
   their edits, the commands run with their results and times, and the subagents.
3. **Git**, then the plan limits on the right:
   - **Repo** (blue): a book icon and the repository's name.
   - **Worktree**, only in a linked worktree: a fork icon and its name, in the worktree's colour.
   - **Branch** (orange): its name, or the short commit id when detached; then `↑n` / `↓n` ahead of and
     behind its upstream, or `no upstream`.
   - **Changes**: a count for each kind present, each file counted once: `!` conflicted (red), `+` added
     (green), `~` modified (amber), `−` deleted (red), `→` renamed (blue), `?` untracked (teal), `●` staged
     (blue), then `+lines −lines` against `HEAD`; or `✓ clean`.
   - **Limits**: a small ring per plan window, `5h` and `wk` written inside, filling green under 50%, amber
     from 50% and red from 80%, with the percentage beside it. They appear after the session's first reply,
     on a Pro or Max plan.

   On the desktop app, hovering the row shows a card with the names whole, the upstream with how far ahead
   and behind it is, and each kind of change in words.
4. **Context**: a bar of the context window, each category in its own colour, then the percentage used. On
   the desktop app a yellow `compact` at the end of the row runs `/compact`; clicked during a turn, it runs
   once the turn ends.
5. **Subagents**, only while there are any: a card per agent with its state (running, waiting, queued,
   done, failed, stopped) in its own colour, its time, its task and type, and how many tools it has called.
   Active agents come first; finished ones stay until the next prompt. Ten cards at most, the last saying
   how many more.

On the desktop app each row is a small vector image, since the app gives a bordered box a full row above
and below; the images keep the dashboard compact and pick Claude Code's dark or light colours to match the
app's theme. Each image is as wide as the band and is never scaled, so text keeps its size at any window
width. Every form the git row and the limits can take is drawn into the image, and the image's own width
picks the one that fits, so nothing overlaps: as the band narrows, long names are cut shorter, then the line
counts go, then the change counts fold into one total, then the limits lose their percentages, then the
limits go. An image is rebuilt only when what it shows changed. The terminal shows the same rows as
coloured text.

Long names are cut in the middle, keeping both ends: `zdenyhraz/camera-da-…-caf29d`.

Each worktree has a colour of its own: violet, teal, pink, blue, tan or coral, none of them a colour a
state's chip uses. A worktree keeps its colour, and a new one gets the colour no other worktree has used for
longest, so up to six sessions open together all differ; the main checkout goes by its branch. On the
desktop app the colour runs as a stripe down the band's left edge, so you know which session you are looking
at before reading anything.

Other mods' bands stay: git-band stacks above whatever they draw in the band, and a survey shows below it.

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
it draws nothing. When git can't answer (a timeout, a busy index), the band keeps what it last showed.

The band always describes the session's own directory. Subagents' tool calls and turns don't refresh it,
since a subagent may work in a worktree of its own.

The status and since rows follow the session's own events: your prompts, each tool Claude calls, the task
list and the end of each turn. Times like `12 m ago` change with no event to say so, so the band redraws
once when the next one would change: each minute for the first hour, then each hour. That redraw runs no git.

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
