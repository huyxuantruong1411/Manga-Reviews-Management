"""
AI Service — Gemini Flash integration for review writing assistance.
Provides three modes:
  1. rewrite: Rewrite selected text with improvement
  2. intro: Generate a review introduction
  3. ideas: Generate review idea bullet points
"""

import asyncio

import httpx

from backend.config import settings

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent"


def _build_manga_context(manga: dict, tags: list[dict] | None = None) -> str:
    """Build a rich manga context string for the AI prompt."""
    lines = []

    # Primary title
    lines.append(f"Tên manga: {manga.get('title', 'N/A')}")

    # Alternative titles (grouped by lang)
    alt_titles = manga.get("alt_titles", [])
    if alt_titles:
        by_lang: dict[str, list[str]] = {}
        for entry in alt_titles:
            if "|" in entry:
                lang, title = entry.split("|", 1)
                by_lang.setdefault(lang, []).append(title)
            else:
                by_lang.setdefault("??", []).append(entry)
        for lang, titles in by_lang.items():
            lines.append(f"Tên khác ({lang}): {', '.join(titles)}")

    lines.append(f"Tác giả: {manga.get('author', 'N/A')}")
    lines.append(f"Họa sĩ: {manga.get('artist', 'N/A')}")
    lines.append(f"Năm xuất bản: {manga.get('year', 'N/A')}")
    lines.append(f"Trạng thái: {manga.get('status', 'N/A')}")

    # Description (first 500 chars)
    desc = manga.get("description", "")
    if desc:
        lines.append(f"Tóm tắt: {desc[:500]}{'...' if len(desc) > 500 else ''}")

    # Tags
    if tags:
        tag_names = [t.get("name", {}).get("en", "") for t in tags if t.get("name", {}).get("en")]
        if tag_names:
            lines.append(f"Thể loại/Tags: {', '.join(tag_names)}")

    return "\n".join(lines)


def _build_prompt(
    mode: str, manga_context: str, selected_text: str = "", existing_review: str = "", rewrite_style: str = ""
) -> str:
    if mode == "rewrite":
        style_instruction = (
            rewrite_style if rewrite_style else "Hãy viết lại hay hơn, kèm sửa lỗi văn phong, lỗi chính tả nếu có."
        )
        return f"""Bạn là một trợ lý viết bài review manga chuyên nghiệp bằng tiếng Việt.

Thông tin manga:
{manga_context}

Đoạn văn cần chỉnh sửa:
{selected_text}

Yêu cầu chỉnh sửa cụ thể: {style_instruction}

Hãy thực hiện yêu cầu chỉnh sửa trên đoạn văn. Giữ nguyên các ý chính và thông tin thực tế, chỉ cải thiện văn phong theo yêu cầu. Chỉ trả về duy nhất đoạn văn đã được chỉnh sửa hoàn chỉnh, không thêm lời giải thích hay bất kỳ ký tự thừa nào."""

    elif mode == "intro":
        return f"""Bạn là một nhà phê bình manga chuyên nghiệp viết bằng tiếng Việt.

Thông tin manga:
{manga_context}

{"Nội dung review hiện tại (để tham khảo ngữ cảnh):" + chr(10) + existing_review[:1000] if existing_review else ""}

Hãy viết một đoạn mở đầu review hấp dẫn và chuyên nghiệp cho manga này (khoảng 2-3 đoạn văn). Đoạn mở đầu nên thu hút người đọc và giới thiệu được điểm nổi bật của tác phẩm. Chỉ trả về đoạn văn, không thêm tiêu đề hay lời giải thích."""

    elif mode == "ideas":
        return f"""Bạn là một nhà phê bình manga chuyên nghiệp viết bằng tiếng Việt.

Thông tin manga:
{manga_context}

{"Nội dung review hiện tại (để tránh trùng lặp):" + chr(10) + existing_review[:1000] if existing_review else ""}

Hãy đề xuất 5-7 ý tưởng/góc nhìn độc đáo để phân tích và viết review cho manga này. Mỗi ý tưởng nên ngắn gọn (1-2 câu) và cụ thể. Trả về dạng danh sách có dấu gạch đầu dòng."""

    return ""


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token for Vietnamese/English mixed text."""
    return max(1, len(text) // 4)


async def call_gemini(
    mode: str,
    manga: dict,
    tags: list[dict] | None = None,
    selected_text: str = "",
    existing_review: str = "",
    rewrite_style: str = "",
) -> dict:
    """
    Call Gemini Flash API.
    Returns: {"result": str, "prompt": str, "estimated_tokens": int}
    """
    if not settings.gemini_api_key:
        raise ValueError("Gemini API key is not configured")

    manga_context = _build_manga_context(manga, tags)
    prompt = _build_prompt(mode, manga_context, selected_text, existing_review, rewrite_style)
    estimated_tokens = _estimate_tokens(prompt)

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.8,
            "maxOutputTokens": 2048,
        },
    }

    max_retries = 3
    retry_delay = 2.0  # seconds

    async with httpx.AsyncClient(timeout=60) as client:
        for attempt in range(max_retries):
            resp = await client.post(
                f"{GEMINI_API_URL}?key={settings.gemini_api_key}",
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code == 200:
                break
            # If rate limited or server error, sleep and retry
            if (resp.status_code == 429 or resp.status_code >= 500) and attempt < max_retries - 1:
                await asyncio.sleep(retry_delay * (2**attempt))
            else:
                break

    if resp.status_code != 200:
        raise RuntimeError(f"Gemini API error {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    try:
        result_text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Unexpected Gemini response structure: {e}")

    return {"result": result_text, "prompt": prompt, "estimated_tokens": estimated_tokens}
