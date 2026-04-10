from skill_router import route

SEPARATOR = "\n\n---\n\n"


def assemble(task: str, context: dict) -> str:
    parts = []

    skill_instructions = route(task)
    if skill_instructions:
        parts.append(f"## Instructions\n{skill_instructions.strip()}")

    if context.get("url"):
        page_ctx = f"## Page context\nURL: {context['url']}"
        if context.get("title"):
            page_ctx += f"\nTitle: {context['title']}"
        parts.append(page_ctx)

    if context.get("selected_text"):
        parts.append(f"## Selected text\n{context['selected_text']}")

    if context.get("editor_content"):
        parts.append(f"## Editor selection\n```\n{context['editor_content']}\n```")

    history = context.get("history") or []
    if history:
        lines = []
        for msg in history:
            role = msg.get("role", "user").capitalize()
            lines.append(f"{role}: {msg.get('content', '')}")
        parts.append("## Conversation history\n" + "\n\n".join(lines))

    parts.append(f"## Task\n{task}")

    return SEPARATOR.join(parts)
