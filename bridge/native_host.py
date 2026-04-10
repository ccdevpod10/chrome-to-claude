#!/usr/bin/env python3
"""Chrome Native Messaging host for the Claude Code Bridge.

Chrome spawns this process directly and communicates via stdin/stdout
using 4-byte little-endian length-prefixed JSON messages.
"""
import json
import shutil
import struct
import subprocess
import sys
import os

# Ensure bridge/ is on the path so context_assembler can be imported
sys.path.insert(0, os.path.dirname(__file__))
from context_assembler import assemble

# Chrome spawns native hosts with a stripped PATH that often omits ~/.local/bin,
# /usr/local/bin, etc. Resolve the claude binary once at startup.
_CLAUDE_SEARCH_PATHS = [
    os.path.expanduser("~/.local/bin/claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
    "/usr/bin/claude",
]

def _find_claude() -> str:
    # Honour an explicit env override first
    if env := os.environ.get("CLAUDE_BIN"):
        return env
    # Augment PATH with common install locations and try shutil.which
    extra = ":".join(os.path.dirname(p) for p in _CLAUDE_SEARCH_PATHS)
    augmented = extra + ":" + os.environ.get("PATH", "")
    found = shutil.which("claude", path=augmented)
    if found:
        return found
    raise FileNotFoundError(
        "claude CLI not found. Install it or set the CLAUDE_BIN environment variable."
    )

CLAUDE_BIN = _find_claude()


def read_message() -> dict:
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len:
        sys.exit(0)
    msg_len = struct.unpack("<I", raw_len)[0]
    return json.loads(sys.stdin.buffer.read(msg_len).decode("utf-8"))


def send_message(data: dict) -> None:
    encoded = json.dumps(data).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def main() -> None:
    while True:
        try:
            message = read_message()
            prompt = message.get("prompt", "")
            context = message.get("context", {})
            history = message.get("history", [])
            ctx = {**context, "history": history}
            full_prompt = assemble(prompt, ctx)

            result = subprocess.run(
                [CLAUDE_BIN, "-p", full_prompt, "--output-format", "text"],
                capture_output=True,
                text=True,
                timeout=120,
            )
            send_message({"result": result.stdout, "error": result.stderr})
        except Exception as e:
            send_message({"result": "", "error": str(e)})


if __name__ == "__main__":
    main()
