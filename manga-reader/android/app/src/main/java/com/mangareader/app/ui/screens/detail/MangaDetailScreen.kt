package com.mangareader.app.ui.screens.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.mangareader.app.MangaReaderApplication
import com.mangareader.app.data.api.RetrofitClient
import com.mangareader.app.data.model.*
import com.mangareader.app.ui.components.*
import com.mangareader.app.ui.theme.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MangaDetailScreen(
    idOrSlug: String,
    onChapterClick: (String) -> Unit,
    onMangaClick: (String) -> Unit,
    onBackClick: () -> Unit,
    onAuthRequired: () -> Unit,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    var manga by remember { mutableStateOf<MangaItem?>(null) }
    var chapters by remember { mutableStateOf<List<ChapterItem>>(emptyList()) }
    var contentRecs by remember { mutableStateOf<List<MangaItem>>(emptyList()) }
    var readingLists by remember { mutableStateOf<List<ReadingListDetail>>(emptyList()) }

    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var snackbarMessage by remember { mutableStateOf<String?>(null) }

    // Chapter filters
    var chapterSearch by remember { mutableStateOf("") }
    var sortOrder by remember { mutableStateOf("desc") }

    // Dialogs
    var showRatingDialog by remember { mutableStateOf(false) }
    var ratingScore by remember { mutableStateOf(10) }
    var showReportDialog by remember { mutableStateOf(false) }
    var reportReason by remember { mutableStateOf("") }
    var showAddToListDialog by remember { mutableStateOf(false) }

    val loadMangaDetail = {
        coroutineScope.launch {
            isLoading = true
            errorMessage = null
            try {
                val res = RetrofitClient.api.getMangaDetail(idOrSlug)
                if (res.isSuccessful && res.body() != null) {
                    val m = res.body()!!
                    manga = m

                    // Load chapters
                    val chRes = RetrofitClient.api.getChapters(
                        mangaId = m.poolMangaId,
                        sortOrder = sortOrder,
                        search = chapterSearch.ifBlank { null }
                    )
                    if (chRes.isSuccessful && chRes.body() != null) {
                        chapters = chRes.body()!!.items
                    }

                    // Load Content-Based Recs
                    try {
                        val recRes = RetrofitClient.api.getContentRecommendations(m.poolMangaId)
                        if (recRes.isSuccessful && recRes.body() != null) {
                            contentRecs = recRes.body()!!.items
                        }
                    } catch (_: Exception) {}
                } else {
                    errorMessage = res.errorBody()?.string() ?: "Manga not found"
                }
            } catch (e: Exception) {
                errorMessage = e.localizedMessage ?: "Failed to connect to backend"
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(idOrSlug, sortOrder, chapterSearch) {
        loadMangaDetail()
    }

    val handleReadFirst = {
        manga?.let { m ->
            coroutineScope.launch {
                try {
                    val res = RetrofitClient.api.getReadFirst(m.poolMangaId)
                    if (res.isSuccessful && res.body() != null) {
                        onChapterClick(res.body()!!.chapter_id)
                    } else if (chapters.isNotEmpty()) {
                        val firstCh = chapters.minByOrNull { it.chapter_numeric } ?: chapters.first()
                        onChapterClick(firstCh.poolChapterId)
                    }
                } catch (_: Exception) {
                    if (chapters.isNotEmpty()) onChapterClick(chapters.last().poolChapterId)
                }
            }
        }
    }

    val handleContinueReading = {
        manga?.let { m ->
            coroutineScope.launch {
                try {
                    val res = RetrofitClient.api.getContinueReading(m.poolMangaId)
                    if (res.isSuccessful && res.body() != null) {
                        onChapterClick(res.body()!!.chapter_id)
                    } else {
                        handleReadFirst()
                    }
                } catch (_: Exception) {
                    handleReadFirst()
                }
            }
        }
    }

    val handleRate = {
        val token = MangaReaderApplication.instance.getAccessToken()
        if (token == null) {
            onAuthRequired()
        } else {
            manga?.let { m ->
                coroutineScope.launch {
                    try {
                        val res = RetrofitClient.api.rateManga(m.poolMangaId, RateMangaRequest(score = ratingScore))
                        if (res.isSuccessful) {
                            snackbarMessage = "Rating of $ratingScore/10 saved"
                            showRatingDialog = false
                            loadMangaDetail()
                        } else {
                            snackbarMessage = res.errorBody()?.string() ?: "Rating failed"
                        }
                    } catch (e: Exception) {
                        snackbarMessage = e.message
                    }
                }
            }
        }
    }

    val handleReport = {
        val token = MangaReaderApplication.instance.getAccessToken()
        if (token == null) {
            onAuthRequired()
        } else if (reportReason.isNotBlank()) {
            manga?.let { m ->
                coroutineScope.launch {
                    try {
                        val res = RetrofitClient.api.reportManga(m.poolMangaId, ReportMangaRequest(reason = reportReason))
                        if (res.isSuccessful) {
                            snackbarMessage = "Report submitted to admin review queue"
                            showReportDialog = false
                            reportReason = ""
                        }
                    } catch (e: Exception) {
                        snackbarMessage = e.message
                    }
                }
            }
        }
    }

    Scaffold(
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DarkBackground)
                    .border(width = 1.dp, color = DarkBorder)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                IconButton(onClick = onBackClick) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                }
                Text(
                    text = manga?.title ?: "MANGA DETAIL",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    color = TextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f).padding(horizontal = 8.dp)
                )
                IconButton(onClick = { showReportDialog = true }) {
                    Icon(Icons.Default.Warning, contentDescription = "Report", tint = TextMuted)
                }
            }
        },
        containerColor = DarkBackground
    ) { paddingValues ->
        Box(
            modifier = modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            if (isLoading && manga == null) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = AccentAmber)
                }
            } else if (errorMessage != null) {
                ErrorState(
                    message = errorMessage!!,
                    onRetry = { loadMangaDetail() },
                    modifier = Modifier.align(Alignment.Center)
                )
            } else if (manga != null) {
                val m = manga!!
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Hero Section: Cover + Details
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            // Cover Image
                            AsyncImage(
                                model = m.cover_url,
                                contentDescription = m.title,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .width(110.dp)
                                    .aspectRatio(0.70f)
                                    .clip(RoundedCornerShape(6.dp))
                                    .border(1.dp, DarkBorder, RoundedCornerShape(6.dp))
                            )

                            // Title & Badges
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(
                                    text = m.title,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TextPrimary,
                                    lineHeight = 20.sp
                                )

                                if (m.alt_titles.isNotEmpty()) {
                                    Text(
                                        text = m.alt_titles.first(),
                                        fontSize = 11.sp,
                                        color = TextMuted,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }

                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    IaaSBadge(
                                        text = m.status.uppercase(),
                                        textColor = if (m.status == "completed") AccentEmerald else AccentAmber,
                                        borderColor = if (m.status == "completed") AccentEmeraldSubtle else AccentAmberSubtle
                                    )
                                    IaaSBadge(text = m.publication_demographic.uppercase())
                                    if (m.average_rating > 0.0) {
                                        IaaSBadge(
                                            text = "${String.format("%.1f", m.average_rating)} ★",
                                            textColor = AccentAmber
                                        )
                                    }
                                }

                                Text(
                                    text = "${m.chapter_count} chapters • ${m.view_count} views",
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 11.sp,
                                    color = TextSecondary
                                )
                            }
                        }
                    }

                    // Action Buttons: Read First & Continue Reading
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Button(
                                onClick = { handleReadFirst() },
                                colors = ButtonDefaults.buttonColors(containerColor = AccentAmber, contentColor = DarkBackground),
                                shape = RoundedCornerShape(4.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("READ FIRST", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }

                            Button(
                                onClick = { handleContinueReading() },
                                colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceElevated, contentColor = TextPrimary),
                                shape = RoundedCornerShape(4.dp),
                                modifier = Modifier.weight(1f).border(1.dp, DarkBorder, RoundedCornerShape(4.dp))
                            ) {
                                Icon(Icons.Default.Bookmark, contentDescription = null, modifier = Modifier.size(16.dp), tint = AccentAmber)
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("CONTINUE", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }

                            IconButton(
                                onClick = { showRatingDialog = true },
                                modifier = Modifier
                                    .size(40.dp)
                                    .background(DarkSurfaceElevated, RoundedCornerShape(4.dp))
                                    .border(1.dp, DarkBorder, RoundedCornerShape(4.dp))
                            ) {
                                Icon(Icons.Default.Star, contentDescription = "Rate", tint = AccentAmber)
                            }
                        }
                    }

                    // Description & Tags
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(DarkSurface, RoundedCornerShape(6.dp))
                                .border(1.dp, DarkBorder, RoundedCornerShape(6.dp))
                                .padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = "SYNOPSIS",
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp,
                                color = TextMuted
                            )
                            Text(
                                text = m.description.ifBlank { "No description available." },
                                fontSize = 12.sp,
                                color = TextSecondary,
                                lineHeight = 18.sp
                            )

                            if (m.tags.isNotEmpty()) {
                                Spacer(modifier = Modifier.height(4.dp))
                                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    items(m.tags) { tag ->
                                        IaaSBadge(text = "#$tag", textColor = TextSecondary)
                                    }
                                }
                            }
                        }
                    }

                    // Content-Based Recommendations
                    if (contentRecs.isNotEmpty()) {
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    text = "SIMILAR TITLES",
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp,
                                    color = TextPrimary
                                )
                                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    items(contentRecs) { rec ->
                                        MangaGridCard(
                                            manga = rec,
                                            onClick = { onMangaClick(rec.slug) },
                                            modifier = Modifier.width(130.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Chapter List Header & Search/Sort Filters
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "CHAPTERS (${chapters.size})",
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                    color = TextPrimary
                                )

                                // Sort Order Toggle
                                Text(
                                    text = if (sortOrder == "desc") "DESCENDING ↓" else "ASCENDING ↑",
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 11.sp,
                                    color = AccentAmber,
                                    modifier = Modifier.clickable {
                                        sortOrder = if (sortOrder == "desc") "asc" else "desc"
                                    }
                                )
                            }

                            // Numeric / Decimal Chapter Search Field
                            OutlinedTextField(
                                value = chapterSearch,
                                onValueChange = { chapterSearch = it },
                                placeholder = {
                                    Text("Filter chapters (e.g. 10.5, bonus)...", fontSize = 12.sp, color = TextMuted)
                                },
                                singleLine = true,
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = AccentAmber,
                                    unfocusedBorderColor = DarkBorder,
                                    focusedTextColor = TextPrimary,
                                    unfocusedTextColor = TextPrimary,
                                    focusedContainerColor = DarkSurface,
                                    unfocusedContainerColor = DarkSurface
                                ),
                                shape = RoundedCornerShape(4.dp),
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }

                    // Chapter Items
                    items(chapters, key = { it.poolChapterId }) { ch ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(4.dp))
                                .background(DarkSurface)
                                .border(1.dp, DarkBorder, RoundedCornerShape(4.dp))
                                .clickable { onChapterClick(ch.poolChapterId) }
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Text(
                                        text = "CH ${ch.chapter_number}",
                                        fontFamily = FontFamily.Monospace,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        color = if (ch.is_read) TextMuted else TextPrimary
                                    )
                                    if (ch.is_read) {
                                        IaaSBadge(
                                            text = if (ch.is_completed) "COMPLETED" else "PAGE ${ch.last_read_page_number}",
                                            textColor = AccentEmerald,
                                            borderColor = AccentEmeraldSubtle
                                        )
                                    }
                                }
                                if (!ch.title.isNullOrBlank()) {
                                    Text(text = ch.title, fontSize = 11.sp, color = TextSecondary, maxLines = 1)
                                }
                            }

                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(
                                    text = "${ch.page_count}p",
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 11.sp,
                                    color = TextMuted
                                )
                                Icon(Icons.Default.ChevronRight, contentDescription = null, tint = TextMuted)
                            }
                        }
                    }
                }
            }
        }
    }

    // Rating Dialog
    if (showRatingDialog) {
        AlertDialog(
            onDismissRequest = { showRatingDialog = false },
            title = {
                Text("RATE MANGA (1-10)", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Select your evaluation score for ${manga?.title}:", fontSize = 12.sp, color = TextSecondary)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Slider(
                            value = ratingScore.toFloat(),
                            onValueChange = { ratingScore = it.toInt() },
                            valueRange = 1f..10f,
                            steps = 8,
                            colors = SliderDefaults.colors(thumbColor = AccentAmber, activeTrackColor = AccentAmber),
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            text = "$ratingScore ★",
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = AccentAmber,
                            modifier = Modifier.padding(start = 12.dp)
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = { handleRate() },
                    colors = ButtonDefaults.buttonColors(containerColor = AccentAmber, contentColor = DarkBackground),
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text("SUBMIT", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showRatingDialog = false }) {
                    Text("CANCEL", fontFamily = FontFamily.Monospace, color = TextSecondary)
                }
            },
            containerColor = DarkSurface
        )
    }

    // Report Dialog
    if (showReportDialog) {
        AlertDialog(
            onDismissRequest = { showReportDialog = false },
            title = {
                Text("REPORT MANGA CONTENT", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = AccentRed)
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Provide reason for moderation review (e.g. copyright, broken chapters):", fontSize = 12.sp, color = TextSecondary)
                    OutlinedTextField(
                        value = reportReason,
                        onValueChange = { reportReason = it },
                        placeholder = { Text("Reason...", color = TextMuted) },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = AccentRed,
                            unfocusedBorderColor = DarkBorder,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = { handleReport() },
                    colors = ButtonDefaults.buttonColors(containerColor = AccentRed, contentColor = DarkBackground),
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text("SUBMIT REPORT", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showReportDialog = false }) {
                    Text("CANCEL", fontFamily = FontFamily.Monospace, color = TextSecondary)
                }
            },
            containerColor = DarkSurface
        )
    }
}

