"""Sets up Claude Code for this user from this clone: the personal guidance and the mods.

Safe to run again; each step skips what is already done.
"""

import argparse
import json
import os
import pathlib
import shutil
import subprocess

REPO = pathlib.Path(__file__).resolve().parent
GUIDANCE = REPO / "user" / "CLAUDE.md"
USER_MEMORY = pathlib.Path.home() / ".claude" / "CLAUDE.md"
MARKETPLACE = json.loads(
    (REPO / ".claude-plugin" / "marketplace.json").read_text(encoding="utf-8")
)


def import_guidance() -> None:
    line = f"@{GUIDANCE.as_posix()}"
    text = USER_MEMORY.read_text(encoding="utf-8") if USER_MEMORY.exists() else ""

    if line in text.splitlines():
        print(f"guidance: already imported by {USER_MEMORY}")
        return

    separator = "\n" if text and not text.endswith("\n") else ""
    USER_MEMORY.parent.mkdir(parents=True, exist_ok=True)
    with USER_MEMORY.open("w", encoding="utf-8", newline="\n") as file:
        file.write(f"{text}{separator}{line}\n")
    print(f"guidance: {USER_MEMORY} now imports {GUIDANCE}")


def run(command: list[str]) -> str:
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return result.stdout + result.stderr


def version_of(path: pathlib.Path) -> tuple[int, ...]:
    return tuple(
        int(part) for part in path.parent.parent.name.split(".") if part.isdigit()
    )


# The desktop app keeps its own claude at Claude-Data/<profile>/claude-code/<version>/<build>/claude.exe.
def find_desktop_claude() -> str | None:
    local = os.environ.get("LOCALAPPDATA")
    if local is None:
        return None

    found = pathlib.Path(local, "Claude-Data").glob("*/claude-code/*/*/claude.exe")
    newest = max(found, key=version_of, default=None)
    return str(newest) if newest else None


def install_mods(claude: str | None) -> None:
    if claude is None:
        print(
            "mods: skipped, no claude found on PATH or in the desktop app; pass --claude <path to claude>"
        )
        return

    print(f"mods: using {claude}")

    name = MARKETPLACE["name"]
    if f"> {name}" not in run([claude, "plugin", "marketplace", "list"]):
        print(run([claude, "plugin", "marketplace", "add", str(REPO)]).strip())

    installed = run([claude, "plugin", "list"])
    for plugin in MARKETPLACE["plugins"]:
        mod = f"{plugin['name']}@{name}"
        if f"> {mod}" in installed:
            print(f"mods: {mod} already installed")
        else:
            print(run([claude, "plugin", "install", mod, "--scope", "user"]).strip())


def check_git_identity() -> None:
    for key in ("user.name", "user.email"):
        if not run(["git", "config", "--global", key]).strip():
            print(
                f"git: {key} is not set; the guidance commits under your configured identity only"
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--claude",
        help="path to the claude executable; found on PATH or in the desktop app by default",
    )
    args = parser.parse_args()
    claude = args.claude or shutil.which("claude") or find_desktop_claude()

    import_guidance()
    install_mods(claude)
    check_git_identity()


if __name__ == "__main__":
    main()
