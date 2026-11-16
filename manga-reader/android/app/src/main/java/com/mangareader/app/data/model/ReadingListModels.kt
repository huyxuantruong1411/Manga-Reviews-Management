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
    val source_list_ids: List<String>,
    val new_list_name: String,
    val description: String = "",
    val delete_source_lists: Boolean = false,
    val confirm_empty: Boolean = true,
)

data class BatchAddMangaRequest(
    val manga_id: String,
    val list_ids: List<String>,
    val new_list_name: String? = null,
)

data class ListItemManga(
    val pool_manga_id: String,
    val slug: String,
    val title: String,
    val status: String = "ongoing",
    val content_rating: String = "safe",
    val cover_url: String? = null,
    val chapter_count: Int = 0,
    val average_rating: Double = 0.0,
    val is_hidden: Boolean = false,
    val tags: List<String> = emptyList(),
    val added_at: String = "",
)

data class ListItemsResponse(
    val list_id: String,
    val total: Int,
    val available_tags_in_list: List<String> = emptyList(),
    val items: List<ListItemManga> = emptyList(),
)

data class ReadingHistoryItem(
    val manga_id: String,
    val slug: String = "",
    val title: String = "",
    val cover_url: String? = null,
    val is_hidden: Boolean = false,
    val last_read_chapter_id: String? = null,
    val last_read_chapter_number: String? = null,
    val last_read_page_number: Int = 1,
    val is_chapter_completed: Boolean = false,
    val last_read_at: String = "",
    val read_chapter_ids: List<String> = emptyList(),
)

data class ReadingHistoryResponse(
    val items: List<ReadingHistoryItem> = emptyList(),
    val page: Int = 1,
    val page_size: Int = 20,
)

data class TopTagStat(
    val slug: String,
    val name: String,
    val manga_count: Int = 0,
)

data class ReadingFrequencyStats(
    val last_7_days: Int = 0,
    val last_30_days: Int = 0,
)

data class ReadingAnalyticsResponse(
    val user_id: String,
    val is_empty: Boolean = false,
    val total_mangas_read: Int = 0,
    val total_chapters_read: Int = 0,
    val top_tags: List<TopTagStat> = emptyList(),
    val reading_frequency: ReadingFrequencyStats = ReadingFrequencyStats(),
    val rating_distribution: Map<String, Int> = emptyMap(),
    val average_score_given: Double? = null,
    val total_ratings_given: Int = 0,
)

