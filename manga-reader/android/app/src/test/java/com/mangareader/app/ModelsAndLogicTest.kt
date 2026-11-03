package com.mangareader.app

import com.mangareader.app.data.model.ChapterItem
import org.junit.Assert.assertEquals
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
}

