"""
japanese.py - Japanese Language Processor for safe CJK token extraction.
"""

from typing import List, Optional

from backend.services.vision.nlp.base import LanguageProcessor
from backend.services.vision.types import LinguisticToken


class JapaneseLanguageProcessor(LanguageProcessor):
    """
    Safely indexes Japanese text without passing through English spaCy.
    """

    def analyze(
        self,
        text: str,
        source_region_id: Optional[str] = None,
    ) -> List[LinguisticToken]:
        if not text or not text.strip():
            return []

        # Return full text and characters as searchable tokens
        tokens: List[LinguisticToken] = [
            LinguisticToken(
                surface=text.strip(),
                lemma=text.strip(),
                pos="JA_TOKEN",
                is_stopword=False,
                source_text_region_id=source_region_id,
                start_char=0,
                end_char=len(text.strip()),
                quality_score=0.90,
            )
        ]

        return tokens


japanese_nlp_processor = JapaneseLanguageProcessor()
