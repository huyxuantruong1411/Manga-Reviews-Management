"""Recommendation Engine implementing Part 7 Mathematical Models (UC-3.7, UC-3.8, UC-3.9).

1. Implicit + Explicit Utility Score R_{u,i} in [0, 10]
2. Content-Based Cosine Similarity with Cold-Start Genre Fallback (UC-3.9)
3. Item-Based Adjusted Cosine Collaborative Filtering with Cold-Start Fallback (UC-3.7)
4. User-Based K-NN Collaborative Filtering excluding completed/dropped mangas (UC-3.8)
"""

from __future__ import annotations

import math
import re
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sanitization import strip_accents
from app.core.storage import storage_service
from app.models import (
    Creator,
    Manga,
    MangaCreator,
    MangaRating,
    MangaRecommendationsCache,
    MangaTag,
    MangaVisibilityStatus,
    ReadingList,
    ReadingListItem,
    ReadingStatusType,
    Tag,
    UserChapterRead,
    UserReadingStatus,
)


def _serialize_rec_item(m: Manga, **extra: Any) -> dict[str, Any]:
    """Serialize a recommended manga summary consistently across RecSys models."""
    return {
        "pool_manga_id": m.pool_manga_id,
        "slug": m.slug,
        "title": m.title,
        "cover_url": storage_service.build_media_url(m.cover_bucket, m.cover_object_key),
        "status": m.status.value if hasattr(m.status, "value") else str(m.status),
        "chapter_count": int(m.chapter_count),
        "average_rating": float(m.average_rating),
        "rating_count": int(m.rating_count),
        "view_count": int(m.view_count),
        **extra,
    }


STOP_WORDS = {
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "into",
    "his",
    "her",
    "they",
    "their",
    "cua",
    "nhung",
    "trong",
    "mot",
    "nguoi",
}


def extract_synopsis_tokens(description: str, max_terms: int = 25) -> dict[str, float]:
    """Extract normalized term frequencies from synopsis text."""
    text = strip_accents(description.lower())
    words = [w for w in re.findall(r"[a-z0-9]{3,}", text) if w not in STOP_WORDS]
    if not words:
        return {}
    counts = Counter(words).most_common(max_terms)
    max_c = counts[0][1] if counts else 1
    return {term: round(cnt / max_c, 4) for term, cnt in counts}


def build_content_feature_vector(
    tag_slugs: list[str],
    creator_ids: list[str],
    demographic: str,
    description: str,
) -> dict[str, Any]:
    """Build weighted sparse feature vector v_i = [alpha*tags, beta*creators, gamma*demo, delta*synopsis]."""
    features: dict[str, float] = {}
    for slug in tag_slugs:
        features[f"tag:{slug}"] = 2.0  # alpha = 2.0
    for cid in creator_ids:
        features[f"creator:{cid}"] = 1.8  # beta = 1.8
    if demographic and demographic != "unknown":
        features[f"demo:{demographic}"] = 1.2  # gamma = 1.2
    for term, weight in extract_synopsis_tokens(description).items():
        features[f"syn:{term}"] = round(0.8 * weight, 4)  # delta = 0.8

    return {
        "tags": sorted(set(tag_slugs)),
        "creators": sorted(set(creator_ids)),
        "demographic": demographic,
        "weights": features,
    }


def sparse_cosine_similarity(vec_a: dict[str, float], vec_b: dict[str, float]) -> float:
    """Compute Cosine Similarity between two sparse feature weight dictionaries."""
    if not vec_a or not vec_b:
        return 0.0
    common_keys = set(vec_a.keys()) & set(vec_b.keys())
    if not common_keys:
        return 0.0
    dot = sum(vec_a[k] * vec_b[k] for k in common_keys)
    norm_a = math.sqrt(sum(v * v for v in vec_a.values()))
    norm_b = math.sqrt(sum(v * v for v in vec_b.values()))
    if norm_a <= 1e-9 or norm_b <= 1e-9:
        return 0.0
    return round(dot / (norm_a * norm_b), 4)


