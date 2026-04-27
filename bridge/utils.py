import os
import shutil
import shlex
import json
from pathlib import Path

_CLAUDE_SEARCH_PATHS = [
    os.path.expanduser("~/.local/bin/claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
    "/usr/bin/claude",
]

def resolve_claude_command() -> list[str]:
    """
    Resolves the command to invoke the Claude CLI.
    Priority:
    1. Config file ~/.claude-bridge/config.json
    2. Environment variable CLAUDE_BIN
    3. Default search paths
    """
    # 1. Config File
    config_path = Path.home() / ".claude-bridge" / "config.json"
    if config_path.exists():
        try:
            with open(config_path, "r") as f:
                config = json.load(f)
                if cmd := config.get("claude_bin"):
                    return shlex.split(cmd)
        except Exception:
            pass

    # 2. Environment Variable
    if env := os.environ.get("CLAUDE_BIN"):
        return shlex.split(env)

    # 3. Default Search
    extra = ":".join(os.path.dirname(p) for p in _CLAUDE_SEARCH_PATHS)
    augmented = extra + ":" + os.environ.get("PATH", "")
    found = shutil.which("claude", path=augmented)

    if found:
        return [found]

    return ["claude"]

def prepare_command(base_cmd_list: list[str], model_override: str = None, output_format: str = "text") -> list[str]:
    """
    Prepares the final command list by adding flags and model overrides.
    """
    cmd = list(base_cmd_list)
    cmd += ["-p", "--output-format", output_format]

    if model_override:
        # Only add --model if it's not already present in the base command
        if "--model" not in base_cmd_list:
            cmd += ["--model", model_override]

    return cmd
