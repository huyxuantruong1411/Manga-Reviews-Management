package com.mangareader.app.data.model

import com.google.gson.annotations.SerializedName

data class CreatorItem(
    val creator_id: String,
    val slug: String? = null,
    val name: String,
    val role: String? = null,
)

data class TagItem(
    val slug: String,
    val group: String? = null,
    val name: String,
)

data class MangaItem(
    @SerializedName("pool_manga_id") val poolMangaId: String,
    val slug: String,
    val title: String,
    val alt_titles: List<String> = emptyList(),
    val description: String = "",
    val status: String = "ongoing",
    val content_rating: String = "safe",
    val publication_demographic: String = "shounen",
    val cover_url: String? = null,
    val chapter_count: Int = 0,
    val average_rating: Double = 0.0,
    val rating_count: Int = 0,
    val view_count: Long = 0,
    val is_hidden: Boolean = false,
    val tags: List<TagItem> = emptyList(),
    val creators: List<CreatorItem> = emptyList(),
    val authors: List<CreatorItem> = emptyList(),
    val artists: List<CreatorItem> = emptyList(),
    val updated_at: String = "",
    val my_reading_status: String? = null,
    val my_rating: Int? = null,
    val user_reading_status: String? = null,
    val user_rating: Int? = null,
) {
    val effectiveReadingStatus: String?
        get() = my_reading_status ?: user_reading_status

    val effectiveRating: Int?
        get() = my_rating ?: user_rating
}

data class MangaListResponse(
    val total: Int,
    val page: Int,
    val page_size: Int,
    val items: List<MangaItem>,
)

data class MangaSearchResponse(
    val total: Int,
    val items: List<MangaItem>,
)

data class AutocompleteItem(
    val pool_manga_id: String,
    val title: String,
    val slug: String,
)

data class AutocompleteResponse(
    val items: List<AutocompleteItem>,
)

data class RecommendationsResponse(
    val model: String,
    val is_fallback: Boolean? = null,
    val items: List<MangaItem>,
)

data class RateMangaRequest(
    val score: Int,
)

data class ReadingStatusRequest(
    val status: String,
)

data class ReportMangaRequest(
    val reason_code: String,
    val description: String? = null,
    val chapter_id: String? = null,
)

