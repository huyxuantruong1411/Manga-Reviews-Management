package com.mangareader.app.ui.screens.lists

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mangareader.app.MangaReaderApplication
import com.mangareader.app.data.api.RetrofitClient
import com.mangareader.app.data.model.ReadingAnalyticsResponse
import com.mangareader.app.ui.components.IaaSBadge
import com.mangareader.app.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun StatsScreen(
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    var stats by remember { mutableStateOf<ReadingAnalyticsResponse?>(null) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        val userId = MangaReaderApplication.instance.prefs.getString(MangaReaderApplication.KEY_USER_ID, null)
        if (userId != null) {
            coroutineScope.launch {
                isLoading = true
                try {
                    val res = RetrofitClient.api.getReadingAnalytics(userId)
                    if (res.isSuccessful && res.body() != null) {
                        stats = res.body()!!
                    }
                } catch (_: Exception) {
                } finally {
                    isLoading = false
                }
            }
        } else {
            isLoading = false
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
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBackClick) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                }
                Text(
                    text = "READING METRICS & HABIT ANALYTICS (UC-1.5)",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    color = TextPrimary
                )
            }
        },
        containerColor = DarkBackground
    ) { paddingValues ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "SYSTEM TELEMETRY (REDIS 15M CACHE)",
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = TextMuted
            )

            // Stat Cards Grid
            val data = stats ?: ReadingAnalyticsResponse(user_id = "")
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                MetricBox(
                    label = "CHAPTERS READ",
                    value = "${data.total_chapters_read}",
                    modifier = Modifier.weight(1f)
                )
                MetricBox(
                    label = "TITLES READ",
                    value = "${data.total_mangas_read}",
                    modifier = Modifier.weight(1f)
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                MetricBox(
                    label = "LAST 7 DAYS",
                    value = "${data.reading_frequency.last_7_days} CH",
                    modifier = Modifier.weight(1f)
                )
                MetricBox(
                    label = "AVG SCORE GIVEN",
                    value = data.average_score_given?.let { String.format("%.1f ★", it) } ?: "-",
                    modifier = Modifier.weight(1f)
                )
            }

            // Preferred Tags
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DarkSurface, RoundedCornerShape(6.dp))
                    .border(1.dp, DarkBorder, RoundedCornerShape(6.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "TOP GENRE AFFINITY",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    color = TextPrimary
                )

                if (data.top_tags.isNotEmpty()) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(data.top_tags) { tag ->
                            IaaSBadge(text = "${tag.name.uppercase()} (${tag.manga_count})", textColor = AccentAmber)
                        }
                    }
                } else {
                    Text(
                        text = "Read more chapters to build your personalized genre vector.",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                }
            }
        }
    }
}

@Composable
fun MetricBox(
    label: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .background(DarkSurface, RoundedCornerShape(6.dp))
            .border(1.dp, DarkBorder, RoundedCornerShape(6.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = label,
            fontFamily = FontFamily.Monospace,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            color = TextMuted
        )
        Text(
            text = value,
            fontFamily = FontFamily.Monospace,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = AccentAmber
        )
    }
}

