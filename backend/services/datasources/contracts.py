from typing import Any, Dict, Protocol, runtime_checkable

import httpx

from backend.models.datasource import (
    ProviderCapability,
    ReleasePage,
    ReleaseQuery,
    SourcePage,
    SourcePageManifest,
    SourceWork,
)


@runtime_checkable
class MangaSourceProvider(Protocol):
    """
    Contract for external manga datasource providers.
    Each provider is responsible for resolving works, listing releases,
    resolving page manifests, and fetching image bytes.
    """

    @property
    def name(self) -> str:
        """Unique provider identifier (e.g. 'mangadex', 'mangafire')."""
        ...

    @property
    def capabilities(self) -> ProviderCapability:
        """Provider capabilities declaration."""
        ...

    async def resolve_work(self, url_or_id: str) -> SourceWork:
        """
        Resolves a work from a remote URL or external identifier.
        Validates the identity and returns a normalized SourceWork.
        """
        ...

    async def get_metadata(self, work_id: str) -> Dict[str, Any]:
        """
        Retrieves raw and normalized metadata for the work.
        """
        ...

    async def list_releases(self, work_id: str, query: ReleaseQuery) -> ReleasePage:
        """
        Fetches available releases/chapters for the work matching the query.
        Returns a ReleasePage preserving all individual release IDs.
        """
        ...

    async def resolve_pages(self, release_id: str) -> SourcePageManifest:
        """
        Resolves the ordered image pages manifest for a specific release.
        """
        ...

    async def fetch_page(self, page: SourcePage, client: httpx.AsyncClient) -> bytes:
        """
        Fetches the verified image bytes for a single page.
        """
        ...
