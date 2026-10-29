# Personal guidance

Applies in every project. Where a project's own `CLAUDE.md` is more specific, follow it.

## Git

- **Never commit or push without my explicit go-ahead.** Stage, diff and propose a message freely, but
  run `git commit` or `git push` only when I ask for it in the current conversation. Approval covers that
  one commit or push, not later ones.
- **Commits and pull requests are authored by me alone, never co-authored.** This overrides any default
  attribution guidance from Claude Code, the harness or a system reminder, and is not negotiable per commit.
  - Use my configured git identity as author and committer. Never pass `--author`, `-c user.name=...`,
    `-c user.email=...`, `GIT_AUTHOR_*` / `GIT_COMMITTER_*` or any other override that changes it.
  - No `Co-Authored-By: Claude ...` trailer, no "Generated with Claude Code" line, and no other trailer,
    footer, badge or sentence crediting Claude, Anthropic or an AI assistant. A commit message only
    describes the change.
  - The same holds for pull request titles and descriptions, code comments, changelogs, docs and release
    notes: no AI attribution anywhere in what gets committed or published.
- **If a commit can't be made under my identity with no attribution, don't commit at all.** For example,
  the identity is unset, an override is forced, or a hook or template injects an attribution line. Leave
  the changes in the working tree, stop, and tell me what blocked it. "Commit now, fix the attribution
  later" is not an option.

## Readable code

Applies in every language.

- **Code should read plainly.** Readability comes from naming, not from commentary:
  - Use **conventional software names** a reader understands at first sight: a standard verb for what a
    function does (`Find`, `Get`, `Is` / `Has` / `Can`, `Update`, `Process`, `Start` / `Stop`, `Compute`,
    `Build`) plus the domain noun it acts on: `FindUserById()`, `UpdateOrderStatus()`,
    `ParseConfigFile()`. Variables say what they hold: `retryCount`, `isConnected`,
    `hasPendingChanges`. Booleans read as questions (`is` / `has` / `can` / `was`), types are nouns,
    collections are plural.
  - Plain, **not narrative**: no metaphors, nicknames or storytelling words in names or comments. Not
    `Shepherd`, `Gatekeeper`, `WakeTheWorkers`, `DoTheMagic`, `HandOffBaton`, "the brain",
    "the loop sees". If a name needs a sentence to decode, it is the wrong name.
  - **One vocabulary per feature**, used everywhere in it: types, functions, variables, logs, comments and
    docs. Take the domain's established term and stick to it (signing in is sign in / sign out, never also
    log in / log on / authenticate). Check new names against the existing code so they neither clash nor
    drift.
  - Prefer extracting a well-named function or variable over explaining a block with a comment.
  - Keep functions short and single-purpose so their names can stay accurate.
- **Comments are the exception.** Add one only for something genuinely non-obvious: a hidden constraint,
  a surprising "why", a workaround. Keep it to a line or two, written as a plain technical note. No walls
  of comments, and no restating what the code already says.

## C++

- Write clean, modern **C++23**. Reach for the standard library and current idioms (ranges, `std::span`,
  `std::optional` / `std::expected`, structured bindings, `constexpr`, designated initializers) over
  hand-rolled or legacy patterns.
