"""Migration: Add indexes for External Source Connector CDC subscriptions, events, and deliveries."""

from backend.database.connection import get_pool_db

POOL_CDC_SUBSCRIPTIONS_INDEXES = [
    ("subscription_key", "idx_cdc_sub_key", {"unique": True}),
    (
        [("consumer_id", 1), ("pool_manga_id", 1), ("callback_url", 1)],
        "idx_cdc_sub_consumer_manga_callback",
        {"unique": True},
    ),
    ([("pool_manga_id", 1), ("status", 1)], "idx_cdc_sub_manga_status", {}),
    ([("status", 1), ("updated_at", -1)], "idx_cdc_sub_status_updated", {}),
]

POOL_CDC_EVENTS_INDEXES = [
    ("event_id", "idx_cdc_event_id", {"unique": True}),
    ([("pool_manga_id", 1), ("occurred_at", -1)], "idx_cdc_event_manga_occurred", {}),
    ([("pool_manga_id", 1), ("pool_revision", -1)], "idx_cdc_event_manga_rev", {}),
    ([("event_type", 1), ("occurred_at", -1)], "idx_cdc_event_type_occurred", {}),
    ([("occurred_at", -1)], "idx_cdc_event_occurred", {}),
]

POOL_CDC_DELIVERIES_INDEXES = [
    ("delivery_id", "idx_cdc_delivery_id", {"unique": True}),
    ([("event_id", 1), ("subscription_key", 1)], "idx_cdc_delivery_event_sub", {"unique": True}),
    ([("subscription_key", 1), ("created_at", -1)], "idx_cdc_delivery_sub_created", {}),
    ([("pool_manga_id", 1), ("created_at", -1)], "idx_cdc_delivery_manga_created", {}),
    ([("status", 1), ("next_retry_at", 1)], "idx_cdc_delivery_status_retry", {"sparse": True}),
]


async def upgrade():
    """Create indexes for connector CDC collections in the pool database."""
    pool_db = get_pool_db()
    for keys, name, kwargs in POOL_CDC_SUBSCRIPTIONS_INDEXES:
        await pool_db.pool_cdc_subscriptions.create_index(keys, name=name, **kwargs)

    for keys, name, kwargs in POOL_CDC_EVENTS_INDEXES:
        await pool_db.pool_cdc_events.create_index(keys, name=name, **kwargs)

    for keys, name, kwargs in POOL_CDC_DELIVERIES_INDEXES:
        await pool_db.pool_cdc_deliveries.create_index(keys, name=name, **kwargs)


async def downgrade():
    """Drop indexes for connector CDC collections in the pool database."""
    pool_db = get_pool_db()
    for col, defs in (
        (pool_db.pool_cdc_subscriptions, POOL_CDC_SUBSCRIPTIONS_INDEXES),
        (pool_db.pool_cdc_events, POOL_CDC_EVENTS_INDEXES),
        (pool_db.pool_cdc_deliveries, POOL_CDC_DELIVERIES_INDEXES),
    ):
        existing = await col.index_information()
        for _, name, _ in defs:
            if name in existing:
                await col.drop_index(name)
