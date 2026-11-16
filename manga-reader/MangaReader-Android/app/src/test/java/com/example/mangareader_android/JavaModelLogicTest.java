package com.example.mangareader_android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.example.mangareader_android.data.model.AuthModels.LoginRequest;
import com.example.mangareader_android.data.model.AuthModels.UpdatePasswordRequest;
import com.example.mangareader_android.data.model.ChapterModels.ChapterItem;
import com.example.mangareader_android.data.model.CommentModels.ReportCommentRequest;
import com.example.mangareader_android.data.model.MangaModels.MangaItem;
import com.example.mangareader_android.data.model.MangaModels.ReportMangaRequest;
import com.example.mangareader_android.data.model.ReadingListModels.MergeListsRequest;
import com.example.mangareader_android.data.model.ReadingListModels.ReadingAnalyticsResponse;
import com.example.mangareader_android.data.model.ReadingListModels.ReadingHistoryResponse;
import com.google.gson.Gson;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.Test;

public class JavaModelLogicTest {

    @Test
    public void testDecimalChapterSorting() {
        List<ChapterItem> list = new ArrayList<>();

        ChapterItem c1 = new ChapterItem();
        c1.chapter_number = "11";
        c1.chapter_numeric = 11.0;
        list.add(c1);

        ChapterItem c2 = new ChapterItem();
        c2.chapter_number = "10.5";
        c2.chapter_numeric = 10.5;
        list.add(c2);

        ChapterItem c3 = new ChapterItem();
        c3.chapter_number = "10";
        c3.chapter_numeric = 10.0;
        list.add(c3);

        ChapterItem c4 = new ChapterItem();
        c4.chapter_number = "9.2";
        c4.chapter_numeric = 9.2;
        list.add(c4);

        // Sort Ascending
        Collections.sort(list, Comparator.comparingDouble(a -> a.chapter_numeric));
        assertEquals("9.2", list.get(0).chapter_number);
        assertEquals("10", list.get(1).chapter_number);
        assertEquals("10.5", list.get(2).chapter_number);
        assertEquals("11", list.get(3).chapter_number);

        // Sort Descending
        Collections.sort(list, (a, b) -> Double.compare(b.chapter_numeric, a.chapter_numeric));
        assertEquals("11", list.get(0).chapter_number);
        assertEquals("10.5", list.get(1).chapter_number);
    }

    @Test
    public void testUnaccentedSearchNormalization() {
        String rawTitle = "Đấu Phá Thương Khung";
        String normalized = removeAccents(rawTitle);
        assertTrue(normalized.contains("dau pha"));
    }

    @Test
    public void testResolveMediaUrl() {
        String base = "http://10.0.2.2:18000/";
        assertNull(MangaReaderApp.resolveMediaUrl(null, base));
        assertNull(MangaReaderApp.resolveMediaUrl("  ", base));
        assertEquals(
                "http://10.0.2.2:18000/api/v1/media/covers/test.jpg",
                MangaReaderApp.resolveMediaUrl("/api/v1/media/covers/test.jpg", base));
        assertEquals(
                "http://10.0.2.2:18000/api/v1/media/pages/1.png",
                MangaReaderApp.resolveMediaUrl("http://127.0.0.1:18000/api/v1/media/pages/1.png", base));
        assertEquals(
                "http://10.0.2.2:9000/manga/p.png",
                MangaReaderApp.resolveMediaUrl("http://localhost:9000/manga/p.png", base));
        assertEquals(
                "https://cdn.example.com/cover.webp",
                MangaReaderApp.resolveMediaUrl("https://cdn.example.com/cover.webp", base));
    }

    @Test
    public void testBackendAlignedJavaDtoContracts() {
        Gson gson = new Gson();
        String loginJson = gson.toJson(new LoginRequest("reader1@mangareader.com", "Reader123456"));
        assertTrue(loginJson.contains("\"email\":\"reader1@mangareader.com\""));

        String pwJson = gson.toJson(new UpdatePasswordRequest("oldpass12", "newpass12"));
        assertTrue(pwJson.contains("\"confirm_password\":\"newpass12\""));

        String mangaReportJson = gson.toJson(new ReportMangaRequest("broken_images", "Missing page 2"));
        assertTrue(mangaReportJson.contains("\"reason_code\":\"broken_images\""));

        String commentReportJson = gson.toJson(new ReportCommentRequest("unmarked_spoiler", "Ending"));
        assertTrue(commentReportJson.contains("\"reason_code\":\"unmarked_spoiler\""));

        String mergeJson = gson.toJson(new MergeListsRequest(Arrays.asList("l1", "l2"), "Merged", "Desc", true, true));
        assertTrue(mergeJson.contains("\"source_list_ids\""));

        String mangaJson = "{"
                + "\"pool_manga_id\":\"m1\",\"slug\":\"dandadan\",\"title\":\"Dandadan\","
                + "\"tags\":[{\"slug\":\"action\",\"group\":\"genre\",\"name\":\"Action\"}],"
                + "\"creators\":[{\"creator_id\":\"c1\",\"name\":\"Tatsu Yukinobu\",\"role\":\"author\"}],"
                + "\"my_reading_status\":\"reading\",\"my_rating\":9}";
        MangaItem parsedManga = gson.fromJson(mangaJson, MangaItem.class);
        assertEquals("Action", parsedManga.tags.get(0).name);
        assertEquals("reading", parsedManga.getEffectiveReadingStatus());
        assertEquals(Integer.valueOf(9), parsedManga.getEffectiveRating());

        String histJson = "{\"items\":[{\"manga_id\":\"m1\",\"title\":\"Dandadan\",\"last_read_chapter_id\":\"ch1\",\"last_read_chapter_number\":\"1\",\"last_read_page_number\":4,\"is_chapter_completed\":false}],\"page\":1,\"page_size\":20}";
        ReadingHistoryResponse parsedHist = gson.fromJson(histJson, ReadingHistoryResponse.class);
        assertEquals(1, parsedHist.items.size());
        assertEquals(4, parsedHist.items.get(0).last_read_page_number);

        String statsJson = "{\"user_id\":\"u1\",\"total_mangas_read\":3,\"total_chapters_read\":18,\"top_tags\":[{\"slug\":\"horror\",\"name\":\"Horror\",\"manga_count\":2}],\"reading_frequency\":{\"last_7_days\":6,\"last_30_days\":18},\"average_score_given\":8.2}";
        ReadingAnalyticsResponse parsedStats = gson.fromJson(statsJson, ReadingAnalyticsResponse.class);
        assertEquals(6, parsedStats.reading_frequency.last_7_days);
        assertEquals("Horror", parsedStats.top_tags.get(0).name);
        assertEquals(8.2, parsedStats.average_score_given, 0.01);
    }

    private String removeAccents(String str) {
        String nfd = Normalizer.normalize(str, Normalizer.Form.NFD);
        Pattern pattern = Pattern.compile("\\p{InCombiningDiacriticalMarks}+");
        return pattern.matcher(nfd)
                .replaceAll("")
                .replace("đ", "d")
                .replace("Đ", "d")
                .toLowerCase();
    }
}

