"""
NLP package for Vision Pipeline V3.
"""

from backend.services.vision.nlp.base import LanguageProcessor
from backend.services.vision.nlp.english import EnglishLanguageProcessor, english_nlp_processor
from backend.services.vision.nlp.japanese import JapaneseLanguageProcessor, japanese_nlp_processor
from backend.services.vision.nlp.router import NLPProcessorRouter, nlp_router
from backend.services.vision.nlp.vietnamese import VietnameseLanguageProcessor, vietnamese_nlp_processor

__all__ = [
    "LanguageProcessor",
    "EnglishLanguageProcessor",
    "english_nlp_processor",
    "VietnameseLanguageProcessor",
    "vietnamese_nlp_processor",
    "JapaneseLanguageProcessor",
    "japanese_nlp_processor",
    "NLPProcessorRouter",
    "nlp_router",
]
