"""Local MongoDB BSON backup and isolated restore drill (never restores over a live DB).

Run from repository root with the backend environment. The output must be outside
the repository. Quiesce application writers before --writers-paused; otherwise the
manifest explicitly records a best-effort live snapshot rather than a consistent one.
"""

import argparse
import hashlib
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from bson import BSON, decode_file_iter, json_util
from pymongo import IndexModel, MongoClient

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from backend.config import settings  # noqa: E402


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def backup(database, directory: Path, *, writers_paused: bool = False) -> dict:
    directory = directory.resolve()
    if directory == REPO_ROOT or REPO_ROOT in directory.parents:
        raise ValueError("Backups must be outside the repository")
    directory.mkdir(parents=True, exist_ok=False)
    manifest = {
        "version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_database": database.name,
        "consistency": "writers_paused" if writers_paused else "best_effort_live",
        "collections": [],
    }
    for number, info in enumerate(database.list_collections()):
        if info.get("type") != "collection" or info["name"].startswith("system."):
            continue
        collection = database[info["name"]]
        filename = f"collection-{number:04d}.bson"
        count = 0
        with (directory / filename).open("xb") as stream:
            for document in collection.find({}).batch_size(200):
                stream.write(BSON.encode(document))
                count += 1
        manifest["collections"].append(
            {
                "name": info["name"],
                "file": filename,
                "count": count,
                "sha256": file_hash(directory / filename),
                "options": info.get("options", {}),
                "indexes": list(collection.list_indexes()),
            }
        )
        print(f"Backed up collection {number}: {count} documents", flush=True)
    # Only a fully written backup gets a final manifest.
    (directory / "manifest.json").write_text(json_util.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def restore_drill(client, directory: Path) -> dict:
    directory = directory.resolve()
    manifest = json_util.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("version") != 1:
        raise ValueError("Unsupported backup format")
    for item in manifest["collections"]:
        candidate = (directory / item["file"]).resolve()
        if candidate.parent != directory or file_hash(candidate) != item["sha256"]:
            raise ValueError("Backup path/hash verification failed before restore")
    target_name = f"manga_restore_drill_{uuid.uuid4().hex}"
    if target_name in client.list_database_names():
        raise ValueError("Restore target already exists")
    target = client[target_name]
    checked = 0
    try:
        for item in manifest["collections"]:
            collection = target.create_collection(item["name"], **item.get("options", {}))
            with (directory / item["file"]).open("rb") as stream:
                batch = []
                for document in decode_file_iter(stream):
                    batch.append(document)
                    if len(batch) == 200:
                        collection.insert_many(batch)
                        batch = []
                if batch:
                    collection.insert_many(batch)
            indexes = [
                IndexModel(
                    list(index["key"].items()),
                    **{key: value for key, value in index.items() if key not in {"key", "v", "ns"}},
                )
                for index in item["indexes"]
                if index["name"] != "_id_"
            ]
            if indexes:
                collection.create_indexes(indexes)
            if collection.count_documents({}) != item["count"]:
                raise ValueError("Restore count mismatch")
            # Verify all restored documents by primary key, including BSON types.
            with (directory / item["file"]).open("rb") as stream:
                for original in decode_file_iter(stream):
                    if collection.find_one({"_id": original["_id"]}) != original:
                        raise ValueError("Restored document differs from backup")
            checked += 1
        result = {"status": "verified", "collections": checked, "temporary_database": target_name}
        (directory / "restore-verification.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        return result
    finally:
        # This name was generated here and checked absent; never accept a caller's DB to drop.
        if not target_name.startswith("manga_restore_drill_") or target_name == settings.database_name:
            raise RuntimeError("Refusing unsafe drill cleanup")
        client.drop_database(target_name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("backup", "verify"))
    parser.add_argument("directory", type=Path)
    parser.add_argument("--writers-paused", action="store_true")
    args = parser.parse_args()
    with MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000) as client:
        if args.action == "backup":
            manifest = backup(client[settings.database_name], args.directory, writers_paused=args.writers_paused)
            print(f"Backup complete: {len(manifest['collections'])} collections; {manifest['consistency']}")
        else:
            print(json.dumps(restore_drill(client, args.directory)))


if __name__ == "__main__":
    main()
