import logging
from datetime import datetime, timedelta
from typing import Any, Dict
from urllib.parse import quote

import httpx

from backend.database.connection import get_db

logger = logging.getLogger("dictionary_service")

DICTIONARY_API_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/{word}"


class DictionaryService:
    def __init__(self):
        self.headers = {
            "User-Agent": "MangaReviewsManagement/1.0 (language-panel-tool)",
            "Accept": "application/json",
        }

    def _get_cache_col(self):
        return get_db().dictionary_cache

    async def get_definition(self, word: str) -> Dict[str, Any]:
        """
        Fetch definition for a word, first checking MongoDB dictionary_cache,
        then querying Free Dictionary API.
        """
        clean_word = word.strip().lower()
        if not clean_word:
            return {"word": "", "phonetic": "", "audio_url": "", "meanings": []}

        # 1. Check local MongoDB cache
        try:
            cached = await self._get_cache_col().find_one({"word": clean_word})
            if cached and cached.get("cached_at", datetime.min) > datetime.utcnow() - timedelta(days=30):
                return {
                    "word": cached.get("word", clean_word),
                    "phonetic": cached.get("phonetic", ""),
                    "audio_url": cached.get("audio_url", ""),
                    "meanings": cached.get("meanings", []),
                    "cached": True,
                    "status": cached.get("status", "ok"),
                }
        except Exception as e:
            logger.warning(f"Error checking dictionary cache for '{clean_word}': {e}")

        # 2. Query Free Dictionary API with short timeout and fallback
        try:
            async with httpx.AsyncClient(timeout=2.5) as client:
                url = DICTIONARY_API_URL.format(word=quote(clean_word, safe=""))
                resp = await client.get(url, headers=self.headers)

                if resp.status_code == 200:
                    data = resp.json()
                    parsed = self._parse_api_response(clean_word, data)
                    parsed["status"] = "ok"
                    await self._save_to_cache(clean_word, parsed)
                    return parsed
                elif resp.status_code == 404:
                    fallback = {
                        "word": clean_word,
                        "phonetic": "",
                        "audio_url": "",
                        "meanings": [],
                        "status": "not_found",
                    }
                    await self._save_to_cache(clean_word, fallback)
                    return fallback
        except Exception as e:
            logger.debug(f"Dictionary API unavailable for '{clean_word}': {e}")

        # 3. Offline / network fallback
        return {
            "word": clean_word,
            "phonetic": "",
            "audio_url": "",
            "meanings": [],
            "status": "unavailable",
        }

    def _parse_api_response(self, word: str, data: list) -> Dict[str, Any]:
        phonetic = ""
        audio_url = ""
        meanings = []

        if not data or not isinstance(data, list):
            return {"word": word, "phonetic": "", "audio_url": "", "meanings": []}

        entry = data[0]

        # Extract phonetic text
        if entry.get("phonetic"):
            phonetic = entry["phonetic"]
        elif entry.get("phonetics") and isinstance(entry["phonetics"], list):
            for ph in entry["phonetics"]:
                if ph.get("text"):
                    phonetic = ph["text"]
                    break

        # Extract audio URL
        if entry.get("phonetics") and isinstance(entry["phonetics"], list):
            for ph in entry["phonetics"]:
                if ph.get("audio"):
                    audio_url = ph["audio"]
                    break

        # Extract meanings
        if entry.get("meanings") and isinstance(entry["meanings"], list):
            for m in entry["meanings"]:
                pos = m.get("partOfSpeech", "unknown")
                defs = m.get("definitions", [])
                for d in defs[:2]:  # Limit to top 2 definitions per POS
                    meanings.append(
                        {
                            "part_of_speech": pos,
                            "definition": d.get("definition", ""),
                            "example": d.get("example", ""),
                        }
                    )

        return {
            "word": word,
            "phonetic": phonetic,
            "audio_url": audio_url,
            "meanings": meanings,
        }

    async def _save_to_cache(self, word: str, data: Dict[str, Any]):
        try:
            await self._get_cache_col().update_one(
                {"word": word},
                {
                    "$set": {
                        "word": word,
                        "phonetic": data.get("phonetic", ""),
                        "audio_url": data.get("audio_url", ""),
                        "meanings": data.get("meanings", []),
                        "cached_at": datetime.utcnow(),
                        "status": data.get("status", "ok"),
                    }
                },
                upsert=True,
            )
        except Exception as e:
            logger.warning(f"Error saving dictionary cache for '{word}': {e}")


dictionary_service = DictionaryService()
