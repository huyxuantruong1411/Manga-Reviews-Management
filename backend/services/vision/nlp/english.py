"""
english.py - English Language Processor using spaCy en_core_web_sm.
"""

import logging
from typing import List, Optional

import spacy

from backend.services.vision.nlp.base import LanguageProcessor
from backend.services.vision.types import LinguisticToken

logger = logging.getLogger("english_nlp")


class EnglishLanguageProcessor(LanguageProcessor):
    """
    Analyzes verified English text to extract lemma, POS tag, and stopword indicators.
    """

    def __init__(self):
        self._nlp = None

    @property
    def nlp(self):
        if self._nlp is None:
            logger.info("Loading spaCy en_core_web_sm for English NLP...")
            try:
                self._nlp = spacy.load("en_core_web_sm")
            except Exception as e:
                logger.warning(f"Could not load en_core_web_sm directly: {e}. Attempting blank English pipeline.")
                self._nlp = spacy.blank("en")
        return self._nlp

    def analyze(
        self,
        text: str,
        source_region_id: Optional[str] = None,
    ) -> List[LinguisticToken]:
        if not text or not text.strip():
            return []

        doc = self.nlp(text)
        tokens: List[LinguisticToken] = []

        for t in doc:
            if not t.text.strip() or len(t.text.strip()) < 2 or not t.is_alpha:
                continue

            tokens.append(
                LinguisticToken(
                    surface=t.text,
                    lemma=t.lemma_.lower() if hasattr(t, "lemma_") and t.lemma_ else t.text.lower(),
                    pos=t.pos_ if hasattr(t, "pos_") and t.pos_ else "NOUN",
                    is_stopword=t.is_stop if hasattr(t, "is_stop") else False,
                    source_text_region_id=source_region_id,
                    start_char=t.idx,
                    end_char=t.idx + len(t.text),
                    quality_score=0.95,
                )
            )

        return tokens


english_nlp_processor = EnglishLanguageProcessor()
