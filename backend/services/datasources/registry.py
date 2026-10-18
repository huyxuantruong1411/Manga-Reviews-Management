import logging
from typing import Dict, List

from backend.models.datasource import DatasourceError
from backend.services.datasources.contracts import MangaSourceProvider

logger = logging.getLogger(__name__)

_PROVIDERS: Dict[str, MangaSourceProvider] = {}


def register_datasource_provider(provider: MangaSourceProvider) -> None:
    """
    Registers a MangaSourceProvider instance in the central registry.
    """
    name = provider.name.lower()
    _PROVIDERS[name] = provider
    logger.info(f"Registered datasource provider: '{name}'")


def get_datasource_provider(name: str) -> MangaSourceProvider:
    """
    Retrieves a registered datasource provider by name.
    Raises DatasourceError if provider not found.
    """
    clean_name = name.lower()
    if clean_name not in _PROVIDERS:
        # Lazy auto-register built-in providers if not yet registered
        _init_builtin_providers()

    if clean_name not in _PROVIDERS:
        raise DatasourceError(f"Datasource provider '{name}' is not registered", code="PROVIDER_NOT_FOUND")
    return _PROVIDERS[clean_name]


def list_datasource_providers() -> List[MangaSourceProvider]:
    """
    Returns all registered datasource providers.
    """
    _init_builtin_providers()
    return list(_PROVIDERS.values())


def _init_builtin_providers() -> None:
    """Initializes built-in providers (e.g. MangaDex)."""
    if "mangadex" not in _PROVIDERS:
        try:
            from backend.services.datasources.mangadex import MangaDexSourceProvider

            register_datasource_provider(MangaDexSourceProvider())
        except Exception as e:
            logger.error(f"Failed to initialize MangaDexSourceProvider: {e}")

    if "mangafire" not in _PROVIDERS:
        try:
            from backend.services.datasources.mangafire import MangaFireSourceProvider

            register_datasource_provider(MangaFireSourceProvider())
        except Exception as e:
            logger.error(f"Failed to initialize MangaFireSourceProvider: {e}")

    if "comix" not in _PROVIDERS:
        try:
            from backend.services.datasources.comix import ComixProvider

            register_datasource_provider(ComixProvider())
        except Exception as e:
            logger.error(f"Failed to initialize ComixProvider: {e}")


class ProviderRegistry:
    def get_provider(self, name: str) -> MangaSourceProvider:
        return get_datasource_provider(name)

    def register_provider(self, provider: MangaSourceProvider) -> None:
        register_datasource_provider(provider)

    def list_providers(self) -> List[MangaSourceProvider]:
        return list_datasource_providers()


provider_registry = ProviderRegistry()
