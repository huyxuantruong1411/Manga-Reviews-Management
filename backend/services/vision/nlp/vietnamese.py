"""
vietnamese.py - Vietnamese Language Processor with accent stripping and honest POS tagging.
"""

import re
import unicodedata
from typing import List, Optional

from backend.services.vision.nlp.base import LanguageProcessor
from backend.services.vision.types import LinguisticToken


def strip_vietnamese_accents(text: str) -> str:
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text)
    stripped = "".join(c for c in nfkd if not unicodedata.combining(c))
    return stripped.replace("đ", "d").replace("Đ", "D")


class VietnameseLanguageProcessor(LanguageProcessor):
    """
    Vietnamese tokenizer and vocabulary extractor.
    Does NOT pretend to have deep POS tagging without a dedicated treebank model.
    """

    def analyze(
        self,
        text: str,
        source_region_id: Optional[str] = None,
    ) -> List[LinguisticToken]:
        if not text or not text.strip():
            return []

        # Extract words matching Vietnamese characters
        raw_words = re.findall(r"[A-Za-zÀ-ỹĐđ]+", text)
        tokens: List[LinguisticToken] = []

        pos_tracker = 0
        for w in raw_words:
            w_clean = w.strip()
            if len(w_clean) < 2:
                continue

            start_char = text.find(w_clean, pos_tracker)
            if start_char == -1:
                start_char = 0
            end_char = start_char + len(w_clean)
            pos_tracker = end_char

            tokens.append(
                LinguisticToken(
                    surface=w_clean,
                    lemma=w_clean.lower(),
                    pos="TOKEN",  # Honest POS indicator
                    is_stopword=False,
                    source_text_region_id=source_region_id,
                    start_char=start_char,
                    end_char=end_char,
                    quality_score=0.90,
                )
            )

        return tokens


vietnamese_nlp_processor = VietnameseLanguageProcessor()
