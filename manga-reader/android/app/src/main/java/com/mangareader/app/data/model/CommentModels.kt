package com.mangareader.app.data.model

data class CommentItem(
    val comment_id: String,
    val manga_id: String,
    val chapter_id: String? = null,
    val user_id: String,
    val username: String,
    val display_name: String,
    val avatar_url: String? = null,
    val parent_comment_id: String? = null,
    val content: String,
    val is_spoiler: Boolean = false,
    val spoiler_locked_by_admin: Boolean = false,
    val is_edited: Boolean = false,
    val edited_at: String? = null,
    val is_deleted: Boolean = false,
    val like_count: Int = 0,
    val dislike_count: Int = 0,
    val user_reaction: String? = null,
    val created_at: String,
)

data class CommentListResponse(
    val total: Int,
    val page: Int,
    val page_size: Int,
    val items: List<CommentItem>,
)

data class CreateCommentRequest(
    val content: String,
    val chapter_id: String? = null,
    val parent_comment_id: String? = null,
    val is_spoiler: Boolean = false,
)

data class ReactCommentRequest(
    val reaction: String,
)

data class ReportCommentRequest(
    val reason_code: String,
    val description: String? = null,
)

