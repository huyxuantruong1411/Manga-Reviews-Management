package com.mangareader.app.ui.screens.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mangareader.app.MangaReaderApplication
import com.mangareader.app.data.api.RetrofitClient
import com.mangareader.app.data.model.LoginRequest
import com.mangareader.app.data.model.RegisterRequest
import com.mangareader.app.data.model.ResendOtpRequest
import com.mangareader.app.data.model.VerifyEmailRequest
import com.mangareader.app.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun AuthScreen(
    onAuthSuccess: () -> Unit,
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    var isLoginMode by remember { mutableStateOf(true) }

    // Login state
    var loginUsername by remember { mutableStateOf("") }
    var loginPassword by remember { mutableStateOf("") }

    // Register state
    var regEmail by remember { mutableStateOf("") }
    var regUsername by remember { mutableStateOf("") }
    var regDisplayName by remember { mutableStateOf("") }
    var regPassword by remember { mutableStateOf("") }

    // OTP state
    var showOtpDialog by remember { mutableStateOf(false) }
    var otpCode by remember { mutableStateOf("") }
    var otpSecondsLeft by remember { mutableStateOf(120) }

    var isLoading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var isSuccessMessage by remember { mutableStateOf(false) }

    // 120s OTP Countdown Timer
    LaunchedEffect(showOtpDialog) {
        if (showOtpDialog) {
            otpSecondsLeft = 120
            while (otpSecondsLeft > 0) {
                delay(1000)
                otpSecondsLeft -= 1
            }
        }
    }

    val handleLogin = {
        coroutineScope.launch {
            isLoading = true
            message = null
            try {
                val res = RetrofitClient.api.login(LoginRequest(email = loginUsername.trim(), password = loginPassword))
                if (res.isSuccessful && res.body() != null) {
                    val auth = res.body()!!
                    MangaReaderApplication.instance.saveAuth(
                        token = auth.accessToken,
                        userId = auth.user.user_id,
                        username = auth.user.username,
                        role = auth.user.role
                    )
                    onAuthSuccess()
                } else {
                    message = res.errorBody()?.string() ?: "Invalid username or password"
                    isSuccessMessage = false
                }
            } catch (e: Exception) {
                message = e.localizedMessage ?: "Connection error"
                isSuccessMessage = false
            } finally {
                isLoading = false
            }
        }
    }

    val handleRegister = {
        coroutineScope.launch {
            isLoading = true
            message = null
            try {
                val res = RetrofitClient.api.register(
                    RegisterRequest(
                        email = regEmail,
                        username = regUsername,
                        display_name = regDisplayName.ifBlank { regUsername },
                        password = regPassword
                    )
                )
                if (res.isSuccessful) {
                    showOtpDialog = true
                    message = "OTP sent to $regEmail. Enter code within 120 seconds."
                    isSuccessMessage = true
                } else {
                    message = res.errorBody()?.string() ?: "Registration failed"
                    isSuccessMessage = false
                }
            } catch (e: Exception) {
                message = e.localizedMessage ?: "Connection error"
                isSuccessMessage = false
            } finally {
                isLoading = false
            }
        }
    }

    val handleVerifyOtp = {
        coroutineScope.launch {
            isLoading = true
            try {
                val res = RetrofitClient.api.verifyEmail(VerifyEmailRequest(email = regEmail, otp_code = otpCode))
                if (res.isSuccessful) {
                    showOtpDialog = false
                    isLoginMode = true
                    loginUsername = regUsername
                    loginPassword = regPassword
                    message = "Email verified! You can now log in."
                    isSuccessMessage = true
                } else {
                    message = res.errorBody()?.string() ?: "Invalid OTP code"
                    isSuccessMessage = false
                }
            } catch (e: Exception) {
                message = e.localizedMessage ?: "Verification error"
                isSuccessMessage = false
            } finally {
                isLoading = false
            }
        }
    }

    val handleResendOtp = {
        coroutineScope.launch {
            try {
                val res = RetrofitClient.api.resendOtp(ResendOtpRequest(email = regEmail))
                if (res.isSuccessful) {
                    otpSecondsLeft = 120
                    message = "Fresh OTP code sent to $regEmail"
                    isSuccessMessage = true
                }
            } catch (_: Exception) {}
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
                    text = if (isLoginMode) "AUTHENTICATION: SIGN IN" else "AUTHENTICATION: CREATE ACCOUNT",
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
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Tab Switcher
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DarkSurface, RoundedCornerShape(4.dp))
                    .border(1.dp, DarkBorder, RoundedCornerShape(4.dp))
                    .padding(4.dp)
            ) {
                listOf(true to "SIGN IN", false to "REGISTER").forEach { (isLogin, label) ->
                    val isSelected = isLoginMode == isLogin
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(3.dp))
                            .background(if (isSelected) DarkSurfaceElevated else DarkSurface)
                            .clickable { isLoginMode = isLogin; message = null }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = label,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                            color = if (isSelected) AccentAmber else TextSecondary
                        )
                    }
                }
            }

            if (message != null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(if (isSuccessMessage) AccentEmeraldSubtle else AccentRedSubtle, RoundedCornerShape(4.dp))
                        .border(1.dp, if (isSuccessMessage) AccentEmerald else AccentRed, RoundedCornerShape(4.dp))
                        .padding(10.dp)
                ) {
                    Text(
                        text = message!!,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp,
                        color = if (isSuccessMessage) AccentEmerald else AccentRed
                    )
                }
            }

            if (isLoginMode) {
                // Login Form
                OutlinedTextField(
                    value = loginUsername,
                    onValueChange = { loginUsername = it },
                    label = { Text("Username or Email", fontSize = 12.sp) },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AccentAmber,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary,
                        focusedContainerColor = DarkSurface,
                        unfocusedContainerColor = DarkSurface
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = loginPassword,
                    onValueChange = { loginPassword = it },
                    label = { Text("Password", fontSize = 12.sp) },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AccentAmber,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary,
                        focusedContainerColor = DarkSurface,
                        unfocusedContainerColor = DarkSurface
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                Button(
                    onClick = { handleLogin() },
                    enabled = !isLoading && loginUsername.isNotBlank() && loginPassword.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = AccentAmber, contentColor = DarkBackground),
                    shape = RoundedCornerShape(4.dp),
                    modifier = Modifier.fillMaxWidth().height(44.dp)
                ) {
                    Text(
                        text = if (isLoading) "AUTHENTICATING..." else "SIGN IN",
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    )
                }
            } else {
                // Register Form
                OutlinedTextField(
                    value = regEmail,
                    onValueChange = { regEmail = it },
                    label = { Text("Email Address", fontSize = 12.sp) },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AccentAmber,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary,
                        focusedContainerColor = DarkSurface,
                        unfocusedContainerColor = DarkSurface
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = regUsername,
                    onValueChange = { regUsername = it },
                    label = { Text("Username (Unique)", fontSize = 12.sp) },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AccentAmber,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary,
                        focusedContainerColor = DarkSurface,
                        unfocusedContainerColor = DarkSurface
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = regDisplayName,
                    onValueChange = { regDisplayName = it },
                    label = { Text("Display Name", fontSize = 12.sp) },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AccentAmber,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary,
                        focusedContainerColor = DarkSurface,
                        unfocusedContainerColor = DarkSurface
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = regPassword,
                    onValueChange = { regPassword = it },
                    label = { Text("Password (Min 8 chars, 1 digit, 1 upper)", fontSize = 12.sp) },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AccentAmber,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary,
                        focusedContainerColor = DarkSurface,
                        unfocusedContainerColor = DarkSurface
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                Button(
                    onClick = { handleRegister() },
                    enabled = !isLoading && regEmail.isNotBlank() && regUsername.isNotBlank() && regPassword.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = AccentAmber, contentColor = DarkBackground),
                    shape = RoundedCornerShape(4.dp),
                    modifier = Modifier.fillMaxWidth().height(44.dp)
                ) {
                    Text(
                        text = if (isLoading) "CREATING ACCOUNT..." else "REGISTER ACCOUNT",
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }

    // OTP Modal Dialog
    if (showOtpDialog) {
        AlertDialog(
            onDismissRequest = { showOtpDialog = false },
            title = {
                Text(
                    text = "EMAIL OTP VERIFICATION",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = "Enter the 6-digit verification code sent to $regEmail. Expires in:",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )

                    Text(
                        text = "${otpSecondsLeft}s",
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        color = if (otpSecondsLeft > 20) AccentAmber else AccentRed
                    )

                    OutlinedTextField(
                        value = otpCode,
                        onValueChange = { if (it.length <= 6) otpCode = it },
                        placeholder = { Text("6-digit code", color = TextMuted) },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = AccentAmber,
                            unfocusedBorderColor = DarkBorder,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )

                    if (otpSecondsLeft == 0) {
                        TextButton(onClick = { handleResendOtp() }) {
                            Text("RESEND NEW CODE", fontFamily = FontFamily.Monospace, color = AccentAmber)
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = { handleVerifyOtp() },
                    enabled = otpCode.length == 6,
                    colors = ButtonDefaults.buttonColors(containerColor = AccentAmber, contentColor = DarkBackground),
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text("VERIFY", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showOtpDialog = false }) {
                    Text("CANCEL", fontFamily = FontFamily.Monospace, color = TextSecondary)
                }
            },
            containerColor = DarkSurface
        )
    }
}

