package com.mangareader.app.data.model

data class ReadingListDetail(
    val list_id: String,
    val owner_id: String,
    val name: String,
    val description: String = "",
    val visibility: String = "private",
    val manga_count: Int = 0,
    val created_at: String = "",
    val updated_at: String = "",
)

data class ReadingListsResponse(
    val total: Int,
    val items: List<ReadingListDetail>,
)

data class CreateReadingListRequest(
    val name: String,
    val description: String? = null,
)

data class MergeListsRequest(
    val source_list_id: String,
    val target_list_id: String,
    val delete_source_after_merge: Boolean = false,
)

data class BatchAddMangaRequest(
    val manga_id: String,
    val list_ids: List<String>,
    val new_list_name: String? = null,
)

data class ListItemsResponse(
    val list_id: String,
    val total: Int,
    val available_tags_in_list: List<String> = emptyList(),
    val items: List<MangaItem> = emptyList(),
)

data class ReadingHistoryItem(
    val history_id: String,
    val manga_id: String,
    val manga_title: String,
    val manga_slug: String,
    val cover_url: String? = null,
    val chapter_id: String,
    val chapter_number: String,
    val last_read_page: Int,
    val is_completed: Boolean,
    val updated_at: String,
)

data class ReadingAnalyticsResponse(
    val user_id: String,
    val total_chapters_read: Int = 0,
    val total_mangas_read: Int = 0,
    val total_dwell_minutes: Double = 0.0,
    val preferred_tags: List<String> = emptyList(),
    val reading_streak_days: Int = 0,
)

