package com.mangareader.app.ui.screens.lists

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.mangareader.app.data.api.RetrofitClient
import com.mangareader.app.data.model.ReadingHistoryItem
import com.mangareader.app.ui.components.EmptyState
import com.mangareader.app.ui.components.IaaSBadge
import com.mangareader.app.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun HistoryScreen(
    onChapterClick: (String) -> Unit,
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    var historyItems by remember { mutableStateOf<List<ReadingHistoryItem>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        coroutineScope.launch {
            isLoading = true
            try {
                val res = RetrofitClient.api.getReadingHistory()
                if (res.isSuccessful && res.body() != null) {
                    historyItems = res.body()!!
                }
            } catch (_: Exception) {
            } finally {
                isLoading = false
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
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBackClick) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                }
                Text(
                    text = "READING HISTORY",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    color = TextPrimary
                )
            }
        },
        containerColor = DarkBackground
    ) { paddingValues ->
        Box(
            modifier = modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            if (isLoading && historyItems.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = AccentAmber)
                }
            } else if (historyItems.isEmpty()) {
                EmptyState(
                    title = "NO READING HISTORY",
                    description = "Chapters you read will appear here with page bookmark sync.",
                    modifier = Modifier.align(Alignment.Center)
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(historyItems, key = { it.history_id }) { item ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(4.dp))
                                .background(DarkSurface)
                                .border(1.dp, DarkBorder, RoundedCornerShape(4.dp))
                                .clickable { onChapterClick(item.chapter_id) }
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            AsyncImage(
                                model = item.cover_url,
                                contentDescription = item.manga_title,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(width = 46.dp, height = 64.dp)
                                    .clip(RoundedCornerShape(3.dp))
                                    .background(DarkSurfaceElevated)
                            )

                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(
                                    text = item.manga_title,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                    color = TextPrimary
                                )
                                Text(
                                    text = "Chapter ${item.chapter_number} • Page ${item.last_read_page}",
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 11.sp,
                                    color = TextSecondary
                                )
                                if (item.is_completed) {
                                    IaaSBadge(text = "COMPLETED", textColor = AccentEmerald, borderColor = AccentEmeraldSubtle)
                                }
                            }

                            Button(
                                onClick = { onChapterClick(item.chapter_id) },
                                colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceElevated, contentColor = AccentAmber),
                                shape = RoundedCornerShape(4.dp),
                                modifier = Modifier.border(1.dp, DarkBorder, RoundedCornerShape(4.dp))
                            ) {
                                Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(14.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("RESUME", fontFamily = FontFamily.Monospace, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }
}

