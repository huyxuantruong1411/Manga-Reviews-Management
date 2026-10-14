from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.models.pyobjectid import PyObjectId

# Tier Color Keys (Semantic tokens mapping to Tailwind classes)
TierColorKey = Literal[
    "crimson",
    "amber",
    "gold",
    "lime",
    "emerald",
    "cyan",
    "sky",
    "violet",
    "rose",
    "slate",
]

CardAspectRatio = Literal["portrait", "square"]
CardSize = Literal["compact", "normal", "large"]
CreatorRoleFilter = Literal["all", "author", "artist", "both"]
PresetKind = Literal["standard", "critic", "score_based", "empty"]


class TierItemEntry(BaseModel):
    """Storage schema for an item in a tier list row."""

    model_config = ConfigDict(extra="ignore")

    manga_id: str = Field(..., min_length=1, description="Internal MongoDB ID of the manga")
    selected_cover_art_id: Optional[str] = Field(
        default=None,
        description="ID from cover_arts collection if custom volume cover is chosen",
    )
    selected_minio_key: Optional[str] = Field(
        default=None,
        description="MinIO object key corresponding to the selected cover",
    )
    note: Optional[str] = Field(
        default=None,
        max_length=120,
        description="Short annotation or badge displayed on card",
    )


class TierRowModel(BaseModel):
    """Storage schema for a single tier row."""

    model_config = ConfigDict(extra="ignore")

    row_id: str = Field(..., min_length=1, max_length=64, description="Unique row identifier")
    label: str = Field(..., min_length=1, max_length=40, description="Display tier label (e.g., 'S', 'A')")
    color_key: TierColorKey = Field(default="crimson", description="Semantic color token")
    description: Optional[str] = Field(
        default=None,
        max_length=250,
        description="Optional rating criteria for this row",
    )
    items: List[TierItemEntry] = Field(default_factory=list, description="Ordered items in this tier")


class TierBoardSettings(BaseModel):
    """Configuration settings for how the tier board is rendered."""

    model_config = ConfigDict(extra="ignore")

    card_aspect: CardAspectRatio = Field(default="portrait")
    card_size: CardSize = Field(default="normal")
    show_title: bool = Field(default=True)
    show_rating: bool = Field(default=True)
    show_role_badge: bool = Field(default=False)
    role_filter: CreatorRoleFilter = Field(default="all")
    excluded_manga_ids: List[str] = Field(
        default_factory=list,
        description="List of manga IDs hidden from this board",
    )


class TierlistCreateRequest(BaseModel):
    """Request schema for creating a new creator tierlist."""

    model_config = ConfigDict(extra="ignore")

    title: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    category_tag: Optional[str] = Field(default="Tổng hợp", max_length=50)
    preset: PresetKind = Field(default="standard")
    auto_seed_by_rating: bool = Field(
        default=False,
        description="Automatically seed initial tiers based on personal_rating",
    )
    is_default: bool = Field(default=False)
    settings: TierBoardSettings = Field(default_factory=TierBoardSettings)
    tiers: Optional[List[TierRowModel]] = Field(default=None)


class TierlistUpdateRequest(BaseModel):
    """Request schema for updating an existing tierlist."""

    model_config = ConfigDict(extra="ignore")

    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    category_tag: Optional[str] = Field(default=None, max_length=50)
    is_default: Optional[bool] = Field(default=None)
    settings: Optional[TierBoardSettings] = Field(default=None)
    tiers: Optional[List[TierRowModel]] = Field(default=None)
    expected_revision: Optional[int] = Field(
        default=None,
        ge=1,
        description="Optimistic locking: reject update if revision has progressed",
    )


class TierlistCloneRequest(BaseModel):
    """Request schema for cloning an existing tierlist."""

    model_config = ConfigDict(extra="ignore")

    new_title: str = Field(..., min_length=1, max_length=120)
    set_as_default: bool = Field(default=False)


# -------------------------------------------------------------------------
# Hydrated DTOs (Sent to Frontend)
# -------------------------------------------------------------------------


class HydratedTierItem(TierItemEntry):
    """Tier item enriched with live manga metadata and cover URLs."""

    title: str = ""
    cover_url: Optional[str] = None
    default_cover_url: Optional[str] = None
    personal_rating: Optional[float] = None
    read_status: str = "unread"
    year: Optional[str] = None
    status: Optional[str] = None
    content_rating: Optional[str] = None
    creator_role: Literal["author", "artist", "both"] = "both"
    is_newly_discovered: bool = False


class HydratedTierRow(BaseModel):
    """Tier row enriched with hydrated items and row statistics."""

    model_config = ConfigDict(extra="ignore")

    row_id: str
    label: str
    color_key: TierColorKey = "crimson"
    description: Optional[str] = None
    items: List[HydratedTierItem] = Field(default_factory=list)
    item_count: int = 0
    average_rating: Optional[float] = None


class TierlistAnalyticsSummary(BaseModel):
    """Analytical summary of the creator's works and tierlist completion."""

    model_config = ConfigDict(extra="ignore")

    total_creator_mangas: int = 0
    ranked_count: int = 0
    unranked_count: int = 0
    excluded_count: int = 0
    completion_pct: float = 0.0
    overall_ranked_avg_rating: Optional[float] = None


class TierlistDetailResponse(BaseModel):
    """Full hydrated detail response for a single tierlist."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: PyObjectId = Field(alias="_id")
    creator_name: str
    creator_name_normalized: str
    title: str
    description: Optional[str] = None
    category_tag: str = "Tổng hợp"
    is_default: bool = False
    revision: int = 1
    settings: TierBoardSettings = Field(default_factory=TierBoardSettings)
    tiers: List[HydratedTierRow] = Field(default_factory=list)
    unranked_pool: List[HydratedTierItem] = Field(default_factory=list)
    excluded_pool: List[HydratedTierItem] = Field(default_factory=list)
    analytics: TierlistAnalyticsSummary = Field(default_factory=TierlistAnalyticsSummary)
    created_at: datetime
    updated_at: datetime


class TierlistSummaryItem(BaseModel):
    """Lightweight summary item for version switcher dropdowns."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: PyObjectId = Field(alias="_id")
    creator_name: str
    title: str
    description: Optional[str] = None
    category_tag: str = "Tổng hợp"
    is_default: bool = False
    revision: int = 1
    ranked_count: int = 0
    tier_count: int = 0
    created_at: datetime
    updated_at: datetime


class TierlistComparisonItemDiff(BaseModel):
    """Diff entry for a single manga between two tierlists."""

    model_config = ConfigDict(extra="ignore")

    manga_id: str
    title: str
    cover_url: Optional[str] = None
    from_tier_label: Optional[str] = None
    to_tier_label: Optional[str] = None
    from_tier_index: Optional[int] = None
    to_tier_index: Optional[int] = None
    movement: Literal["promoted", "demoted", "unchanged", "newly_ranked", "unranked"]
    tier_delta: int = 0


class TierlistComparisonResponse(BaseModel):
    """Comparison response between a base and target tierlist."""

    model_config = ConfigDict(extra="ignore")

    base_tierlist_id: str
    base_title: str
    target_tierlist_id: str
    target_title: str
    summary: Dict[str, int] = Field(default_factory=dict)
    diffs: List[TierlistComparisonItemDiff] = Field(default_factory=list)


class MangaCoverOption(BaseModel):
    """Cover art option available for a manga."""

    model_config = ConfigDict(extra="ignore")

    cover_art_id: Optional[str] = None
    minio_key: str
    cover_url: str
    volume: Optional[str] = None
    locale: Optional[str] = None
    is_default: bool = False
