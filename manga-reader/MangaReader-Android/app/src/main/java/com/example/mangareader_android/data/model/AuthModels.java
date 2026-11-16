package com.example.mangareader_android.data.model;

import com.google.gson.annotations.SerializedName;

public class AuthModels {

    public static class LoginRequest {
        public String email;
        public String password;

        public LoginRequest(String emailOrUsername, String password) {
            this.email = emailOrUsername;
            this.password = password;
        }
    }

    public static class RegisterRequest {
        public String email;
        public String username;
        public String display_name;
        public String password;

        public RegisterRequest(String email, String username, String displayName, String password) {
            this.email = email;
            this.username = username;
            this.display_name = displayName;
            this.password = password;
        }
    }

    public static class VerifyEmailRequest {
        public String email;
        public String otp_code;

        public VerifyEmailRequest(String email, String otpCode) {
            this.email = email;
            this.otp_code = otpCode;
        }
    }

    public static class ResendOtpRequest {
        public String email;

        public ResendOtpRequest(String email) {
            this.email = email;
        }
    }

    public static class UpdateProfileRequest {
        public String display_name;
        public String bio;
        public String birth_date;
        public Boolean show_birth_date;

        public UpdateProfileRequest(String displayName, String bio) {
            this.display_name = displayName;
            this.bio = bio;
        }
    }

    public static class UpdatePasswordRequest {
        public String current_password;
        public String new_password;
        public String confirm_password;

        public UpdatePasswordRequest(String currentPassword, String newPassword) {
            this(currentPassword, newPassword, newPassword);
        }

        public UpdatePasswordRequest(String currentPassword, String newPassword, String confirmPassword) {
            this.current_password = currentPassword;
            this.new_password = newPassword;
            this.confirm_password = confirmPassword;
        }
    }

    public static class UserProfile {
        public String user_id;
        public String email;
        public String username;
        public String display_name;
        public String role;
        public String status;
        public String avatar_url;
        public String bio;
        public String birth_date;
        public boolean show_birth_date;
        public String lock_reason;
        public String locked_until;
        public String created_at;
    }

    public static class TokenResponse {
        @SerializedName("access_token")
        public String accessToken;

        @SerializedName("refresh_token")
        public String refreshToken;

        @SerializedName("token_type")
        public String tokenType;

        public UserProfile user;
    }

    public static class RegisterResponse {
        public String message;
        public String email;
        public int expires_in_seconds;
    }
}

