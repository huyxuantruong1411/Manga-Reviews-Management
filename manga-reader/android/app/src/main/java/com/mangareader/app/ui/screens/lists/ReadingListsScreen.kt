package com.mangareader.app.ui.screens.lists

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
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
import com.mangareader.app.data.model.CreateReadingListRequest
import com.mangareader.app.data.model.MergeListsRequest
import com.mangareader.app.data.model.ReadingListDetail
import com.mangareader.app.ui.components.EmptyState
import com.mangareader.app.ui.components.IaaSBadge
import com.mangareader.app.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun ReadingListsScreen(
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    var lists by remember { mutableStateOf<List<ReadingListDetail>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }

    // Dialogs
    var showCreateDialog by remember { mutableStateOf(false) }
    var newListName by remember { mutableStateOf("") }
    var newListDescription by remember { mutableStateOf("") }

    var showMergeDialog by remember { mutableStateOf(false) }
    var mergeSourceId by remember { mutableStateOf("") }
    var mergeTargetId by remember { mutableStateOf("") }

    val loadLists = {
        coroutineScope.launch {
            isLoading = true
            try {
                val res = RetrofitClient.api.getReadingLists()
                if (res.isSuccessful && res.body() != null) {
                    lists = res.body()!!.items
                }
            } catch (_: Exception) {
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadLists()
    }

    val handleCreateList = {
        if (newListName.isNotBlank()) {
            coroutineScope.launch {
                try {
                    val res = RetrofitClient.api.createReadingList(
                        CreateReadingListRequest(name = newListName, description = newListDescription)
                    )
                    if (res.isSuccessful) {
                        showCreateDialog = false
                        newListName = ""
                        newListDescription = ""
                        loadLists()
                    }
                } catch (_: Exception) {}
            }
        }
    }

    val handleMergeLists = {
        if (mergeSourceId.isNotBlank() && mergeTargetId.isNotBlank() && mergeSourceId != mergeTargetId) {
            coroutineScope.launch {
                try {
                    val res = RetrofitClient.api.mergeReadingLists(
                        MergeListsRequest(
                            source_list_id = mergeSourceId,
                            target_list_id = mergeTargetId,
                            delete_source_after_merge = true
                        )
                    )
                    if (res.isSuccessful) {
                        showMergeDialog = false
                        loadLists()
                    }
                } catch (_: Exception) {}
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
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                    }
                    Text(
                        text = "READING LISTS (UC-7)",
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        color = TextPrimary
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (lists.size >= 2) {
                        TextButton(onClick = { showMergeDialog = true }) {
                            Text("MERGE", fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = AccentAmber)
                        }
                    }
                    IconButton(onClick = { showCreateDialog = true }) {
                        Icon(Icons.Default.Add, contentDescription = "New List", tint = AccentAmber)
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
            if (isLoading && lists.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = AccentAmber)
                }
            } else if (lists.isEmpty()) {
                EmptyState(
                    title = "NO READING LISTS FOUND",
                    description = "Create customizable lists to organize favorite manga and track backlog.",
                    actionLabel = "CREATE NEW LIST",
                    onAction = { showCreateDialog = true },
                    modifier = Modifier.align(Alignment.Center)
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(lists, key = { it.list_id }) { list ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(4.dp))
                                .background(DarkSurface)
                                .border(1.dp, DarkBorder, RoundedCornerShape(4.dp))
                                .padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    text = list.name,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = TextPrimary
                                )
                                if (list.description.isNotBlank()) {
                                    Text(text = list.description, fontSize = 12.sp, color = TextSecondary)
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    IaaSBadge(text = "${list.manga_count} TITLES", textColor = AccentAmber)
                                    IaaSBadge(text = list.visibility.uppercase(), textColor = TextMuted)
                                }
                            }
                            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = TextMuted)
                        }
                    }
                }
            }
        }
    }

    // Create List Dialog
    if (showCreateDialog) {
        AlertDialog(
            onDismissRequest = { showCreateDialog = false },
            title = {
                Text("CREATE READING LIST", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = newListName,
                        onValueChange = { newListName = it },
                        label = { Text("List Name", fontSize = 12.sp) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = newListDescription,
                        onValueChange = { newListDescription = it },
                        label = { Text("Description (Optional)", fontSize = 12.sp) },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = { handleCreateList() },
                    colors = ButtonDefaults.buttonColors(containerColor = AccentAmber, contentColor = DarkBackground),
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text("CREATE", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreateDialog = false }) {
                    Text("CANCEL", fontFamily = FontFamily.Monospace, color = TextSecondary)
                }
            },
            containerColor = DarkSurface
        )
    }

    // Merge Lists Dialog
    if (showMergeDialog && lists.size >= 2) {
        AlertDialog(
            onDismissRequest = { showMergeDialog = false },
            title = {
                Text("MERGE READING LISTS (UC-7.6)", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Deduplicates items and merges source list into target list:", fontSize = 12.sp, color = TextSecondary)
                    Text("Select source and target from existing lists.", fontSize = 11.sp, color = TextMuted)
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        mergeSourceId = lists.first().list_id
                        mergeTargetId = lists.last().list_id
                        handleMergeLists()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = AccentAmber, contentColor = DarkBackground),
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text("EXECUTE MERGE", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showMergeDialog = false }) {
                    Text("CANCEL", fontFamily = FontFamily.Monospace, color = TextSecondary)
                }
            },
            containerColor = DarkSurface
        )
    }
}

