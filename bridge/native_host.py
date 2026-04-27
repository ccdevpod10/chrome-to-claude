#!/usr/bin/env python3
"""Chrome Native Messaging host for the Claude Code Bridge.

Chrome spawns this process directly and communicates via stdin/stdout
using 4-byte little-endian length-prefixed JSON messages.
"""
import json
import os
import struct
import subprocess
import sys
import tempfile

# Ensure bridge/ is on the path so context_assembler can be imported
sys.path.insert(0, os.path.dirname(__file__))
from context_assembler import assemble
from openrouter_client import call_openrouter
from utils import resolve_claude_command, prepare_command

CLAUDE_COMMAND_LIST = resolve_claude_command()


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
            provider = message.get("provider", "claude-cli")
            prompt = message.get("prompt", "")
            context = message.get("context", {})
            history = message.get("history", [])

            if provider == "openrouter":
                result = call_openrouter(
                    api_key=message.get("api_key", ""),
                    model=message.get("model", ""),
                    prompt=prompt,
                    context=context,
                    history=history,
                )
                send_message(result)
                continue

            # Claude CLI path
            ctx = {**context, "history": history}
            full_prompt = assemble(prompt, ctx)
            tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False, encoding="utf-8")
            tmp.write(full_prompt)
            tmp.close()
            try:
                with open(tmp.name) as stdin_file:
                    result = subprocess.run(
                        prepare_command(CLAUDE_COMMAND_LIST, message.get("model", ""), output_format="text"),
                        stdin=stdin_file,
                        capture_output=True,
                        text=True,
                        timeout=120,
                    )
            finally:
                os.unlink(tmp.name)
            send_message({"result": result.stdout, "error": result.stderr})
        except Exception as e:
            send_message({"result": "", "error": str(e)})


if __name__ == "__main__":
    main()