async def update_manga_content_vector(
    db: AsyncSession,
    manga: Manga,
    tag_slugs: list[str] | None = None,
    creator_ids: list[str] | None = None,
) -> MangaRecommendationsCache:
    """Compute and upsert Content-Based feature vector for a manga right after ETL (UC-3.9 NFR1)."""
    if tag_slugs is None:
        tag_rows = (
            (
                await db.execute(
                    select(Tag.slug)
                    .join(MangaTag, MangaTag.tag_id == Tag.id)
                    .where(MangaTag.manga_id == manga.pool_manga_id)
                )
            )
            .scalars()
            .all()
        )
        tag_slugs = list(tag_rows)

    if creator_ids is None:
        creator_rows = (
            (
                await db.execute(
                    select(Creator.creator_id)
                    .join(MangaCreator, MangaCreator.creator_id == Creator.creator_id)
                    .where(MangaCreator.manga_id == manga.pool_manga_id)
                )
            )
            .scalars()
            .all()
        )
        creator_ids = list(creator_rows)

    demo_val = (
        manga.publication_demographic.value
        if hasattr(manga.publication_demographic, "value")
        else str(manga.publication_demographic)
    )
    vec = build_content_feature_vector(tag_slugs, creator_ids, demo_val, manga.description)

    now = datetime.now(timezone.utc)
    stmt = (
        pg_insert(MangaRecommendationsCache)
        .values(
            manga_id=manga.pool_manga_id,
            content_feature_vec=vec,
            content_based_ids=[],
            item_based_ids=[],
            computed_at=now,
        )
        .on_conflict_do_update(
            index_elements=["manga_id"],
            set_={
                "content_feature_vec": vec,
                "computed_at": now,
            },
        )
    )
    await db.execute(stmt)
    await db.commit()
    cache_row = await db.get(MangaRecommendationsCache, manga.pool_manga_id)
    return cache_row  # type: ignore[return-value]


async def compute_user_item_utility_matrix(
    db: AsyncSession,
    public_manga_ids: set[str],
    chapter_counts: dict[str, int],
) -> dict[str, dict[str, float]]:
    """Compute R_{u,i} in [0, 10] combining explicit ratings, chapter reads, and reading statuses/lists."""
    # R_{u,i} = 0.5 * S_rating + 0.3 * S_read + 0.2 * S_list (scaled to [0, 10] based on available signals)
    ratings_map: dict[tuple[str, str], float] = {}
    for r in (await db.execute(select(MangaRating))).scalars().all():
        if r.manga_id in public_manga_ids:
            ratings_map[(str(r.user_id), r.manga_id)] = float(r.score)

    read_counts: dict[tuple[str, str], int] = {}
    for cr in (await db.execute(select(UserChapterRead))).scalars().all():
        if cr.manga_id in public_manga_ids:
            key = (str(cr.user_id), cr.manga_id)
            read_counts[key] = read_counts.get(key, 0) + 1

    status_map: dict[tuple[str, str], ReadingStatusType] = {}
    for st in (await db.execute(select(UserReadingStatus))).scalars().all():
        if st.manga_id in public_manga_ids:
            status_map[(str(st.user_id), st.manga_id)] = st.status

    list_pairs: set[tuple[str, str]] = set()
    list_rows = (
        await db.execute(
            select(ReadingList.owner_id, ReadingListItem.manga_id).join(
                ReadingListItem, ReadingListItem.list_id == ReadingList.list_id
            )
        )
    ).all()
    for owner_id, mid in list_rows:
        if mid in public_manga_ids:
            list_pairs.add((str(owner_id), mid))

    all_pairs = set(ratings_map.keys()) | set(read_counts.keys()) | set(status_map.keys()) | list_pairs
    user_matrix: dict[str, dict[str, float]] = {}

    for uid, mid in all_pairs:
        s_rating = ratings_map.get((uid, mid))
        ch_read = read_counts.get((uid, mid), 0)
        total_ch = max(1, chapter_counts.get(mid, 1))
        s_read = min(10.0, 2.0 + 8.0 * (ch_read / total_ch)) if ch_read > 0 else 0.0

        st_val = status_map.get((uid, mid))
        if st_val == ReadingStatusType.dropped:
            s_list = 0.0
        elif (uid, mid) in list_pairs or st_val in (ReadingStatusType.reading, ReadingStatusType.completed):
            s_list = 8.0
        elif st_val is not None:
            s_list = 5.0
        else:
            s_list = 0.0

        if s_rating is not None:
            score = 0.6 * s_rating + 0.25 * (s_read or s_rating) + 0.15 * (s_list or s_rating)
        else:
            score = 0.65 * s_read + 0.35 * s_list

        if score > 0:
            user_matrix.setdefault(uid, {})[mid] = round(min(10.0, score), 3)

    return user_matrix


