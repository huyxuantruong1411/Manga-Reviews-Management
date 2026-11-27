"""Phase 2 tests for TipTap plain text extraction and bilingual aspect mentions."""

from __future__ import annotations

from analytics.scripts.extract_review_features import (
    count_words_unicode,
    detect_language_profile,
    extract_aspect_spans,
    extract_tiptap_plain_text_and_counts,
)


def test_tiptap_extraction_preserves_vietnamese_and_omits_urls_media() -> None:
    doc = {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Đánh giá tổng quan"}]},
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "Nét vẽ rất đẹp và cốt truyện hấp dẫn https://example.com/secret-panel"},
                ],
            },
            {"type": "image", "attrs": {"src": "https://minio.local/private.png", "alt": "panel"}},
            {"type": "mangaReference", "attrs": {"id": "123", "title": "Berserk"}},
        ],
    }
    plain, counts = extract_tiptap_plain_text_and_counts(doc)
    assert "Nét vẽ rất đẹp" in plain
    assert "https://example.com" not in plain
    assert "Berserk" not in plain
    assert counts["image"] == 1
    assert counts["mangaReference"] == 1
    assert counts["paragraph"] == 1
    assert count_words_unicode(plain) == 13
    assert detect_language_profile(plain) == "vi"

    aspects = {a for a, _, _, _ in extract_aspect_spans(plain)}
    assert "art" in aspects
    assert "plot" in aspects


def test_english_aspect_detection() -> None:
    text = "Incredible world-building and sharp dialogue, though the pacing slows before the ending."
    assert detect_language_profile(text) == "en"
    aspects = {a for a, _, _, _ in extract_aspect_spans(text)}
    assert {"worldbuilding", "dialogue", "pacing", "ending"}.issubset(aspects)
