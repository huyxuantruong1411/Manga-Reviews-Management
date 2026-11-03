package com.example.mangareader_android.data.model;

import java.util.ArrayList;
import java.util.List;

public class ReadingListModels {

    public static class ReadingListDetail {
        public String list_id;
        public String owner_id;
        public String name;
        public String description;
        public String visibility;
        public int manga_count;
        public String created_at;
        public String updated_at;
    }

    public static class ReadingListsResponse {
        public int total;
        public List<ReadingListDetail> items = new ArrayList<>();
    }

    public static class CreateReadingListRequest {
        public String name;
        public String description;

        public CreateReadingListRequest(String name, String description) {
            this.name = name;
            this.description = description;
        }
    }

    public static class MergeListsRequest {
        public String source_list_id;
        public String target_list_id;
        public boolean delete_source_after_merge;

        public MergeListsRequest(String sourceListId, String targetListId, boolean deleteSource) {
            this.source_list_id = sourceListId;
            this.target_list_id = targetListId;
            this.delete_source_after_merge = deleteSource;
        }
    }

    public static class ReadingHistoryItem {
        public String history_id;
        public String manga_id;
        public String manga_title;
        public String manga_slug;
        public String cover_url;
        public String chapter_id;
        public String chapter_number;
        public int last_read_page;
        public boolean is_completed;
        public String updated_at;
    }

    public static class ReadingAnalyticsResponse {
        public String user_id;
        public int total_chapters_read;
        public int total_mangas_read;
        public double total_dwell_minutes;
        public List<String> preferred_tags = new ArrayList<>();
        public int reading_streak_days;
    }
}

