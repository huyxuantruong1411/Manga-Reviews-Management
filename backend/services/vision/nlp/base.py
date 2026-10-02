"""
base.py - Base protocol for Language Processors in Vision Pipeline V3.
"""

from typing import List, Optional, Protocol

from backend.services.vision.types import LinguisticToken


class LanguageProcessor(Protocol):
    def analyze(
        self,
        text: str,
        source_region_id: Optional[str] = None,
    ) -> List[LinguisticToken]:
        """Analyze text and extract structured linguistic tokens (lemma, pos, etc.)."""
        ...
