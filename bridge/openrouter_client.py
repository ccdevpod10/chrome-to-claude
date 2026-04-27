from openai import OpenAI


def build_messages(prompt: str, context: dict, history: list[dict]) -> list[dict]:
    """Convert bridge payload (prompt + context + history) to OpenAI messages array."""
    parts = []
    if context.get("editor_content"):
        parts.append(f"Code:\n```\n{context['editor_content']}\n```")
    if context.get("url"):
        parts.append(f"Page: {context['url']}")

    messages = [{"role": m["role"], "content": m["content"]} for m in (history or [])]
    user_content = "\n\n".join(parts) + f"\n\nTask: {prompt}" if parts else prompt
    messages.append({"role": "user", "content": user_content})
    return messages


def call_openrouter(api_key: str, model: str, prompt: str, context: dict, history: list[dict]) -> dict:
    """Call OpenRouter via the openai SDK. Returns {"result": str} or {"error": str}."""
    if not api_key:
        return {"result": "", "error": "No API key configured for OpenRouter. Open Settings to add one."}

    try:
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
        )
        messages = build_messages(prompt, context, history)
        completion = client.chat.completions.create(
            extra_headers={
                "HTTP-Referer": "https://github.com/chrome-to-claude",
                "X-OpenRouter-Title": "Claude Code Bridge",
            },
            model=model or "openai/gpt-4o",
            messages=messages,
        )
        return {"result": completion.choices[0].message.content, "error": ""}
    except Exception as e:
        return {"result": "", "error": str(e)}
