package com.example.mangareader_android.data.model;

import java.util.ArrayList;
import java.util.List;

public class CommentModels {

    public static class CommentItem {
        public String comment_id;
        public String manga_id;
        public String chapter_id;
        public String user_id;
        public String username;
        public String display_name;
        public String avatar_url;
        public String parent_comment_id;
        public String content;
        public boolean is_spoiler;
        public boolean spoiler_locked_by_admin;
        public boolean is_edited;
        public String edited_at;
        public boolean is_deleted;
        public int like_count;
        public int dislike_count;
        public String user_reaction;
        public String created_at;

        // UI state for spoiler reveal
        public boolean isRevealed = false;
    }

    public static class CommentListResponse {
        public int total;
        public int page;
        public int page_size;
        public List<CommentItem> items = new ArrayList<>();
    }

    public static class CreateCommentRequest {
        public String content;
        public String chapter_id;
        public String parent_comment_id;
        public boolean is_spoiler;

        public CreateCommentRequest(String content, String chapterId, String parentCommentId, boolean isSpoiler) {
            this.content = content;
            this.chapter_id = chapterId;
            this.parent_comment_id = parentCommentId;
            this.is_spoiler = isSpoiler;
        }
    }

    public static class ReactCommentRequest {
        public String reaction;

        public ReactCommentRequest(String reaction) {
            this.reaction = reaction;
        }
    }

    public static class ReportCommentRequest {
        public String reason_code;
        public String description;

        public ReportCommentRequest(String reasonCode, String description) {
            this.reason_code = reasonCode;
            this.description = description;
        }
    }
}

