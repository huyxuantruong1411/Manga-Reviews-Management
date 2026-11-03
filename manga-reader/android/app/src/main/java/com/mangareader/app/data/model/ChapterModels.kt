package com.mangareader.app.data.model

import com.google.gson.annotations.SerializedName

data class ChapterItem(
    @SerializedName("pool_chapter_id") val poolChapterId: String,
    @SerializedName("pool_manga_id") val poolMangaId: String,
    val chapter_number: String,
    val chapter_numeric: Double,
    val volume: String? = null,
    val title: String? = null,
    val language: String = "en",
    val page_count: Int = 0,
    val view_count: Long = 0,
    val is_read: Boolean = false,
    val last_read_page_number: Int? = null,
    val is_completed: Boolean = false,
    val publish_at: String? = null,
)

data class ChapterListResponse(
    val manga_id: String,
    val total: Int,
    val items: List<ChapterItem>,
)

data class ChapterPageItem(
    val page_uid: String,
    val page_number: Int,
    val filename: String,
    val image_url: String,
    val width: Int? = null,
    val height: Int? = null,
)

data class ReaderSettingsData(
    val reading_mode: String = "vertical_scroll",
    val reading_direction: String = "ltr",
    val fit_mode: String = "fit_width",
    val background_color: String = "dark",
    val preload_pages: Int = 3,
)

data class ChapterPagesResponse(
    val pool_chapter_id: String,
    val pool_manga_id: String,
    val chapter_number: String,
    val title: String? = null,
    val page_count: Int,
    val prev_chapter_id: String? = null,
    val next_chapter_id: String? = null,
    val reader_settings: ReaderSettingsData = ReaderSettingsData(),
    val pages: List<ChapterPageItem> = emptyList(),
)

data class RecordProgressRequest(
    val page_number: Int,
    val is_completed: Boolean? = null,
    val dwell_seconds: Int? = null,
    val pages_read_count: Int? = null,
)

data class RecordProgressResponse(
    val pool_chapter_id: String,
    val last_read_page_number: Int,
    val is_completed: Boolean,
    val view_counted: Boolean,
)

data class ReadPointerResponse(
    val chapter_id: String,
    val chapter_number: String,
    val page_number: Int = 1,
    val caught_up: Boolean? = null,
)

