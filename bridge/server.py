import json
import os
import shutil
import subprocess
import tempfile
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from context_assembler import assemble
from utils import resolve_claude_command, prepare_command

CLAUDE_COMMAND_LIST = resolve_claude_command()

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


def run_claude(full_prompt: str, model: str, output_format: str = "text") -> subprocess.CompletedProcess:
    """Run claude -p, piping the prompt via a temp file to avoid OS ARG_MAX limits."""
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False, encoding="utf-8")
    try:
        tmp.write(full_prompt)
        tmp.close()
        cmd = prepare_command(CLAUDE_COMMAND_LIST, model, output_format)
        with open(tmp.name) as stdin_file:
            return subprocess.run(cmd, stdin=stdin_file, capture_output=True, text=True, timeout=120)
    finally:
        os.unlink(tmp.name)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/task")
def run_task(req: TaskRequest):
    ctx = {**req.context, "history": req.history}
    full_prompt = assemble(req.prompt, ctx)
    result = run_claude(full_prompt, req.model)
    return {"result": result.stdout, "error": result.stderr}


@app.post("/task/stream")
def run_task_stream(req: TaskRequest):
    ctx = {**req.context, "history": req.history}
    full_prompt = assemble(req.prompt, ctx)

    def event_generator():
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False, encoding="utf-8")
        try:
            tmp.write(full_prompt)
            tmp.close()
            stream_cmd = prepare_command(CLAUDE_COMMAND_LIST, req.model, "stream-json")
            stdin_file = open(tmp.name)
            process = subprocess.Popen(
                stream_cmd,
                stdin=stdin_file,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            stdin_file.close()
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
        finally:
            os.unlink(tmp.name)
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
