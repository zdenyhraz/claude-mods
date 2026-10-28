# session-files

A pane beside the transcript with the files this session changed, as a tree. Screenshots are in the
[repository README](../../README.md#session-files).

- **Header**: how many files, a count for each kind of change, and the lines added and removed.
- **Tree**: folders first, then files, each sorted by name. A folder holding nothing but one folder is drawn
  as one row, `src/nav`. A folder shows a dot for each kind of change beneath it and how many files changed.
- **File**: an icon and its name in the colour of its change, its lines added and removed, and a letter at
  the right:
  - `A` added (green), new files included;
  - `M` changed (amber);
  - `D` deleted (red, struck through);
  - `R` renamed (blue), with the name it had;
  - `✓` committed (grey): committed during the session and not changed since, with its lines against where
    the session began.
- **Hover** a file on the desktop app for a card with its first lines of diff and how many times the session
  edited it.
- **Click** a file on the desktop app to see it whole under the tree: numbered, each added line on green and
  each removed one on red with a bar at its edge, long lines wrapped to the pane. The file stays marked in the
  tree, and the view follows it as the session goes on changing it. Click it again, or the `×` at the view's
  right, to close it. The app draws about 100,000 characters of a pane, so a file too long for that shows its
  changes with as many lines around each as fit, from 400 down to 8; ctrl-click opens it whole in your editor.
  With very many files, the tree keeps what fits and says how many more there are, and a file's hover card goes
  first.
- **Shift-click** shows the file in the app's own diff of the session, and **ctrl-click** opens it in your
  editor at its first change (VS Code, Cursor, Windsurf or Zed, the one the app's "Open in" menu uses), which
  asks you first unless the session is in auto mode. A deleted file opens in the diff.

The pane opens by itself in a git repository once the window is wide enough; `/files` opens it at any width.
The terminal draws the same tree as coloured text.

## What counts as the session's

When a session starts, the pane notes HEAD and every file that already differs from it. From then on it shows:

- each file whose change differs from what it was when the session began: a new change, more or fewer
  lines, a different kind;
- each file the session edited with Edit, Write or NotebookEdit, subagents' edits included, even one that
  already differed;
- each file committed since the session began, while HEAD has only moved forward from where it was.

So files a command created, deleted or renamed count too, and so do changes you make yourself in the same
checkout while the session runs. A file that already differed when the session began and that nothing has
touched since stays out.

What the session began from is kept across reloads and resumes. Loaded partway through a session, the pane
also takes the files the transcript shows the session edited.

## How it stays current

It runs `git` itself (`status --porcelain=v2`, `diff --numstat` and `diff` for the cards) with
`--no-optional-locks`, so it never takes the index lock from your own git commands. It never polls: it reads
git again a moment after Claude runs Bash, PowerShell, Edit, Write or NotebookEdit, enters or leaves a
worktree, or ends a turn, and when git's own `HEAD`, `index` or `logs/HEAD` changes, so commits and staging
you do yourself show up too. The pane redraws only when the answer changed.

The cards hold the first 14 lines of each file's diff; the first 120 files get lines and a card, and any more
show in the tree without them.

It adds nothing to what Claude reads and makes no model calls or network requests, so it costs no tokens.

## Requirements

- Claude Code 2.1.287 or later; built and tested on 2.1.308.
- `git` 2.31 or later on the PATH.

## Install

```text
/plugin install session-files --marketplace zdenyhraz/claude-mods
```

See the [repository README](../../README.md#install) for the desktop app and shell.
