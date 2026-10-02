"""
Text processing, normalization, and association package for Vision Pipeline V3.
"""

from backend.services.vision.text.association import RegionAssociator, region_associator
from backend.services.vision.text.correction_rules import PROTECTED_LEXICON, is_protected_token
from backend.services.vision.text.normalizer import NormalizationResult, TextNormalizer, text_normalizer
from backend.services.vision.text.text_role import TextRoleClassifier, text_role_classifier

__all__ = [
    "RegionAssociator",
    "region_associator",
    "TextNormalizer",
    "text_normalizer",
    "NormalizationResult",
    "TextRoleClassifier",
    "text_role_classifier",
    "PROTECTED_LEXICON",
    "is_protected_token",
]