async def get_content_based_recommendations(
    db: AsyncSession,
    target_manga: Manga,
    limit: int = 10,
    theta_content: float = 0.15,
) -> dict[str, Any]:
    """UC-3.9: Content-Based Recommendations using Cosine Similarity + Cold-Start Genre Fallback."""
    public_mangas = (
        (
            await db.execute(
                select(Manga).where(
                    Manga.visibility_status == MangaVisibilityStatus.public,
                    Manga.pool_manga_id != target_manga.pool_manga_id,
                )
            )
        )
        .scalars()
        .all()
    )
    if not public_mangas:
        return {"model": "content_based", "is_fallback": True, "items": []}

    target_cache = await update_manga_content_vector(db, target_manga)
    target_weights: dict[str, float] = target_cache.content_feature_vec.get("weights", {})
    target_tags: set[str] = set(target_cache.content_feature_vec.get("tags", []))

    cache_rows = {r.manga_id: r for r in (await db.execute(select(MangaRecommendationsCache))).scalars().all()}

    scored: list[tuple[float, Manga]] = []
    for candidate in public_mangas:
        c_cache = cache_rows.get(candidate.pool_manga_id)
        if c_cache is None or not c_cache.content_feature_vec:
            c_cache = await update_manga_content_vector(db, candidate)
        c_weights = c_cache.content_feature_vec.get("weights", {})
        sim = sparse_cosine_similarity(target_weights, c_weights)
        if sim >= theta_content:
            scored.append((sim, candidate))

    await db.commit()

    if scored:
        scored.sort(key=lambda x: (x[0], float(x[1].average_rating), x[1].view_count), reverse=True)
        return {
            "model": "content_based",
            "is_fallback": False,
            "items": [_serialize_rec_item(m, similarity_score=sim) for sim, m in scored[:limit]],
        }

    # Cold-start Fallback (Activity Diagram UC-3.9): Top-rated public mangas sharing genre or overall top-rated
    fallback_candidates = sorted(
        public_mangas,
        key=lambda m: (
            len(set(cache_rows.get(m.pool_manga_id, target_cache).content_feature_vec.get("tags", [])) & target_tags),
            float(m.average_rating),
            m.view_count,
        ),
        reverse=True,
    )
    return {
        "model": "content_based",
        "is_fallback": True,
        "fallback_reason": "No candidate exceeded minimum cosine similarity threshold (0.15)",
        "items": [_serialize_rec_item(m, similarity_score=0.0) for m in fallback_candidates[:limit]],
    }


async def get_item_based_recommendations(
    db: AsyncSession,
    target_manga: Manga,
    limit: int = 10,
) -> dict[str, Any]:
    """UC-3.7: Item-Based Collaborative Filtering (Adjusted Cosine) with Cold-Start Fallback (< 3 users)."""
    all_public = (
        (await db.execute(select(Manga).where(Manga.visibility_status == MangaVisibilityStatus.public))).scalars().all()
    )
    public_map = {m.pool_manga_id: m for m in all_public}
    public_ids = set(public_map.keys()) | {target_manga.pool_manga_id}
    chapter_counts = {m.pool_manga_id: m.chapter_count for m in all_public}
    chapter_counts[target_manga.pool_manga_id] = target_manga.chapter_count

    user_matrix = await compute_user_item_utility_matrix(db, public_ids, chapter_counts)

    # Users who interacted with target_manga
    users_for_target = [uid for uid, items in user_matrix.items() if target_manga.pool_manga_id in items]
    if len(users_for_target) < 3:
        # Cold-start fallback to Content-Based (Activity Diagram UC-3.7)
        cb = await get_content_based_recommendations(db, target_manga, limit=limit)
        return {
            "model": "item_based",
            "is_cold_start_fallback": True,
            "interaction_user_count": len(users_for_target),
            "fallback_model": "content_based",
            "items": cb["items"],
        }

    # Compute mean utility score R_bar_u for each user
    user_means = {uid: sum(scores.values()) / len(scores) for uid, scores in user_matrix.items() if scores}

    scored: list[tuple[float, Manga]] = []
    target_id = target_manga.pool_manga_id

    for cand_id, cand_manga in public_map.items():
        if cand_id == target_id:
            continue
        co_users = [uid for uid in users_for_target if cand_id in user_matrix.get(uid, {})]
        if not co_users:
            continue
        num = sum(
            (user_matrix[u][target_id] - user_means[u]) * (user_matrix[u][cand_id] - user_means[u]) for u in co_users
        )
        den_i = math.sqrt(sum((user_matrix[u][target_id] - user_means[u]) ** 2 for u in co_users))
        den_j = math.sqrt(sum((user_matrix[u][cand_id] - user_means[u]) ** 2 for u in co_users))
        sim = num / (den_i * den_j + 1e-6)
        # If all ratings are identical around mean, fall back to direct cosine over co_users
        if abs(sim) < 1e-6 and den_i < 1e-5 and den_j < 1e-5:
            raw_num = sum(user_matrix[u][target_id] * user_matrix[u][cand_id] for u in co_users)
            raw_di = math.sqrt(sum(user_matrix[u][target_id] ** 2 for u in co_users))
            raw_dj = math.sqrt(sum(user_matrix[u][cand_id] ** 2 for u in co_users))
            sim = raw_num / (raw_di * raw_dj + 1e-6)
        if sim > 0:
            scored.append((round(sim, 4), cand_manga))

    if not scored:
        cb = await get_content_based_recommendations(db, target_manga, limit=limit)
        return {
            "model": "item_based",
            "is_cold_start_fallback": True,
            "interaction_user_count": len(users_for_target),
            "fallback_model": "content_based",
            "items": cb["items"],
        }

    scored.sort(key=lambda x: (x[0], float(x[1].average_rating), x[1].view_count), reverse=True)
    return {
        "model": "item_based",
        "is_cold_start_fallback": False,
        "interaction_user_count": len(users_for_target),
        "items": [_serialize_rec_item(m, similarity_score=sim) for sim, m in scored[:limit]],
    }


