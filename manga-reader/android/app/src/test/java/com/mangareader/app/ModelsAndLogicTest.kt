package com.mangareader.app

import com.google.gson.Gson
import com.mangareader.app.data.model.ChapterItem
import com.mangareader.app.data.model.LoginRequest
import com.mangareader.app.data.model.MangaItem
import com.mangareader.app.data.model.MergeListsRequest
import com.mangareader.app.data.model.ReadingAnalyticsResponse
import com.mangareader.app.data.model.ReadingHistoryResponse
import com.mangareader.app.data.model.ReportCommentRequest
import com.mangareader.app.data.model.ReportMangaRequest
import com.mangareader.app.data.model.UpdatePasswordRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.text.Normalizer
import java.util.regex.Pattern

class ModelsAndLogicTest {

    @Test
    fun testDecimalChapterSorting() {
        val chapters = listOf(
            ChapterItem(poolChapterId = "1", poolMangaId = "m1", chapter_number = "11", chapter_numeric = 11.0),
            ChapterItem(poolChapterId = "2", poolMangaId = "m1", chapter_number = "10.5", chapter_numeric = 10.5),
            ChapterItem(poolChapterId = "3", poolMangaId = "m1", chapter_number = "10", chapter_numeric = 10.0),
            ChapterItem(poolChapterId = "4", poolMangaId = "m1", chapter_number = "9.2", chapter_numeric = 9.2),
        )

        val sortedAsc = chapters.sortedBy { it.chapter_numeric }
        assertEquals("9.2", sortedAsc[0].chapter_number)
        assertEquals("10", sortedAsc[1].chapter_number)
        assertEquals("10.5", sortedAsc[2].chapter_number)
        assertEquals("11", sortedAsc[3].chapter_number)

        val sortedDesc = chapters.sortedByDescending { it.chapter_numeric }
        assertEquals("11", sortedDesc[0].chapter_number)
        assertEquals("10.5", sortedDesc[1].chapter_number)
    }

    @Test
    fun testUnaccentedSearchNormalization() {
        fun removeAccents(str: String): String {
            val nfdNormalizedString = Normalizer.normalize(str, Normalizer.Form.NFD)
            val pattern = Pattern.compile("\\p{InCombiningDiacriticalMarks}+")
            return pattern.matcher(nfdNormalizedString)
                .replaceAll("")
                .replace("đ", "d")
                .replace("Đ", "d")
                .lowercase()
        }

        val rawTitle = "Đấu Phá Thương Khung"
        val query = "dau pha"

        val normalizedTitle = removeAccents(rawTitle)
        assertTrue(normalizedTitle.contains(query))
    }

    @Test
    fun testBaseUrlSanitization() {
        val raw = "http://192.168.1.50:18000"
        val sanitized = if (raw.endsWith("/")) raw else "$raw/"
        assertEquals("http://192.168.1.50:18000/", sanitized)
    }

    @Test
    fun testResolveMediaUrl() {
        val base = "http://10.0.2.2:18000/"
        assertNull(MangaReaderApplication.resolveMediaUrl(null, base))
        assertNull(MangaReaderApplication.resolveMediaUrl("   ", base))
        assertEquals(
            "http://10.0.2.2:18000/api/v1/media/covers/abc.jpg",
            MangaReaderApplication.resolveMediaUrl("/api/v1/media/covers/abc.jpg", base)
        )
        assertEquals(
            "http://10.0.2.2:18000/api/v1/media/pages/1.png",
            MangaReaderApplication.resolveMediaUrl("http://127.0.0.1:18000/api/v1/media/pages/1.png", base)
        )
        assertEquals(
            "http://10.0.2.2:9000/manga/ch1/01.jpg",
            MangaReaderApplication.resolveMediaUrl("http://localhost:9000/manga/ch1/01.jpg", base)
        )
        assertEquals(
            "https://cdn.example.com/cover.webp",
            MangaReaderApplication.resolveMediaUrl("https://cdn.example.com/cover.webp", base)
        )
    }

    @Test
    fun testBackendAlignedDtoContracts() {
        val gson = Gson()

        val loginJson = gson.toJson(LoginRequest(email = "reader1@mangareader.com", password = "Reader123456"))
        assertTrue(loginJson.contains("\"email\":\"reader1@mangareader.com\""))

        val pwJson = gson.toJson(UpdatePasswordRequest("oldpass12", "newpass12", "newpass12"))
        assertTrue(pwJson.contains("\"confirm_password\":\"newpass12\""))

        val reportMangaJson = gson.toJson(ReportMangaRequest(reason_code = "broken_images", description = "Missing p3"))
        assertTrue(reportMangaJson.contains("\"reason_code\":\"broken_images\""))

        val reportCommentJson = gson.toJson(ReportCommentRequest(reason_code = "unmarked_spoiler", description = "Ending spoiler"))
        assertTrue(reportCommentJson.contains("\"reason_code\":\"unmarked_spoiler\""))

        val mergeJson = gson.toJson(
            MergeListsRequest(source_list_ids = listOf("l1", "l2"), new_list_name = "Favorites", delete_source_lists = true)
        )
        assertTrue(mergeJson.contains("\"source_list_ids\""))
        assertTrue(mergeJson.contains("\"new_list_name\":\"Favorites\""))

        val mangaJson = """
            {
              "pool_manga_id": "m1",
              "slug": "dandadan",
              "title": "Dandadan",
              "cover_url": "/api/v1/media/covers/m1.jpg",
              "tags": [{"slug": "action", "group": "genre", "name": "Action"}],
              "creators": [{"creator_id": "c1", "slug": "yukitsubu", "name": "Tatsu Yukinobu", "role": "author"}],
              "my_reading_status": "reading",
              "my_rating": 9
            }
        """.trimIndent()
        val parsedManga = gson.fromJson(mangaJson, MangaItem::class.java)
        assertEquals("Action", parsedManga.tags.first().name)
        assertEquals("Tatsu Yukinobu", parsedManga.creators.first().name)
        assertEquals("reading", parsedManga.effectiveReadingStatus)
        assertEquals(9, parsedManga.effectiveRating)

        val histJson = """
            {
              "items": [{
                "manga_id": "m1",
                "slug": "dandadan",
                "title": "Dandadan",
                "cover_url": "/api/v1/media/covers/m1.jpg",
                "last_read_chapter_id": "ch1",
                "last_read_chapter_number": "1",
                "last_read_page_number": 5,
                "is_chapter_completed": false
              }],
              "page": 1,
              "page_size": 20
            }
        """.trimIndent()
        val parsedHist = gson.fromJson(histJson, ReadingHistoryResponse::class.java)
        assertEquals(1, parsedHist.items.size)
        assertEquals(5, parsedHist.items.first().last_read_page_number)

        val statsJson = """
            {
              "user_id": "u1",
              "total_mangas_read": 4,
              "total_chapters_read": 22,
              "top_tags": [{"slug": "horror", "name": "Horror", "manga_count": 3}],
              "reading_frequency": {"last_7_days": 8, "last_30_days": 22},
              "average_score_given": 8.5
            }
        """.trimIndent()
        val parsedStats = gson.fromJson(statsJson, ReadingAnalyticsResponse::class.java)
        assertEquals(8, parsedStats.reading_frequency.last_7_days)
        assertEquals("Horror", parsedStats.top_tags.first().name)
        assertEquals(8.5, parsedStats.average_score_given!!, 0.01)
    }
}

