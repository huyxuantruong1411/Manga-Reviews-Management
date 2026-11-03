package com.mangareader.app.ui.screens.reader

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.mangareader.app.data.api.RetrofitClient
import com.mangareader.app.data.model.ChapterPagesResponse
import com.mangareader.app.data.model.RecordProgressRequest
import com.mangareader.app.ui.components.ErrorState
import com.mangareader.app.ui.components.IaaSBadge
import com.mangareader.app.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun ReaderScreen(
    chapterId: String,
    onNavigateChapter: (String) -> Unit,
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    var chapterData by remember { mutableStateOf<ChapterPagesResponse?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // Reader UI Controls overlay visibility
    var showOverlay by remember { mutableStateOf(false) }

    // Reading settings
    var readingMode by remember { mutableStateOf("vertical_scroll") } // "vertical_scroll" or "single_page"
    var currentPageIndex by remember { mutableStateOf(0) }
    var dwellSeconds by remember { mutableStateOf(0) }

    val listState = rememberLazyListState()

    // Dwell Time Tracker for anti-F5 & accurate read metrics
    LaunchedEffect(chapterId) {
        dwellSeconds = 0
        while (true) {
            delay(1000)
            dwellSeconds += 1
        }
    }

    val recordProgress = { pageNum: Int, isCompleted: Boolean ->
        coroutineScope.launch {
            try {
                RetrofitClient.api.recordProgress(
                    chapterId = chapterId,
                    request = RecordProgressRequest(
                        page_number = pageNum,
                        is_completed = isCompleted,
                        dwell_seconds = dwellSeconds,
                        pages_read_count = 1
                    )
                )
            } catch (_: Exception) {}
        }
    }

    val loadChapter = {
        coroutineScope.launch {
            isLoading = true
            errorMessage = null
            try {
                val res = RetrofitClient.api.getChapterPages(chapterId)
                if (res.isSuccessful && res.body() != null) {
                    chapterData = res.body()!!
                } else {
                    errorMessage = res.errorBody()?.string() ?: "Failed to load chapter pages"
                }
            } catch (e: Exception) {
                errorMessage = e.localizedMessage ?: "Failed to connect to backend"
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(chapterId) {
        loadChapter()
    }

    // Sync progress on scroll in vertical mode
    LaunchedEffect(listState.firstVisibleItemIndex) {
        val pageNumber = listState.firstVisibleItemIndex + 1
        val total = chapterData?.page_count ?: 1
        val isCompleted = pageNumber >= total
        recordProgress(pageNumber, isCompleted)
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .clickable { showOverlay = !showOverlay }
    ) {
        if (isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = AccentAmber)
            }
        } else if (errorMessage != null) {
            ErrorState(
                message = errorMessage!!,
                onRetry = { loadChapter() },
                modifier = Modifier.align(Alignment.Center)
            )
        } else if (chapterData != null) {
            val data = chapterData!!

            if (readingMode == "vertical_scroll") {
                // Webtoon continuous vertical scroll
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    itemsIndexed(data.pages, key = { _, p -> p.page_uid }) { index, page ->
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .defaultMinSize(minHeight = 300.dp)
                                .background(Color.Black)
                        ) {
                            AsyncImage(
                                model = page.image_url,
                                contentDescription = "Page ${page.page_number}",
                                contentScale = ContentScale.FillWidth,
                                modifier = Modifier.fillMaxWidth()
                            )

                            // Page number indicator overlay at corner
                            Text(
                                text = "${page.page_number} / ${data.page_count}",
                                fontFamily = FontFamily.Monospace,
                                fontSize = 10.sp,
                                color = TextMuted.copy(alpha = 0.6f),
                                modifier = Modifier
                                    .align(Alignment.BottomEnd)
                                    .padding(8.dp)
                            )
                        }
                    }

                    // End of Chapter Next Chapter Banner
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(32.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Text(
                                text = "END OF CHAPTER ${data.chapter_number}",
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = TextPrimary
                            )

                            if (data.next_chapter_id != null) {
                                Button(
                                    onClick = { onNavigateChapter(data.next_chapter_id) },
                                    colors = ButtonDefaults.buttonColors(containerColor = AccentAmber, contentColor = DarkBackground),
                                    shape = RoundedCornerShape(4.dp)
                                ) {
                                    Text("NEXT CHAPTER →", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                                }
                            } else {
                                Text(
                                    text = "You are caught up with the latest chapter!",
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 11.sp,
                                    color = AccentEmerald
                                )
                            }
                        }
                    }
                }
            } else {
                // Single Page Mode
                val pages = data.pages
                if (pages.isNotEmpty() && currentPageIndex in pages.indices) {
                    val currentPage = pages[currentPageIndex]
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        AsyncImage(
                            model = currentPage.image_url,
                            contentDescription = "Page ${currentPage.page_number}",
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxSize()
                        )

                        // Left/Right Tap Zones for page flip
                        Row(modifier = Modifier.fillMaxSize()) {
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxHeight()
                                    .clickable {
                                        if (currentPageIndex > 0) {
                                            currentPageIndex -= 1
                                            recordProgress(currentPageIndex + 1, false)
                                        }
                                    }
                            )
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxHeight()
                                    .clickable {
                                        if (currentPageIndex < pages.size - 1) {
                                            currentPageIndex += 1
                                            val isComp = currentPageIndex == pages.size - 1
                                            recordProgress(currentPageIndex + 1, isComp)
                                        }
                                    }
                            )
                        }
                    }
                }
            }

            // Top Overlay Bar (Animated)
            AnimatedVisibility(
                visible = showOverlay,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier.align(Alignment.TopCenter)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(DarkBackground.copy(alpha = 0.95f))
                        .border(1.dp, DarkBorder)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                    }

                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "CHAPTER ${data.chapter_number}",
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                            color = TextPrimary
                        )
                        if (!data.title.isNullOrBlank()) {
                            Text(text = data.title, fontSize = 11.sp, color = TextSecondary)
                        }
                    }

                    // Mode Toggle: Webtoon vs Single Page
                    TextButton(
                        onClick = {
                            readingMode = if (readingMode == "vertical_scroll") "single_page" else "vertical_scroll"
                        }
                    ) {
                        Text(
                            text = if (readingMode == "vertical_scroll") "VERTICAL" else "SINGLE",
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp,
                            color = AccentAmber
                        )
                    }
                }
            }

            // Bottom Overlay Bar (Animated)
            AnimatedVisibility(
                visible = showOverlay,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier.align(Alignment.BottomCenter)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(DarkBackground.copy(alpha = 0.95f))
                        .border(1.dp, DarkBorder)
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Button(
                        onClick = {
                            data.prev_chapter_id?.let { onNavigateChapter(it) }
                        },
                        enabled = data.prev_chapter_id != null,
                        colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceElevated),
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text("← PREV", fontFamily = FontFamily.Monospace, fontSize = 11.sp)
                    }

                    Text(
                        text = "${data.page_count} pages • ${dwellSeconds}s dwell",
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp,
                        color = TextSecondary
                    )

                    Button(
                        onClick = {
                            data.next_chapter_id?.let { onNavigateChapter(it) }
                        },
                        enabled = data.next_chapter_id != null,
                        colors = ButtonDefaults.buttonColors(containerColor = AccentAmber, contentColor = DarkBackground),
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text("NEXT →", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                    }
                }
            }
        }
    }
}

