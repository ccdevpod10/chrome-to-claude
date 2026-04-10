import json
import shutil
import subprocess
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from context_assembler import assemble

# Resolve claude binary once at startup (same logic as native_host.py)
_CLAUDE_SEARCH_PATHS = [
    "/Users/codeclouds-sayan/.local/bin/claude",
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
    "/usr/bin/claude",
]

def _find_claude() -> str:
    import os
    if env := os.environ.get("CLAUDE_BIN"):
        return env
    extra = ":".join(__import__("os").path.dirname(p) for p in _CLAUDE_SEARCH_PATHS)
    augmented = extra + ":" + __import__("os").environ.get("PATH", "")
    found = shutil.which("claude", path=augmented)
    return found or "claude"

CLAUDE_BIN = _find_claude()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to chrome-extension://YOUR_ID in production
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class TaskRequest(BaseModel):
    prompt: str
    context: dict = {}
    history: list = []
    model: str = ""  # optional model override, e.g. "claude-opus-4-6"


def build_cmd(full_prompt: str, model: str) -> list[str]:
    cmd = [CLAUDE_BIN, "-p", full_prompt, "--output-format", "text"]
    if model:
        cmd += ["--model", model]
    return cmd


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/task")
def run_task(req: TaskRequest):
    ctx = {**req.context, "history": req.history}
    full_prompt = assemble(req.prompt, ctx)
    result = subprocess.run(
        build_cmd(full_prompt, req.model),
        capture_output=True,
        text=True,
        timeout=120,
    )
    return {"result": result.stdout, "error": result.stderr}


@app.post("/task/stream")
def run_task_stream(req: TaskRequest):
    ctx = {**req.context, "history": req.history}
    full_prompt = assemble(req.prompt, ctx)

    def event_generator():
        try:
            stream_cmd = [CLAUDE_BIN, "-p", full_prompt, "--output-format", "stream-json"]
            if req.model:
                stream_cmd += ["--model", req.model]
            process = subprocess.Popen(
                stream_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            for line in process.stdout:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    if obj.get("type") == "assistant":
                        for block in obj.get("message", {}).get("content", []):
                            if block.get("type") == "text":
                                yield f"data: {json.dumps({'token': block['text']})}\n\n"
                    elif obj.get("type") == "result":
                        yield f"data: {json.dumps({'result': obj.get('result', '')})}\n\n"
                except (json.JSONDecodeError, KeyError):
                    pass
            process.wait()
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
