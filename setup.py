"""Sets up Claude Code for this user from this clone: the personal guidance and the mods.

Safe to run again; each step skips what is already done.
"""

import argparse
import json
import pathlib
import shutil
import subprocess

REPO = pathlib.Path(__file__).resolve().parent
GUIDANCE = REPO / "user" / "CLAUDE.md"
USER_MEMORY = pathlib.Path.home() / ".claude" / "CLAUDE.md"
MARKETPLACE = json.loads((REPO / ".claude-plugin" / "marketplace.json").read_text(encoding="utf-8"))


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
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
    return result.stdout + result.stderr


def install_mods(claude: str | None) -> None:
    if claude is None:
        print("mods: skipped, claude is not on PATH; pass --claude <path to claude>")
        return

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
            print(f"git: {key} is not set; the guidance commits under your configured identity only")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--claude", default=shutil.which("claude"), help="path to the claude executable")
    args = parser.parse_args()

    import_guidance()
    install_mods(args.claude)
    check_git_identity()


if __name__ == "__main__":
    main()
