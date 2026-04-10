import os

SKILLS_DIR = os.path.join(os.path.dirname(__file__), "skills")

ROUTING_RULES = [
    (
        ["refactor", "fix", "debug", "write code", "function", "class", "python",
         "javascript", "typescript", "implement", "unit test"],
        "code.md",
    ),
    (
        ["summarise", "summarize", "tldr", "tl;dr", "summary", "explain", "what is",
         "what are", "overview"],
        "summarise.md",
    ),
]


def load_skill(filename: str) -> str:
    path = os.path.join(SKILLS_DIR, filename)
    if os.path.exists(path):
        with open(path) as f:
            return f.read()
    return ""


def route(task: str) -> str:
    task_lower = task.lower()
    for keywords, skill_file in ROUTING_RULES:
        if any(kw in task_lower for kw in keywords):
            return load_skill(skill_file)
    return load_skill("default.md")
