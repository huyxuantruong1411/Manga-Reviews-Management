package com.mangareader.app.ui.screens.catalog

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mangareader.app.data.api.RetrofitClient
import com.mangareader.app.data.model.AutocompleteItem
import com.mangareader.app.data.model.MangaItem
import com.mangareader.app.ui.components.EmptyState
import com.mangareader.app.ui.components.MangaGridCard
import com.mangareader.app.ui.theme.*
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun SearchScreen(
    onMangaClick: (String) -> Unit,
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var searchType by remember { mutableStateOf("all") } // "all", "title", or "creator"
    var isSearching by remember { mutableStateOf(false) }
    var results by remember { mutableStateOf<List<MangaItem>>(emptyList()) }
    var autocompleteSuggestions by remember { mutableStateOf<List<AutocompleteItem>>(emptyList()) }

    var debounceJob by remember { mutableStateOf<Job?>(null) }

    val performSearch: (String) -> Unit = { q ->
        if (q.isNotBlank()) {
            coroutineScope.launch {
                isSearching = true
                try {
                    val res = RetrofitClient.api.searchMangas(query = q, searchType = searchType)
                    if (res.isSuccessful && res.body() != null) {
                        results = res.body()!!.items
                        autocompleteSuggestions = emptyList()
                    }
                } catch (_: Exception) {
                } finally {
                    isSearching = false
                }
            }
        }
    }

    LaunchedEffect(query, searchType) {
        debounceJob?.cancel()
        if (query.length >= 2) {
            debounceJob = coroutineScope.launch {
                delay(300)
                try {
                    val res = RetrofitClient.api.autocomplete(query)
                    if (res.isSuccessful && res.body() != null) {
                        autocompleteSuggestions = res.body()!!.items
                    }
                } catch (_: Exception) {}
            }
        } else {
            autocompleteSuggestions = emptyList()
        }
    }

    Scaffold(
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DarkBackground)
                    .border(width = 1.dp, color = DarkBorder)
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    IconButton(
                        onClick = onBackClick,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                    }

                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = {
                            Text(
                                text = when (searchType) {
                                    "title" -> "Search by title (unaccented)..."
                                    "creator" -> "Search by author or artist..."
                                    else -> "Search title, author, or artist..."
                                },
                                color = TextMuted,
                                fontSize = 13.sp
                            )
                        },
                        trailingIcon = {
                            if (query.isNotEmpty()) {
                                IconButton(onClick = { query = ""; results = emptyList() }) {
                                    Icon(Icons.Default.Clear, contentDescription = "Clear", tint = TextSecondary)
                                }
                            }
                        },
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { performSearch(query) }),
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
                        modifier = Modifier.weight(1f)
                    )

                    Button(
                        onClick = { performSearch(query) },
                        colors = ButtonDefaults.buttonColors(containerColor = AccentAmber, contentColor = DarkBackground),
                        shape = RoundedCornerShape(4.dp),
                        modifier = Modifier.height(48.dp)
                    ) {
                        Icon(Icons.Default.Search, contentDescription = "Search")
                    }
                }

                // All / Title / Creator Toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    listOf("all" to "ALL", "title" to "TITLE", "creator" to "CREATOR").forEach { (key, label) ->
                        val isSelected = searchType == key
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(3.dp))
                                .background(if (isSelected) DarkSurfaceElevated else DarkSurface)
                                .border(1.dp, if (isSelected) AccentAmber else DarkBorder, RoundedCornerShape(3.dp))
                                .clickable {
                                    searchType = key
                                    if (query.isNotBlank()) performSearch(query)
                                }
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Text(
                                text = label,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isSelected) AccentAmber else TextSecondary
                            )
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
            if (isSearching) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = AccentAmber)
                }
            } else if (autocompleteSuggestions.isNotEmpty() && results.isEmpty()) {
                // Autocomplete dropdown list
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                        .background(DarkSurface, RoundedCornerShape(4.dp))
                        .border(1.dp, DarkBorder, RoundedCornerShape(4.dp))
                ) {
                    item {
                        Text(
                            text = "SUGGESTIONS",
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextMuted,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                    items(autocompleteSuggestions) { item ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    query = item.title
                                    performSearch(item.title)
                                }
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(text = item.title, color = TextPrimary, fontSize = 13.sp)
                            Text(text = "↳", fontFamily = FontFamily.Monospace, color = AccentAmber)
                        }
                    }
                }
            } else if (results.isNotEmpty()) {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    contentPadding = PaddingValues(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(results, key = { it.poolMangaId }) { manga ->
                        MangaGridCard(
                            manga = manga,
                            onClick = { onMangaClick(manga.slug) }
                        )
                    }
                }
            } else if (query.isNotBlank()) {
                EmptyState(
                    title = "NO RESULTS FOUND",
                    description = "No manga matches '$query'. Check spelling or switch search mode.",
                    modifier = Modifier.align(Alignment.Center)
                )
            } else {
                EmptyState(
                    title = "SEARCH DATABASE",
                    description = "Enter title, author, or artist to query the Manga Data Lake catalog.",
                    modifier = Modifier.align(Alignment.Center)
                )
            }
        }
    }
}

