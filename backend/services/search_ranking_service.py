import re
from datetime import datetime
from typing import Any, List


def calculate_relevance_score(doc: dict, search: str) -> float:
    """Calculate an Information Retrieval (IR) relevance score for a manga document

    against a user search query.
    Signals incorporate:
    1. Exact full-match bonus (Title > Alt-titles)
    2. Exact prefix match (Word boundary > Raw)
    3. Contiguous exact phrase match (Title > Alt-titles > Author/Artist)
    4. Multi-word coverage & Proximity (Span distance between query terms)
    5. Term frequency & Field weighting (Title > Alt-titles > Author/Artist)
    6. Length density penalty (BM25 document length normalization)
    """
    if not search:
        return 0.0
    q = search.strip().lower()
    if not q:
        return 0.0

    words = [w for w in q.split() if w]
    if not words:
        return 0.0

    title_raw = str(doc.get("title", "") or "")
    title = title_raw.strip().lower()

    clean_alts: List[str] = []
    for a in doc.get("alt_titles", []) or []:
        val = str(a or "")
        if "|" in val:
            val = val.split("|", 1)[1]
        val = val.strip().lower()
        if val:
            clean_alts.append(val)

    author = str(doc.get("author", "") or "").strip().lower()
    artist = str(doc.get("artist", "") or "").strip().lower()

    score = 0.0

    # Normalized versions without punctuation for fuzzy punctuation tolerance
    t_norm = re.sub(r"[^\w\s]", "", title)
    q_norm = re.sub(r"[^\w\s]", "", q)

    # 1. Exact match (Verbatim / Highest Priority)
    if title == q:
        score += 20000.0
    elif any(a == q for a in clean_alts):
        score += 10000.0
    elif t_norm and t_norm == q_norm:
        score += 15000.0
    elif any(re.sub(r"[^\w\s]", "", a) == q_norm for a in clean_alts if q_norm):
        score += 8000.0

    # 2. Prefix match
    if title.startswith(q):
        if len(title) == len(q) or title[len(q)] in " :-,.~_()[]":
            score += 8000.0
        else:
            score += 6000.0
    elif any(a.startswith(q) for a in clean_alts):
        score += 4000.0
    elif t_norm and q_norm and t_norm.startswith(q_norm):
        score += 5000.0

    # 3. Exact phrase match
    q_bound = rf"\b{re.escape(q)}\b"
    if re.search(q_bound, title):
        score += 5000.0
    elif q in title:
        score += 3500.0
    elif any(re.search(q_bound, a) for a in clean_alts):
        score += 2500.0
    elif any(q in a for a in clean_alts):
        score += 1500.0
    elif q in author or q in artist:
        score += 800.0

    # 4. Multi-word all-in-field match & Proximity
    if len(words) > 1:
        word_spans = []
        for w in words:
            m = re.search(rf"\b{re.escape(w)}\b", title)
            if not m:
                m = re.search(re.escape(w), title)
            if m:
                word_spans.append(m.span())

        if len(word_spans) == len(words):
            # All words exist in title
            all_bound = all(re.search(rf"\b{re.escape(w)}\b", title) for w in words)
            score += 3000.0 if all_bound else 2000.0
            # Proximity calculation: closer words score higher
            min_start = min(s[0] for s in word_spans)
            max_end = max(s[1] for s in word_spans)
            span_len = max_end - min_start
            proximity = max(0.0, 1000.0 - max(0, span_len - len(q)) * 25.0)
            score += proximity
        else:
            # Check alt_titles for all words in the same alt_title
            for a in clean_alts:
                if all(w in a for w in words):
                    score += 1200.0
                    break

    # 5. Individual word matches & field weights
    for w in words:
        w_bound = rf"\b{re.escape(w)}\b"
        w_prefix = rf"\b{re.escape(w)}"
        if re.search(w_bound, title):
            score += 400.0
        elif re.search(w_prefix, title):
            score += 200.0
        elif w in title:
            score += 80.0

        if any(re.search(w_bound, a) for a in clean_alts):
            score += 150.0
        elif any(w in a for a in clean_alts):
            score += 50.0

        if re.search(w_bound, author) or re.search(w_bound, artist):
            score += 60.0
        elif w in author or w in artist:
            score += 20.0

    # 6. Title Length / Information Density (BM25 field length normalization)
    # Shorter titles where the query terms dominate rank higher than long diluted titles
    if title:
        density = len(q) / max(len(title), len(q))
        score += density * 500.0

    return score


def _get_secondary_sort_key(doc: dict, sort_by: str) -> Any:
    val = doc.get(sort_by)
    if val is None:
        return ""
    if isinstance(val, (int, float)):
        return val
    if isinstance(val, datetime):
        return val.timestamp()
    return str(val).lower()


def rank_manga_search_results(
    docs: List[dict],
    search: str,
    sort_by: str = "added_at",
    sort_order: str = "desc",
) -> List[dict]:
    """Rank manga search results primarily by relevance score, using the user's

    chosen sort field as a deterministic tie-breaker.
    Preserves all documents (zero documents dropped).
    """
    if not docs:
        return []
    if not search or not search.strip():
        return docs

    is_desc = sort_order.lower() == "desc"

    scored_items = []
    for doc in docs:
        score = calculate_relevance_score(doc, search)
        sec_key = _get_secondary_sort_key(doc, sort_by)
        scored_items.append((score, sec_key, doc))

    # Python sort is stable (Timsort).
    # First sort by secondary key:
    scored_items.sort(key=lambda item: item[1], reverse=is_desc)
    # Then sort by primary relevance score descending:
    scored_items.sort(key=lambda item: item[0], reverse=True)

    return [item[2] for item in scored_items]
