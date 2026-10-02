"""
router.py - Dispatches text to language-specific NLP processors.
"""

from typing import List, Optional

from backend.services.vision.nlp.base import LanguageProcessor
from backend.services.vision.nlp.english import english_nlp_processor
from backend.services.vision.nlp.japanese import japanese_nlp_processor
from backend.services.vision.nlp.vietnamese import vietnamese_nlp_processor
from backend.services.vision.types import LinguisticToken


class NLPProcessorRouter:
    """
    Routes text to the correct language processor based on language code and script.
    """

    def get_processor(self, language: str) -> LanguageProcessor:
        lang = (language or "en").lower().strip()
        if lang == "vi":
            return vietnamese_nlp_processor
        elif lang in ("ja", "zh", "ko"):
            return japanese_nlp_processor
        else:
            return english_nlp_processor

    def analyze(
        self,
        text: str,
        language: str = "en",
        source_region_id: Optional[str] = None,
    ) -> List[LinguisticToken]:
        processor = self.get_processor(language)
        return processor.analyze(text, source_region_id=source_region_id)


nlp_router = NLPProcessorRouter()
