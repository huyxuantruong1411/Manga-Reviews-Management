package com.example.mangareader_android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.example.mangareader_android.data.model.ChapterModels.ChapterItem;
import java.text.Normalizer;
import java.util.ArrayList;
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

