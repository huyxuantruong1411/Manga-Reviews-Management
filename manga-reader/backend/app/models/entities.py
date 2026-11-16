"""SQLAlchemy 2.0 ORM Models for Manga Reader System v2.0 (All 25 Tables & 12 Enums)."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BIGINT,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Double,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


# ============================================================================
# 1. CORE & DOMAIN ENUMS (12 PostgreSQL ENUM Types)
# ============================================================================
class PublicationStatus(str, enum.Enum):
    ongoing = "ongoing"
    completed = "completed"
    hiatus = "hiatus"
    cancelled = "cancelled"
    unknown = "unknown"


class ContentRating(str, enum.Enum):
    safe = "safe"
    suggestive = "suggestive"
    erotica = "erotica"
    pornographic = "pornographic"
    unknown = "unknown"


class PublicationDemographic(str, enum.Enum):
    shounen = "shounen"
    shoujo = "shoujo"
    seinen = "seinen"
    josei = "josei"
    kodomo = "kodomo"
    unknown = "unknown"


class CreatorRole(str, enum.Enum):
    author = "author"
    artist = "artist"


class TagGroup(str, enum.Enum):
    genre = "genre"
    theme = "theme"
    format = "format"
    content = "content"
    other = "other"


class MangaVisibilityStatus(str, enum.Enum):
    public = "public"
    hidden = "hidden"


class UserRole(str, enum.Enum):
    reader = "reader"
    moderator = "moderator"
    admin = "admin"


class AccountStatus(str, enum.Enum):
    pending_verification = "pending_verification"
    active = "active"
    locked = "locked"


class ReadingStatusType(str, enum.Enum):
    reading = "reading"
    plan_to_read = "plan_to_read"
    completed = "completed"
    on_hold = "on_hold"
    dropped = "dropped"


class ReportTargetType(str, enum.Enum):
    account = "account"
    manga = "manga"
    comment = "comment"


class ReportStatus(str, enum.Enum):
    pending = "pending"
    resolved = "resolved"
    ignored = "ignored"
    closed = "closed"


class CommentReactionType(str, enum.Enum):
    like = "like"
    dislike = "dislike"


# ============================================================================
# SUBSYSTEM A: USERS, AUTHENTICATION & AUDIT/ACTIVITY LOGS (MODULE 1 & 6)
# ============================================================================
class User(Base):
    __tablename__ = "users"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    bio: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    show_birth_date: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    avatar_bucket: Mapped[str | None] = mapped_column(String(63), nullable=True)
    avatar_object_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role", create_type=False),
        nullable=False,
        default=UserRole.reader,
    )
    status: Mapped[AccountStatus] = mapped_column(
        SAEnum(AccountStatus, name="account_status", create_type=False),
        nullable=False,
        default=AccountStatus.pending_verification,
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lock_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locked_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    last_unlocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    reader_settings: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: {
            "reading_mode": "vertical_scroll",
            "reading_direction": "ltr",
            "fit_mode": "fit_width",
            "background_color": "dark",
            "preload_pages": 3,
        },
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        Index("idx_users_status", "status"),
        Index("idx_users_role", "role"),
    )


class UserActivityLog(Base):
    __tablename__ = "user_activity_logs"

    log_id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    action_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_activity_logs_user_time", "user_id", "created_at"),
        Index("idx_activity_logs_action", "user_id", "action_type", "created_at"),
    )


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    audit_id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=True)
    admin_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="RESTRICT"),
        nullable=False,
    )
    action_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[str] = mapped_column(String(128), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_admin_audit_time", "created_at"),
        Index("idx_admin_audit_target", "target_type", "target_id"),
    )


# ============================================================================
# SUBSYSTEM B: MANGA DATA CONTRACT v2.0 & ADMINISTRATION (MODULE 2, 3, 4)
# ============================================================================
class Manga(Base):
    __tablename__ = "mangas"

    pool_manga_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    source_manga_id: Mapped[str] = mapped_column(String(64), nullable=False)
    mangadex_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    alt_titles: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[PublicationStatus] = mapped_column(
        SAEnum(PublicationStatus, name="publication_status", create_type=False),
        nullable=False,
        default=PublicationStatus.unknown,
    )
    content_rating: Mapped[ContentRating] = mapped_column(
        SAEnum(ContentRating, name="content_rating", create_type=False),
        nullable=False,
        default=ContentRating.unknown,
    )
    publication_demographic: Mapped[PublicationDemographic] = mapped_column(
        SAEnum(PublicationDemographic, name="publication_demographic", create_type=False),
        nullable=False,
        default=PublicationDemographic.unknown,
    )
    original_language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    year: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    published_start_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    published_end_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    official_volumes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    official_chapters: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Primary Cover Zero-Copy Pointer
    cover_bucket: Mapped[str | None] = mapped_column(String(63), nullable=True)
    cover_object_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_file_size: Mapped[int] = mapped_column(BIGINT, nullable=False, default=0)
    cover_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cover_height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cover_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cover_md5_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cover_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)

    external_links: Mapped[list[dict[str, str]]] = mapped_column(JSONB, nullable=False, default=list)

    # Exported Package Stats
    chapter_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_size_bytes: Mapped[int] = mapped_column(BIGINT, nullable=False, default=0)
    available_languages: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)

    # Versioning & Lineage
    pool_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    source_metadata_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    manifest_sha256: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    pool_published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pool_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Reader Operations & Admin Flags
    visibility_status: Mapped[MangaVisibilityStatus] = mapped_column(
        SAEnum(MangaVisibilityStatus, name="manga_visibility_status", create_type=False),
        nullable=False,
        default=MangaVisibilityStatus.public,
    )
    hidden_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    hidden_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cdc_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_syncing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ignore_future_reports: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Denormalized Interaction Counters
    view_count: Mapped[int] = mapped_column(BIGINT, nullable=False, default=0)
    average_rating: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False, default=Decimal("0.00"))
    rating_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    list_add_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    latest_chapter_published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class MangaCoverArt(Base):
    __tablename__ = "manga_cover_arts"

    id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=True)
    manga_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("mangas.pool_manga_id", ondelete="CASCADE"),
        nullable=False,
    )
    cover_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    volume: Mapped[str | None] = mapped_column(String(20), nullable=True)
    locale: Mapped[str | None] = mapped_column(String(10), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    bucket: Mapped[str] = mapped_column(String(63), nullable=False)
    object_key: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_size: Mapped[int] = mapped_column(BIGINT, nullable=False, default=0)
    md5_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Creator(Base):
    __tablename__ = "creators"

    creator_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    mangadex_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    biography: Mapped[dict[str, str]] = mapped_column(JSONB, nullable=False, default=dict)
    links: Mapped[dict[str, str]] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class MangaCreator(Base):
    __tablename__ = "manga_creators"

    manga_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("mangas.pool_manga_id", ondelete="CASCADE"),
        primary_key=True,
    )
    creator_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("creators.creator_id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[CreatorRole] = mapped_column(
        SAEnum(CreatorRole, name="creator_role", create_type=False),
        primary_key=True,
    )


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    source_tag_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mangadex_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    tag_group: Mapped[TagGroup] = mapped_column(
        SAEnum(TagGroup, name="tag_group", create_type=False),
        nullable=False,
        default=TagGroup.genre,
    )
    name: Mapped[dict[str, str]] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class MangaTag(Base):
    __tablename__ = "manga_tags"

    manga_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("mangas.pool_manga_id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )


class Chapter(Base):
    __tablename__ = "chapters"

    pool_chapter_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    manga_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("mangas.pool_manga_id", ondelete="CASCADE"),
        nullable=False,
    )
    source_chapter_id: Mapped[str] = mapped_column(String(64), nullable=False)
    chapter_number: Mapped[str] = mapped_column(String(50), nullable=False)
    chapter_numeric: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    volume: Mapped[str | None] = mapped_column(String(20), nullable=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    scanlation_group: Mapped[str | None] = mapped_column(String(255), nullable=True)
    publish_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="mangadex")
    source_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_size_bytes: Mapped[int] = mapped_column(BIGINT, nullable=False, default=0)
    pages_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    manifest_sha256: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    view_count: Mapped[int] = mapped_column(BIGINT, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class ChapterPage(Base):
    __tablename__ = "chapter_pages"

    page_uid: Mapped[str] = mapped_column(String(64), primary_key=True)
    chapter_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("chapters.pool_chapter_id", ondelete="CASCADE"),
        nullable=False,
    )
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    bucket: Mapped[str] = mapped_column(String(63), nullable=False)
    object_key: Mapped[str] = mapped_column(Text, nullable=False)
    file_size: Mapped[int] = mapped_column(BIGINT, nullable=False, default=0)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    md5_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)

    __table_args__ = (UniqueConstraint("chapter_id", "page_number", name="uq_chapter_page_number"),)


# ============================================================================
# SUBSYSTEM C: READING HISTORY, STATUSES, RATINGS & METRICS (MODULE 3 & 4)
# ============================================================================
class UserReadingStatus(Base):
    __tablename__ = "user_reading_statuses"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        primary_key=True,
    )
    manga_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("mangas.pool_manga_id", ondelete="CASCADE"),
        primary_key=True,
    )
    status: Mapped[ReadingStatusType] = mapped_column(
        SAEnum(ReadingStatusType, name="reading_status_type", create_type=False),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class UserMangaReadingHistory(Base):
    __tablename__ = "user_manga_reading_history"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        primary_key=True,
    )
    manga_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("mangas.pool_manga_id", ondelete="CASCADE"),
        primary_key=True,
    )
    last_read_chapter_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("chapters.pool_chapter_id", ondelete="CASCADE"),
        nullable=False,
    )
    last_read_page_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_chapter_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    first_read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UserChapterRead(Base):
    __tablename__ = "user_chapter_reads"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        primary_key=True,
    )
    chapter_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("chapters.pool_chapter_id", ondelete="CASCADE"),
        primary_key=True,
    )
    manga_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("mangas.pool_manga_id", ondelete="CASCADE"),
        nullable=False,
    )
    last_page_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    read_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    first_read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class MangaRating(Base):
    __tablename__ = "manga_ratings"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        primary_key=True,
    )
    manga_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("mangas.pool_manga_id", ondelete="CASCADE"),
        primary_key=True,
    )
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (CheckConstraint("score >= 1 AND score <= 10", name="ck_manga_ratings_score_range"),)


class MangaRatingHistory(Base):
    __tablename__ = "manga_rating_history"

    history_id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    manga_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("mangas.pool_manga_id", ondelete="CASCADE"),
        nullable=False,
    )
    old_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    new_score: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class MangaDailyMetric(Base):
    __tablename__ = "manga_daily_metrics"

    metric_date: Mapped[date] = mapped_column(Date, primary_key=True)
    manga_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("mangas.pool_manga_id", ondelete="CASCADE"),
        primary_key=True,
    )
    views: Mapped[int] = mapped_column(BIGINT, nullable=False, default=0)
    list_adds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ratings_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    comments_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


# ============================================================================
# SUBSYSTEM D: COMMENTS, SPOILERS, EDIT HISTORIES & REACTIONS (MODULE 5)
# ============================================================================
class Comment(Base):
    __tablename__ = "comments"

    comment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    manga_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("mangas.pool_manga_id", ondelete="CASCADE"),
        nullable=False,
    )
    chapter_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("chapters.pool_chapter_id", ondelete="CASCADE"),
        nullable=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    parent_comment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("comments.comment_id", ondelete="CASCADE"),
        nullable=True,
    )
    content: Mapped[str] = mapped_column(String(2000), nullable=False)
    is_spoiler: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    spoiler_locked_by_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_edited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    like_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    dislike_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class CommentEditHistory(Base):
    __tablename__ = "comment_edit_histories"

    edit_id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=True)
    comment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("comments.comment_id", ondelete="CASCADE"),
        nullable=False,
    )
    previous_content: Mapped[str] = mapped_column(String(2000), nullable=False)
    edited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class CommentReaction(Base):
    __tablename__ = "comment_reactions"

    comment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("comments.comment_id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        primary_key=True,
    )
    reaction: Mapped[CommentReactionType] = mapped_column(
        SAEnum(CommentReactionType, name="comment_reaction_type", create_type=False),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


# ============================================================================
# SUBSYSTEM E: REPORTS MANAGEMENT (UC-1.6, UC-1.7, UC-4.9, UC-5.7, UC-6.6)
# ============================================================================
class Report(Base):
    __tablename__ = "reports"

    report_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reporter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    target_type: Mapped[ReportTargetType] = mapped_column(
        SAEnum(ReportTargetType, name="report_target_type", create_type=False),
        nullable=False,
    )
    target_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    target_manga_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("mangas.pool_manga_id", ondelete="SET NULL"),
        nullable=True,
    )
    target_chapter_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("chapters.pool_chapter_id", ondelete="SET NULL"),
        nullable=True,
    )
    target_comment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("comments.comment_id", ondelete="SET NULL"),
        nullable=True,
    )
    reason_category: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[ReportStatus] = mapped_column(
        SAEnum(ReportStatus, name="report_status", create_type=False),
        nullable=False,
        default=ReportStatus.pending,
    )
    resolution_action: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


# ============================================================================
# SUBSYSTEM F: PERSONAL READING LISTS & LIST ITEMS (MODULE 7 & MODULE 8)
# ============================================================================
class ReadingList(Base):
    __tablename__ = "reading_lists"

    list_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(String(1000), nullable=False, default="")
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="private")
    manga_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (UniqueConstraint("owner_id", "name", name="uq_reading_list_owner_name"),)


class ReadingListItem(Base):
    __tablename__ = "reading_list_items"

    list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reading_lists.list_id", ondelete="CASCADE"),
        primary_key=True,
    )
    manga_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("mangas.pool_manga_id", ondelete="CASCADE"),
        primary_key=True,
    )
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


# ============================================================================
# SUBSYSTEM G: ETL SYNC JOBS & RECOMMENDATION CACHE (UC-2.3, UC-3.7, 3.8, 3.9)
# ============================================================================
class EtlSyncJob(Base):
    __tablename__ = "etl_sync_jobs"

    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    triggered_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    job_type: Mapped[str] = mapped_column(String(30), nullable=False)
    pool_manga_id: Mapped[str] = mapped_column(String(64), nullable=False)
    package_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    manifest_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="queued")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class MangaRecommendationsCache(Base):
    __tablename__ = "manga_recommendations_cache"

    manga_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("mangas.pool_manga_id", ondelete="CASCADE"),
        primary_key=True,
    )
    content_feature_vec: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    content_based_ids: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    item_based_ids: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
