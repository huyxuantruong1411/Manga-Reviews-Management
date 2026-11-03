package com.mangareader.app.ui.screens.catalog

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mangareader.app.data.api.RetrofitClient
import com.mangareader.app.data.model.MangaItem
import com.mangareader.app.ui.components.*
import com.mangareader.app.ui.theme.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatalogScreen(
    onMangaClick: (String) -> Unit,
    onSearchClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    var mangas by remember { mutableStateOf<List<MangaItem>>(emptyList()) }
    var recommendations by remember { mutableStateOf<List<MangaItem>>(emptyList()) }
    var totalCount by remember { mutableStateOf(0) }
    var currentPage by remember { mutableStateOf(1) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // Filters
    var selectedStatus by remember { mutableStateOf<String?>(null) }
    var selectedDemographic by remember { mutableStateOf<String?>(null) }
    var sortBy by remember { mutableStateOf("latest_update") }
    var showFilterSheet by remember { mutableStateOf(false) }

    val loadCatalog = {
        coroutineScope.launch {
            isLoading = true
            errorMessage = null
            try {
                val res = RetrofitClient.api.getMangas(
                    page = currentPage,
                    pageSize = 24,
                    sortBy = sortBy,
                    status = selectedStatus,
                    demographic = selectedDemographic
                )
                if (res.isSuccessful && res.body() != null) {
                    mangas = res.body()!!.items
                    totalCount = res.body()!!.total
                } else {
                    errorMessage = res.errorBody()?.string() ?: "Failed to load catalog"
                }

                // Load User Recommendations
                try {
                    val recRes = RetrofitClient.api.getUserRecommendations()
                    if (recRes.isSuccessful && recRes.body() != null) {
                        recommendations = recRes.body()!!.items
                    }
                } catch (_: Exception) {}
            } catch (e: Exception) {
                errorMessage = e.localizedMessage ?: "Network error connecting to backend"
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(currentPage, selectedStatus, selectedDemographic, sortBy) {
        loadCatalog()
    }

    Scaffold(
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DarkBackground)
                    .border(width = 1.dp, color = DarkBorder)
                    .padding(horizontal = 16.dp, vertical = 10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "CATALOG EXPLORER",
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                            color = TextPrimary
                        )
                        Text(
                            text = "$totalCount titles indexed • Page $currentPage",
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp,
                            color = TextSecondary
                        )
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        IconButton(
                            onClick = onSearchClick,
                            modifier = Modifier
                                .size(36.dp)
                                .background(DarkSurface, RoundedCornerShape(4.dp))
                                .border(1.dp, DarkBorder, RoundedCornerShape(4.dp))
                        ) {
                            Icon(Icons.Default.Search, contentDescription = "Search", tint = TextPrimary)
                        }

                        IconButton(
                            onClick = { showFilterSheet = true },
                            modifier = Modifier
                                .size(36.dp)
                                .background(DarkSurface, RoundedCornerShape(4.dp))
                                .border(1.dp, DarkBorder, RoundedCornerShape(4.dp))
                        ) {
                            Icon(Icons.Default.FilterList, contentDescription = "Filter", tint = AccentAmber)
                        }
                    }
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
            if (isLoading && mangas.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = AccentAmber)
                }
            } else if (errorMessage != null && mangas.isEmpty()) {
                ErrorState(
                    message = errorMessage!!,
                    onRetry = { loadCatalog() },
                    modifier = Modifier.align(Alignment.Center)
                )
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    contentPadding = PaddingValues(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    // Recommendations Row at Top
                    if (recommendations.isNotEmpty()) {
                        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(DarkSurface, RoundedCornerShape(6.dp))
                                    .border(1.dp, DarkBorder, RoundedCornerShape(6.dp))
                                    .padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "⚡ RECOMMENDED FOR YOU",
                                        fontFamily = FontFamily.Monospace,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp,
                                        color = AccentAmber
                                    )
                                    Text(
                                        text = "Recsys Engine v2",
                                        fontFamily = FontFamily.Monospace,
                                        fontSize = 10.sp,
                                        color = TextMuted
                                    )
                                }

                                LazyRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    items(recommendations) { rec ->
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

                    // Main 24 Catalog Grid
                    items(mangas, key = { it.poolMangaId }) { manga ->
                        MangaGridCard(
                            manga = manga,
                            onClick = { onMangaClick(manga.slug) }
                        )
                    }

                    // Pagination Control
                    item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 16.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Button(
                                onClick = { if (currentPage > 1) currentPage -= 1 },
                                enabled = currentPage > 1,
                                colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceElevated),
                                shape = RoundedCornerShape(4.dp),
                                modifier = Modifier.border(1.dp, DarkBorder, RoundedCornerShape(4.dp))
                            ) {
                                Icon(Icons.Default.ChevronLeft, contentDescription = "Prev")
                                Text("PREV", fontFamily = FontFamily.Monospace, fontSize = 11.sp)
                            }

                            Text(
                                text = "Page $currentPage",
                                fontFamily = FontFamily.Monospace,
                                fontSize = 12.sp,
                                color = TextSecondary,
                                modifier = Modifier.padding(horizontal = 16.dp)
                            )

                            Button(
                                onClick = { currentPage += 1 },
                                enabled = mangas.size == 24,
                                colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceElevated),
                                shape = RoundedCornerShape(4.dp),
                                modifier = Modifier.border(1.dp, DarkBorder, RoundedCornerShape(4.dp))
                            ) {
                                Text("NEXT", fontFamily = FontFamily.Monospace, fontSize = 11.sp)
                                Icon(Icons.Default.ChevronRight, contentDescription = "Next")
                            }
                        }
                    }
                }
            }
        }
    }

    // Filter Bottom Sheet
    if (showFilterSheet) {
        ModalBottomSheet(
            onDismissRequest = { showFilterSheet = false },
            containerColor = DarkSurface,
            scrimColor = DarkBackground.copy(alpha = 0.8f)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "CATALOG FILTERS",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    color = TextPrimary
                )

                // Status Filter
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Publication Status", fontSize = 12.sp, color = TextSecondary)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(null to "ALL", "ongoing" to "ONGOING", "completed" to "COMPLETED").forEach { (valKey, label) ->
                            val isSelected = selectedStatus == valKey
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(if (isSelected) AccentAmber else DarkSurfaceElevated)
                                    .border(1.dp, if (isSelected) AccentAmber else DarkBorder, RoundedCornerShape(4.dp))
                                    .clickable { selectedStatus = valKey }
                                    .padding(horizontal = 10.dp, vertical = 6.dp)
                            ) {
                                Text(
                                    text = label,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = if (isSelected) DarkBackground else TextPrimary
                                )
                            }
                        }
                    }
                }

                // Demographic Filter
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Demographic", fontSize = 12.sp, color = TextSecondary)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(null to "ALL", "shounen" to "SHOUNEN", "seinen" to "SEINEN", "shoujo" to "SHOUJO").forEach { (valKey, label) ->
                            val isSelected = selectedDemographic == valKey
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(if (isSelected) AccentAmber else DarkSurfaceElevated)
                                    .border(1.dp, if (isSelected) AccentAmber else DarkBorder, RoundedCornerShape(4.dp))
                                    .clickable { selectedDemographic = valKey }
                                    .padding(horizontal = 10.dp, vertical = 6.dp)
                            ) {
                                Text(
                                    text = label,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = if (isSelected) DarkBackground else TextPrimary
                                )
                            }
                        }
                    }
                }

                Button(
                    onClick = {
                        currentPage = 1
                        showFilterSheet = false
                        loadCatalog()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = AccentAmber, contentColor = DarkBackground),
                    shape = RoundedCornerShape(4.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("APPLY FILTERS", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

