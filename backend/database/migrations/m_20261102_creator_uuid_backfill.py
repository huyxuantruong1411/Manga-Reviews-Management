"""Migration: Backfill canonical creator_id (UUID) and slug on creators, mangas, and Data Lake Pool."""

from pymongo import DeleteOne, UpdateOne

from backend.database.connection import get_db, get_pool_db
from backend.services.creator_service import (
    deterministic_creator_uuid,
    extract_creator_links,
    slugify_creator_name,
    split_creator_names,
)
from backend.services.datalake_pool_service import datalake_pool_service


async def upgrade() -> dict:
    """Backfill creator_id, slug, links on db.creators, creators[] on db.mangas, and sync pool_creators."""
    db = get_db()
    pool_db = get_pool_db()

    # 1. Backfill db.creators (and deduplicate any legacy rows that share the exact same creator_id)
    all_creators = await db.creators.find({}).to_list(length=50000)
    creator_ops = []
    seen_creator_ids: set[str] = set()
    by_name_lower: dict[str, list[dict]] = {}

    for c in all_creators:
        name = str(c.get("name") or "").strip()
        if not name:
            continue
        dex_id = str(c.get("mangadex_id") or "").strip() or None
        cid = str(c.get("creator_id") or "").strip() or deterministic_creator_uuid(name, dex_id)
        if cid in seen_creator_ids:
            creator_ops.append(DeleteOne({"_id": c["_id"]}))
            continue
        seen_creator_ids.add(cid)

        slug = str(c.get("slug") or "").strip() or slugify_creator_name(name)
        links = extract_creator_links(c)

        c["creator_id"] = cid
        c["slug"] = slug
        c["links"] = links
        by_name_lower.setdefault(name.lower(), []).append(c)

        creator_ops.append(
            UpdateOne(
                {"_id": c["_id"]},
                {"$set": {"creator_id": cid, "slug": slug, "links": links}},
            )
        )

    if creator_ops:
        await db.creators.bulk_write(creator_ops, ordered=False)

    # 2. Backfill db.mangas
    all_mangas = await db.mangas.find({}).to_list(length=50000)
    manga_ops = []
    for m in all_mangas:
        existing_refs = [r for r in (m.get("creators") or []) if isinstance(r, dict) and r.get("name")]
        existing_by_name_role = {
            (str(r.get("name", "")).strip().lower(), str(r.get("role", "")).strip().lower()): r for r in existing_refs
        }

        seen_id_role: set[tuple[str, str]] = set()
        resolved_refs: list[dict] = []

        for role in ("author", "artist"):
            for name in split_creator_names(m.get(role)):
                name_lower = name.lower()
                prior = existing_by_name_role.get((name_lower, role))
                matched_creators = by_name_lower.get(name_lower) or []

                if prior and prior.get("mangadex_id"):
                    dex_id = str(prior["mangadex_id"]).strip()
                    cid = str(prior.get("creator_id") or dex_id).strip()
                    slug = str(prior.get("slug") or "").strip() or slugify_creator_name(name)
                    if (cid, role) not in seen_id_role:
                        seen_id_role.add((cid, role))
                        resolved_refs.append(
                            {
                                "creator_id": cid,
                                "mangadex_id": dex_id,
                                "name": name,
                                "slug": slug,
                                "role": role,
                            }
                        )
                elif matched_creators:
                    for mc in matched_creators:
                        dex_id = str(mc.get("mangadex_id") or "").strip() or None
                        cid = str(mc.get("creator_id") or "").strip() or deterministic_creator_uuid(name, dex_id)
                        slug = str(mc.get("slug") or "").strip() or slugify_creator_name(name)
                        if (cid, role) not in seen_id_role:
                            seen_id_role.add((cid, role))
                            resolved_refs.append(
                                {
                                    "creator_id": cid,
                                    "mangadex_id": dex_id,
                                    "name": str(mc.get("name") or name).strip(),
                                    "slug": slug,
                                    "role": role,
                                }
                            )
                else:
                    cid = deterministic_creator_uuid(name, None)
                    slug = slugify_creator_name(name)
                    if (cid, role) not in seen_id_role:
                        seen_id_role.add((cid, role))
                        resolved_refs.append(
                            {
                                "creator_id": cid,
                                "mangadex_id": None,
                                "name": name,
                                "slug": slug,
                                "role": role,
                            }
                        )

        manga_ops.append(
            UpdateOne(
                {"_id": m["_id"]},
                {"$set": {"creators": resolved_refs}},
            )
        )

    if manga_ops:
        await db.mangas.bulk_write(manga_ops, ordered=False)

    # 3. Sync Data Lake Pool mangas and pool_creators catalog
    pool_mangas = await pool_db.pool_mangas.find({}).to_list(length=10000)
    for pm in pool_mangas:
        denorm_creators = await datalake_pool_service._build_denormalized_creators_for_manga(pm, db)
        await pool_db.pool_mangas.update_one(
            {"pool_manga_id": pm["pool_manga_id"]},
            {"$set": {"creators": denorm_creators}},
        )
    await datalake_pool_service._sync_pool_creators_catalog()

    return {
        "updated_creators": len(creator_ops),
        "updated_mangas": len(manga_ops),
        "updated_pool_mangas": len(pool_mangas),
    }


async def downgrade() -> None:
    """Remove backfilled creator_id/slug fields if rolling back."""
    db = get_db()
    await db.mangas.update_many({}, {"$unset": {"creators": ""}})
