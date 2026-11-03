package com.example.mangareader_android.data.model;

import com.google.gson.annotations.SerializedName;
import java.util.ArrayList;
import java.util.List;

public class ChapterModels {

    public static class ChapterItem {
        @SerializedName("pool_chapter_id")
        public String poolChapterId;

        @SerializedName("pool_manga_id")
        public String poolMangaId;

        public String chapter_number;
        public double chapter_numeric;
        public String volume;
        public String title;
        public String language;
        public int page_count;
        public long view_count;
        public boolean is_read;
        public Integer last_read_page_number;
        public boolean is_completed;
        public String publish_at;
    }

    public static class ChapterListResponse {
        public String manga_id;
        public int total;
        public List<ChapterItem> items = new ArrayList<>();
    }

    public static class ChapterPageItem {
        public String page_uid;
        public int page_number;
        public String filename;
        public String image_url;
        public Integer width;
        public Integer height;
    }

    public static class ReaderSettingsData {
        public String reading_mode = "vertical_scroll";
        public String reading_direction = "ltr";
        public String fit_mode = "fit_width";
        public String background_color = "dark";
        public int preload_pages = 3;
    }

    public static class ChapterPagesResponse {
        public String pool_chapter_id;
        public String pool_manga_id;
        public String chapter_number;
        public String title;
        public int page_count;
        public String prev_chapter_id;
        public String next_chapter_id;
        public ReaderSettingsData reader_settings = new ReaderSettingsData();
        public List<ChapterPageItem> pages = new ArrayList<>();
    }

    public static class RecordProgressRequest {
        public int page_number;
        public Boolean is_completed;
        public Integer dwell_seconds;
        public Integer pages_read_count;

        public RecordProgressRequest(int pageNumber, Boolean isCompleted, Integer dwellSeconds, Integer pagesReadCount) {
            this.page_number = pageNumber;
            this.is_completed = isCompleted;
            this.dwell_seconds = dwellSeconds;
            this.pages_read_count = pagesReadCount;
        }
    }

    public static class RecordProgressResponse {
        public String pool_chapter_id;
        public int last_read_page_number;
        public boolean is_completed;
        public boolean view_counted;
    }

    public static class ReadPointerResponse {
        public String chapter_id;
        public String chapter_number;
        public int page_number;
        public Boolean caught_up;
    }
}

