"""Offline Bronze-to-Silver TipTap Review Text & Aspect Feature Extractor.

Reads ONLY Bronze Parquet snapshots (never touches MongoDB).
Produces deterministic lexical metrics and controlled bilingual (EN/VI) aspect
mentions without exposing raw prose to Arrow or Gold marts.
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import os
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq
from bson import json_util

from analytics.scripts.extract_bronze import CANONICAL_JSON_OPTIONS, resolve_analytics_home

logger = logging.getLogger("analytics.extract_review_features")

TAXONOMY_VERSION = "1.0.0"
CLASSIFIER_METHOD = "bilingual_dictionary_v1"

URL_RE = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
VI_DIACRITIC_RE = re.compile(
    r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ"
    r"ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]"
)
SENTENCE_SPLIT_RE = re.compile(r"[.!?…]+(?:\s+|$)")

# Versioned controlled aspect taxonomy (bilingual EN + VI).
# Note: Only records observable textual mentions; never infers psychological traits or sentiment.
ASPECT_DICTIONARY: dict[str, list[str]] = {
    "art": [
        r"\bart(?:work|style)?\b",
        r"\bdrawing\b",
        r"\billustrat(?:ion|ions|ed)\b",
        r"\bpanel(?:ing|s)?\b",
        r"\bvisuals?\b",
        r"\bcharacter design\b",
        r"\bnét vẽ\b",
        r"\btranh vẽ\b",
        r"\bhình ảnh\b",
        r"\bmỹ thuật\b",
        r"\bbố cục\b",
        r"\bkhung tranh\b",
    ],
    "character": [
        r"\bcharacters?\b",
        r"\bprotagonist\b",
        r"\bantagonist\b",
        r"\bvillain\b",
        r"\bcast\b",
        r"\bhero(?:ine)?\b",
        r"\bnhân vật\b",
        r"\bnam chính\b",
        r"\bnữ chính\b",
        r"\bphản diện\b",
        r"\btính cách\b",
    ],
    "plot": [
        r"\bplot\b",
        r"\bstory(?:line)?\b",
        r"\bnarrative\b",
        r"\bpremise\b",
        r"\btwist\b",
        r"\bcốt truyện\b",
        r"\bnội dung\b",
        r"\bmạch truyện\b",
        r"\btình tiết\b",
        r"\bcao trào\b",
    ],
    "pacing": [
        r"\bpacing\b",
        r"\bpaced\b",
        r"\bslow burn\b",
        r"\brushed\b",
        r"\bdrag(?:s|ged|ging)?\b",
        r"\bnhịp độ\b",
        r"\bnhịp truyện\b",
        r"\bnhanh quá\b",
        r"\bchậm rãi\b",
        r"\blê thê\b",
        r"\bdài dòng\b",
    ],
    "worldbuilding": [
        r"\bworld[- ]?building\b",
        r"\bsetting\b",
        r"\blore\b",
        r"\buniverse\b",
        r"\bmagic system\b",
        r"\bthế giới\b",
        r"\bbối cảnh\b",
        r"\bhệ thống\b",
    ],
    "theme": [
        r"\bthemes?\b",
        r"\bmotif\b",
        r"\bsymbolism\b",
        r"\bmessage\b",
        r"\bphilosophy\b",
        r"\bchủ đề\b",
        r"\bthông điệp\b",
        r"\bý nghĩa\b",
        r"\btriết lý\b",
        r"\bnhân sinh\b",
    ],
    "dialogue": [
        r"\bdialogue\b",
        r"\bmonologue\b",
        r"\bwriting\b",
        r"\bprose\b",
        r"\bbanter\b",
        r"\bhội thoại\b",
        r"\blời thoại\b",
        r"\blời văn\b",
        r"\bcách viết\b",
    ],
    "ending": [
        r"\bending\b",
        r"\bconclusion\b",
        r"\bfinale\b",
        r"\bepilogue\b",
        r"\bclimax\b",
        r"\bkết thúc\b",
        r"\bđoạn kết\b",
        r"\bhồi kết\b",
        r"\bchương cuối\b",
    ],
    "emotion": [
        r"\bemotion(?:al|s)?\b",
        r"\bheartbreaking\b",
        r"\bmoving\b",
        r"\btouching\b",
        r"\bmelancholy\b",
        r"\bcảm xúc\b",
        r"\bcảm động\b",
        r"\bxúc động\b",
        r"\bnước mắt\b",
        r"\bám ảnh\b",
        r"\bđồng cảm\b",
    ],
    "adaptation": [
        r"\badaptation\b",
        r"\banime\b",
        r"\btranslation\b",
        r"\bscanlation\b",
        r"\bchuyển thể\b",
        r"\bbản dịch\b",
        r"\bhoạt hình\b",
    ],
}

COMPILED_ASPECTS: dict[str, list[re.Pattern[str]]] = {
    aspect: [re.compile(pat, re.IGNORECASE | re.UNICODE) for pat in patterns]
    for aspect, patterns in ASPECT_DICTIONARY.items()
}

REVIEW_TEXT_PRIVATE_SCHEMA = pa.schema(
    [
        pa.field("review_id", pa.string(), nullable=False),
        pa.field("manga_id", pa.string(), nullable=False),
        pa.field("snapshot_date", pa.date32(), nullable=False),
        pa.field("plain_text_private", pa.string(), nullable=False),
        pa.field("plain_text_sha256", pa.string(), nullable=False),
        pa.field("word_count", pa.int64(), nullable=False),
        pa.field("char_count", pa.int64(), nullable=False),
        pa.field("paragraph_count", pa.int64(), nullable=False),
        pa.field("sentence_count", pa.int64(), nullable=False),
        pa.field("heading_count", pa.int64(), nullable=False),
        pa.field("blockquote_count", pa.int64(), nullable=False),
        pa.field("bullet_list_count", pa.int64(), nullable=False),
        pa.field("ordered_list_count", pa.int64(), nullable=False),
        pa.field("image_node_count", pa.int64(), nullable=False),
        pa.field("manga_ref_count", pa.int64(), nullable=False),
        pa.field("language_profile", pa.string(), nullable=False),
    ]
)

REVIEW_FEATURE_SCHEMA = pa.schema(
    [
        pa.field("review_id", pa.string(), nullable=False),
        pa.field("manga_id", pa.string(), nullable=False),
        pa.field("snapshot_date", pa.date32(), nullable=False),
        pa.field("plain_text_sha256", pa.string(), nullable=False),
        pa.field("word_count", pa.int64(), nullable=False),
        pa.field("char_count", pa.int64(), nullable=False),
        pa.field("paragraph_count", pa.int64(), nullable=False),
        pa.field("sentence_count", pa.int64(), nullable=False),
        pa.field("heading_count", pa.int64(), nullable=False),
        pa.field("blockquote_count", pa.int64(), nullable=False),
        pa.field("bullet_list_count", pa.int64(), nullable=False),
        pa.field("ordered_list_count", pa.int64(), nullable=False),
        pa.field("image_node_count", pa.int64(), nullable=False),
        pa.field("manga_ref_count", pa.int64(), nullable=False),
        pa.field("language_profile", pa.string(), nullable=False),
        pa.field("taxonomy_version", pa.string(), nullable=False),
        pa.field("classifier_method", pa.string(), nullable=False),
    ]
)

REVIEW_ASPECT_MENTIONS_SCHEMA = pa.schema(
    [
        pa.field("review_id", pa.string(), nullable=False),
        pa.field("manga_id", pa.string(), nullable=False),
        pa.field("snapshot_date", pa.date32(), nullable=False),
        pa.field("aspect", pa.string(), nullable=False),
        pa.field("mention_seq", pa.int64(), nullable=False),
        pa.field("span_start", pa.int64(), nullable=False),
        pa.field("span_end", pa.int64(), nullable=False),
        pa.field("confidence", pa.float64(), nullable=False),
        pa.field("classifier_method", pa.string(), nullable=False),
        pa.field("taxonomy_version", pa.string(), nullable=False),
        pa.field("sentiment_enabled", pa.bool_(), nullable=False),
    ]
)


def extract_tiptap_plain_text_and_counts(node: Any) -> tuple[str, Counter[str]]:
    """Extract clean plain text from TipTap JSON while counting structural/omitted nodes.

    Consistent with backend/services/review_export_service.py::tiptap_to_plain_text,
    excluding image, mangaReference, and URL text from lexical counts.
    """
    node_counts: Counter[str] = Counter()

    def _walk(cur: Any) -> str:
        if not isinstance(cur, dict):
            return ""
        ntype = cur.get("type")
        if isinstance(ntype, str):
            node_counts[ntype] += 1

        if ntype == "text":
            return str(cur.get("text") or "")
        if ntype == "hardBreak":
            return "\n"
        if ntype in {"image", "mangaReference", "horizontalRule", "youtube"}:
            return ""

        parts: list[str] = []
        for child in cur.get("content") or []:
            extracted = _walk(child)
            if extracted:
                parts.append(extracted)

        if ntype == "paragraph":
            joined = "".join(parts).strip()
            return re.sub(r" +", " ", joined)
        if ntype in {"doc", "bulletList", "orderedList", "blockquote"}:
            return "\n\n".join(p for p in parts if p).strip()
        if ntype == "heading":
            return " ".join(p.strip() for p in parts if p.strip())
        joined = "".join(parts).strip()
        return re.sub(r" +", " ", joined)

    raw_plain = _walk(node)
    # Strip URLs from lexical counts while preserving Vietnamese diacritics
    cleaned_plain = URL_RE.sub(" ", raw_plain)
    cleaned_plain = re.sub(r"[ \t]+", " ", cleaned_plain).strip()
    return cleaned_plain, node_counts


def count_words_unicode(text: str) -> int:
    if not text:
        return 0
    cleaned = re.sub(r"[#*_~`\[\]\(\)\<\>|\\-]+", " ", text)
    return len([w for w in cleaned.split() if w.strip()])


def count_sentences(text: str) -> int:
    if not text.strip():
        return 0
    parts = [s.strip() for s in SENTENCE_SPLIT_RE.split(text.strip()) if s.strip()]
    return len(parts)


def detect_language_profile(text: str) -> str:
    if not text.strip():
        return "unknown"
    vi_chars = len(VI_DIACRITIC_RE.findall(text))
    alpha_chars = sum(1 for c in text if c.isalpha())
    if alpha_chars == 0:
        return "unknown"
    vi_ratio = vi_chars / alpha_chars
    if vi_ratio >= 0.05:
        return "vi"
    if vi_ratio > 0:
        return "mixed"
    return "en"


def extract_aspect_spans(text: str) -> list[tuple[str, int, int, float]]:
    """Return deduplicated non-overlapping aspect evidence spans."""
    if not text:
        return []
    hits: list[tuple[str, int, int, float]] = []
    for aspect, patterns in COMPILED_ASPECTS.items():
        seen_spans: set[tuple[int, int]] = set()
        for pattern in patterns:
            for m in pattern.finditer(text):
                span = (m.start(), m.end())
                if span not in seen_spans:
                    seen_spans.add(span)
                    hits.append((aspect, m.start(), m.end(), 0.85))
    return hits


def run_review_feature_extraction(analytics_home: Path | None = None) -> dict[str, int]:
    home = resolve_analytics_home(analytics_home)
    bronze_reviews_dir = home / "lake" / "bronze" / "reviews"
    parquet_files = sorted(bronze_reviews_dir.glob("dt=*/data.parquet"))
    if not parquet_files:
        raise FileNotFoundError(f"No Bronze reviews Parquet found under {bronze_reviews_dir}")

    # Load all partitions and select latest snapshot per review_id
    latest_by_id: dict[str, dict[str, Any]] = {}
    for pf in parquet_files:
        table = pq.read_table(pf)
        for row in table.to_pylist():
            rid = row["_source_id"]
            snap_dt = row["_snapshot_date"]
            doc = json_util.loads(row["_document_ejson"], json_options=CANONICAL_JSON_OPTIONS)
            updated_at = doc.get("updated_at") or doc.get("created_at") or row["_ingested_at"]
            prev = latest_by_id.get(rid)
            if prev is None or (snap_dt, updated_at) >= (prev["snapshot_date"], prev["updated_at"]):
                latest_by_id[rid] = {
                    "review_id": rid,
                    "snapshot_date": snap_dt,
                    "updated_at": updated_at,
                    "doc": doc,
                }

    private_rows: list[dict[str, Any]] = []
    feature_rows: list[dict[str, Any]] = []
    mention_rows: list[dict[str, Any]] = []

    for rid, item in latest_by_id.items():
        doc = item["doc"]
        if doc.get("is_deleted") is True:
            continue

        manga_id = str(doc.get("manga_id") or "")
        snap_dt = item["snapshot_date"]
        plain_text, node_counts = extract_tiptap_plain_text_and_counts(doc.get("content_json") or {})
        text_sha = hashlib.sha256(plain_text.encode("utf-8")).hexdigest()
        w_count = count_words_unicode(plain_text)
        c_count = len(plain_text)
        p_count = node_counts.get("paragraph", 0)
        s_count = count_sentences(plain_text)
        lang_prof = detect_language_profile(plain_text)

        base_feats = {
            "review_id": rid,
            "manga_id": manga_id,
            "snapshot_date": snap_dt,
            "plain_text_sha256": text_sha,
            "word_count": w_count,
            "char_count": c_count,
            "paragraph_count": p_count,
            "sentence_count": s_count,
            "heading_count": node_counts.get("heading", 0),
            "blockquote_count": node_counts.get("blockquote", 0),
            "bullet_list_count": node_counts.get("bulletList", 0),
            "ordered_list_count": node_counts.get("orderedList", 0),
            "image_node_count": node_counts.get("image", 0),
            "manga_ref_count": node_counts.get("mangaReference", 0),
            "language_profile": lang_prof,
        }
        private_rows.append({**base_feats, "plain_text_private": plain_text})
        feature_rows.append(
            {
                **base_feats,
                "taxonomy_version": TAXONOMY_VERSION,
                "classifier_method": CLASSIFIER_METHOD,
            }
        )

        spans = extract_aspect_spans(plain_text)
        aspect_seq: Counter[str] = Counter()
        for aspect, start_idx, end_idx, conf in spans:
            aspect_seq[aspect] += 1
            mention_rows.append(
                {
                    "review_id": rid,
                    "manga_id": manga_id,
                    "snapshot_date": snap_dt,
                    "aspect": aspect,
                    "mention_seq": aspect_seq[aspect],
                    "span_start": start_idx,
                    "span_end": end_idx,
                    "confidence": conf,
                    "classifier_method": CLASSIFIER_METHOD,
                    "taxonomy_version": TAXONOMY_VERSION,
                    "sentiment_enabled": False,
                }
            )

    out_dir = home / "staging" / "silver_private"
    out_dir.mkdir(parents=True, exist_ok=True)

    outputs = [
        ("review_text_private.parquet", private_rows, REVIEW_TEXT_PRIVATE_SCHEMA),
        ("review_aspect_features.parquet", feature_rows, REVIEW_FEATURE_SCHEMA),
        ("review_aspect_mentions.parquet", mention_rows, REVIEW_ASPECT_MENTIONS_SCHEMA),
    ]
    for fname, rows, schema in outputs:
        final_path = out_dir / fname
        tmp_path = out_dir / f".{fname}.tmp"
        tbl = pa.Table.from_pylist(rows, schema=schema)
        pq.write_table(tbl, tmp_path, compression="zstd")
        os.replace(tmp_path, final_path)

    return {
        "active_reviews": len(feature_rows),
        "aspect_mentions": len(mention_rows),
    }


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="Extract private TipTap review text features from Bronze Parquet.")
    parser.add_argument("--analytics-home", type=Path, default=None)
    args = parser.parse_args(argv)
    stats = run_review_feature_extraction(analytics_home=args.analytics_home)
    logger.info("Review feature extraction complete: %s", stats)
    return 0


if __name__ == "__main__":
    sys.exit(main())
