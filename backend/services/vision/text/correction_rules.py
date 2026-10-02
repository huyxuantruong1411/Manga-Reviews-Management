"""
correction_rules.py - Protected lexicons, proper names, and conservative normalization rules.
"""

from typing import Set

# Manga-specific protected lexicon: terms that must NEVER be split by wordninja or dictionary heuristics.
PROTECTED_LEXICON: Set[str] = {
    # Names from benchmark & report
    "inio",
    "asano",
    "bamboovian",
    "senpai",
    "kinoko",
    "takenoko",
    "kouhai",
    "sensei",
    "san",
    "kun",
    "chan",
    "sama",
    "shounen",
    "shojo",
    "seinen",
    "manga",
    "mangaka",
    "anime",
    "otaku",
    # Common sound effects / onomatopoeia
    "doki",
    "dokidoki",
    "waku",
    "nya",
    "kyaa",
    "uwaa",
}


def is_protected_token(word: str) -> bool:
    """Return True if word is in the protected manga vocabulary or is a proper noun."""
    if not word:
        return False
    w_clean = word.strip().lower()
    return w_clean in PROTECTED_LEXICON
