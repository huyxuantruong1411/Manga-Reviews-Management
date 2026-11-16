package com.mangareader.app.data.model

import com.google.gson.annotations.SerializedName

data class LoginRequest(
    val email: String,
    val password: String,
)

data class RegisterRequest(
    val email: String,
    val username: String,
    val display_name: String,
    val password: String,
)

data class VerifyEmailRequest(
    val email: String,
    val otp_code: String,
)

data class ResendOtpRequest(
    val email: String,
)

data class UpdateProfileRequest(
    val display_name: String? = null,
    val bio: String? = null,
    val birth_date: String? = null,
    val show_birth_date: Boolean? = null,
)

data class UpdatePasswordRequest(
    val current_password: String,
    val new_password: String,
    val confirm_password: String = new_password,
)

data class UserProfile(
    val user_id: String,
    val email: String? = null,
    val username: String,
    val display_name: String,
    val role: String,
    val status: String,
    val avatar_url: String? = null,
    val bio: String? = null,
    val birth_date: String? = null,
    val show_birth_date: Boolean = false,
    val lock_reason: String? = null,
    val locked_until: String? = null,
    val created_at: String,
)

data class TokenResponse(
    @SerializedName("access_token") val accessToken: String,
    @SerializedName("refresh_token") val refreshToken: String,
    @SerializedName("token_type") val tokenType: String,
    val user: UserProfile,
)

data class RegisterResponse(
    val message: String,
    val email: String,
    val expires_in_seconds: Int = 120,
)

