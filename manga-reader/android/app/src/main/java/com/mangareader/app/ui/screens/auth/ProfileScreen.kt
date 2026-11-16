package com.mangareader.app.ui.screens.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.mangareader.app.MangaReaderApplication
import com.mangareader.app.data.api.RetrofitClient
import com.mangareader.app.data.model.UpdatePasswordRequest
import com.mangareader.app.data.model.UpdateProfileRequest
import com.mangareader.app.data.model.UserProfile
import com.mangareader.app.ui.components.IaaSBadge
import com.mangareader.app.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun ProfileScreen(
    onSignOut: () -> Unit,
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    var userProfile by remember { mutableStateOf<UserProfile?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var message by remember { mutableStateOf<String?>(null) }
    var isSuccess by remember { mutableStateOf(false) }

    // Edit fields
    var displayName by remember { mutableStateOf("") }
    var bio by remember { mutableStateOf("") }

    // Password fields
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }

    // Server URL
    var currentBaseUrl by remember { mutableStateOf(MangaReaderApplication.instance.getBaseUrl()) }

    val loadProfile = {
        coroutineScope.launch {
            isLoading = true
            try {
                val res = RetrofitClient.api.getMyProfile()
                if (res.isSuccessful && res.body() != null) {
                    val p = res.body()!!
                    userProfile = p
                    displayName = p.display_name
                    bio = p.bio ?: ""
                }
            } catch (_: Exception) {
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadProfile()
    }

    val handleUpdateProfile = {
        coroutineScope.launch {
            try {
                val res = RetrofitClient.api.updateProfile(
                    UpdateProfileRequest(display_name = displayName, bio = bio)
                )
                if (res.isSuccessful) {
                    message = "Profile updated successfully"
                    isSuccess = true
                    loadProfile()
                } else {
                    message = res.errorBody()?.string() ?: "Update failed"
                    isSuccess = false
                }
            } catch (e: Exception) {
                message = e.message
                isSuccess = false
            }
        }
    }

    val handleUpdatePassword = {
        coroutineScope.launch {
            if (newPassword != confirmPassword) {
                message = "New password and confirmation do not match"
                isSuccess = false
                return@launch
            }
            try {
                val res = RetrofitClient.api.updatePassword(
                    UpdatePasswordRequest(
                        current_password = currentPassword,
                        new_password = newPassword,
                        confirm_password = confirmPassword
                    )
                )
                if (res.isSuccessful) {
                    message = "Password changed! Active sessions revoked. Please sign in again."
                    isSuccess = true
                    currentPassword = ""
                    newPassword = ""
                    confirmPassword = ""
                } else {
                    message = res.errorBody()?.string() ?: "Failed to change password"
                    isSuccess = false
                }
            } catch (e: Exception) {
                message = e.message
                isSuccess = false
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
                    text = "ACCOUNT CONTROL & SETTINGS",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
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
            if (message != null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(if (isSuccess) AccentEmeraldSubtle else AccentRedSubtle, RoundedCornerShape(4.dp))
                        .border(1.dp, if (isSuccess) AccentEmerald else AccentRed, RoundedCornerShape(4.dp))
                        .padding(10.dp)
                ) {
                    Text(
                        text = message!!,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp,
                        color = if (isSuccess) AccentEmerald else AccentRed
                    )
                }
            }

            // User Identity Card
            if (userProfile != null) {
                val p = userProfile!!
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(DarkSurface, RoundedCornerShape(6.dp))
                        .border(1.dp, DarkBorder, RoundedCornerShape(6.dp))
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(54.dp)
                            .clip(CircleShape)
                            .background(DarkSurfaceElevated)
                            .border(1.dp, DarkBorderSubtle, CircleShape)
                    ) {
                        val resolvedAvatar = MangaReaderApplication.resolveMediaUrl(p.avatar_url)
                        if (!resolvedAvatar.isNullOrBlank()) {
                            AsyncImage(
                                model = resolvedAvatar,
                                contentDescription = "Avatar",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize()
                            )
                        } else {
                            Text(
                                text = p.username.take(1).uppercase(),
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold,
                                fontSize = 20.sp,
                                color = AccentAmber,
                                modifier = Modifier.align(Alignment.Center)
                            )
                        }
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(text = p.display_name, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = TextPrimary)
                        Text(text = "@${p.username} • ${p.email ?: ""}", fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = TextSecondary)
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            IaaSBadge(text = p.role.uppercase(), textColor = AccentAmber)
                            IaaSBadge(text = p.status.uppercase(), textColor = AccentEmerald)
                        }
                    }
                }
            }

            // Profile Edit
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DarkSurface, RoundedCornerShape(6.dp))
                    .border(1.dp, DarkBorder, RoundedCornerShape(6.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "EDIT PROFILE INFORMATION",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    color = TextPrimary
                )

                OutlinedTextField(
                    value = displayName,
                    onValueChange = { displayName = it },
                    label = { Text("Display Name", fontSize = 12.sp) },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AccentAmber,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = bio,
                    onValueChange = { bio = it },
                    label = { Text("Biography", fontSize = 12.sp) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AccentAmber,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                Button(
                    onClick = { handleUpdateProfile() },
                    colors = ButtonDefaults.buttonColors(containerColor = AccentAmber, contentColor = DarkBackground),
                    shape = RoundedCornerShape(4.dp),
                    modifier = Modifier.align(Alignment.End)
                ) {
                    Text("SAVE CHANGES", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                }
            }

            // Password Change
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DarkSurface, RoundedCornerShape(6.dp))
                    .border(1.dp, DarkBorder, RoundedCornerShape(6.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "SECURITY & PASSWORD UPDATE",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    color = TextPrimary
                )
                Text(
                    text = "Updating password revokes all active JWT tokens via session version increment (UC-6.3).",
                    fontSize = 11.sp,
                    color = TextSecondary
                )

                OutlinedTextField(
                    value = currentPassword,
                    onValueChange = { currentPassword = it },
                    label = { Text("Current Password", fontSize = 12.sp) },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AccentAmber,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = newPassword,
                    onValueChange = { newPassword = it },
                    label = { Text("New Password", fontSize = 12.sp) },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AccentAmber,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = confirmPassword,
                    onValueChange = { confirmPassword = it },
                    label = { Text("Confirm New Password", fontSize = 12.sp) },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AccentAmber,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                Button(
                    onClick = { handleUpdatePassword() },
                    enabled = currentPassword.isNotBlank() && newPassword.length >= 8 && confirmPassword == newPassword,
                    colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceElevated, contentColor = TextPrimary),
                    shape = RoundedCornerShape(4.dp),
                    modifier = Modifier.align(Alignment.End).border(1.dp, DarkBorder, RoundedCornerShape(4.dp))
                ) {
                    Text("UPDATE PASSWORD", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                }
            }

            // Server Cluster Node Settings
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DarkSurface, RoundedCornerShape(6.dp))
                    .border(1.dp, DarkBorder, RoundedCornerShape(6.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "BACKEND NODE ADDRESS",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    color = TextPrimary
                )
                Text(
                    text = "Target FastAPI service endpoint. Use 10.0.2.2:18000 for Android Studio Emulator.",
                    fontSize = 11.sp,
                    color = TextSecondary
                )

                OutlinedTextField(
                    value = currentBaseUrl,
                    onValueChange = {
                        currentBaseUrl = it
                        MangaReaderApplication.instance.setBaseUrl(it)
                    },
                    label = { Text("Server Base URL", fontSize = 12.sp) },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AccentAmber,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
            }

            // Sign out button
            Button(
                onClick = {
                    MangaReaderApplication.instance.clearAuth()
                    onSignOut()
                },
                colors = ButtonDefaults.buttonColors(containerColor = AccentRedSubtle, contentColor = AccentRed),
                shape = RoundedCornerShape(4.dp),
                modifier = Modifier.fillMaxWidth().height(44.dp).border(1.dp, AccentRed, RoundedCornerShape(4.dp))
            ) {
                Text("SIGN OUT FROM THIS DEVICE", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            }
        }
    }
}