async def get_user_based_recommendations(
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int = 10,
    k_neighbors: int = 10,
) -> dict[str, Any]:
    """UC-3.8: User-Based Collaborative Filtering excluding completed/dropped mangas (UC-3.8 BR1)."""
    all_public = (
        (
            await db.execute(
                select(Manga)
                .where(Manga.visibility_status == MangaVisibilityStatus.public)
                .order_by(desc(Manga.average_rating), desc(Manga.view_count))
            )
        )
        .scalars()
        .all()
    )
    public_map = {m.pool_manga_id: m for m in all_public}
    public_ids = set(public_map.keys())
    chapter_counts = {m.pool_manga_id: m.chapter_count for m in all_public}

    user_matrix = await compute_user_item_utility_matrix(db, public_ids, chapter_counts)
    uid_str = str(user_id)
    my_items = user_matrix.get(uid_str, {})

    # Cold-start for new user without history/ratings (Activity Diagram UC-3.8)
    if not my_items:
        return {
            "model": "user_based",
            "is_cold_start": True,
            "message": "Hãy đọc hoặc chấm điểm một vài bộ truyện để nhận gợi ý cá nhân hóa chính xác hơn!",
            "items": [_serialize_rec_item(m, predicted_score=float(m.average_rating)) for m in all_public[:limit]],
        }

    # UC-3.8 BR1: Exclude mangas the user already marked as 'completed' or 'dropped'
    excluded_statuses = (
        (
            await db.execute(
                select(UserReadingStatus.manga_id).where(
                    UserReadingStatus.user_id == user_id,
                    UserReadingStatus.status.in_([ReadingStatusType.completed, ReadingStatusType.dropped]),
                )
            )
        )
        .scalars()
        .all()
    )
    excluded_ids = set(excluded_statuses)

    # Compute User-User Cosine Similarity
    norm_u = math.sqrt(sum(v * v for v in my_items.values()))
    neighbors: list[tuple[float, str]] = []
    for other_uid, other_items in user_matrix.items():
        if other_uid == uid_str or not other_items:
            continue
        common = set(my_items.keys()) & set(other_items.keys())
        if not common:
            continue
        dot = sum(my_items[i] * other_items[i] for i in common)
        norm_v = math.sqrt(sum(v * v for v in other_items.values()))
        sim = dot / (norm_u * norm_v + 1e-6)
        if sim > 0:
            neighbors.append((sim, other_uid))

    neighbors.sort(key=lambda x: x[0], reverse=True)
    top_k = neighbors[:k_neighbors]

    predictions: list[tuple[float, Manga]] = []
    for cand_id, cand_manga in public_map.items():
        if cand_id in excluded_ids or cand_id in my_items:
            continue
        num = 0.0
        den = 0.0
        for sim_uv, v_uid in top_k:
            r_vj = user_matrix[v_uid].get(cand_id)
            if r_vj is not None:
                num += sim_uv * r_vj
                den += abs(sim_uv)
        if den > 0:
            r_hat = round(num / (den + 1e-6), 3)
            predictions.append((r_hat, cand_manga))

    if not predictions:
        # Fallback to trending mangas not in excluded_ids
        fallback = [m for m in all_public if m.pool_manga_id not in excluded_ids and m.pool_manga_id not in my_items]
        return {
            "model": "user_based",
            "is_cold_start": False,
            "is_fallback": True,
            "items": [_serialize_rec_item(m, predicted_score=float(m.average_rating)) for m in fallback[:limit]],
        }

    predictions.sort(key=lambda x: (x[0], float(x[1].average_rating), x[1].view_count), reverse=True)
    return {
        "model": "user_based",
        "is_cold_start": False,
        "items": [_serialize_rec_item(m, predicted_score=pred) for pred, m in predictions[:limit]],
    }
