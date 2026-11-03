package com.example.mangareader_android.ui.fragments;

import android.app.AlertDialog;
import android.os.Bundle;
import android.os.CountDownTimer;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import com.example.mangareader_android.MangaReaderApp;
import com.example.mangareader_android.R;
import com.example.mangareader_android.data.api.RetrofitClient;
import com.example.mangareader_android.data.model.AuthModels.*;
import com.example.mangareader_android.databinding.FragmentAccountBinding;
import java.util.Locale;
import java.util.Map;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class AccountFragment extends Fragment {

    private FragmentAccountBinding binding;
    private CountDownTimer otpTimer;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        binding = FragmentAccountBinding.inflate(inflater, container, false);
        return binding.getRoot();
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        setupAuthUI();
        setupServerUrlUI();
        updateViewState();
    }

    private void updateViewState() {
        boolean loggedIn = MangaReaderApp.getInstance().isAuthenticated();
        binding.layoutLoggedOut.setVisibility(loggedIn ? View.GONE : View.VISIBLE);
        binding.layoutLoggedIn.setVisibility(loggedIn ? View.VISIBLE : View.GONE);

        if (loggedIn) {
            loadUserProfile();
        }
    }

    private void setupAuthUI() {
        binding.btnTabSignIn.setOnClickListener(v -> {
            binding.formSignIn.setVisibility(View.VISIBLE);
            binding.formRegister.setVisibility(View.GONE);
            binding.btnTabSignIn.setTextColor(ContextCompat.getColor(requireContext(), R.color.accent_amber));
            binding.btnTabRegister.setTextColor(ContextCompat.getColor(requireContext(), R.color.text_secondary));
        });

        binding.btnTabRegister.setOnClickListener(v -> {
            binding.formSignIn.setVisibility(View.GONE);
            binding.formRegister.setVisibility(View.VISIBLE);
            binding.btnTabRegister.setTextColor(ContextCompat.getColor(requireContext(), R.color.accent_amber));
            binding.btnTabSignIn.setTextColor(ContextCompat.getColor(requireContext(), R.color.text_secondary));
        });

        binding.btnLoginSubmit.setOnClickListener(v -> handleLogin());
        binding.btnRegSubmit.setOnClickListener(v -> handleRegister());

        binding.btnSaveProfile.setOnClickListener(v -> handleUpdateProfile());
        binding.btnSignOut.setOnClickListener(v -> {
            MangaReaderApp.getInstance().clearAuth();
            updateViewState();
            Toast.makeText(getContext(), "Signed out", Toast.LENGTH_SHORT).show();
        });
    }

    private void setupServerUrlUI() {
        binding.etServerBaseUrl.setText(MangaReaderApp.getInstance().getBaseUrl());
        binding.btnSaveServerUrl.setOnClickListener(v -> {
            String url = binding.etServerBaseUrl.getText().toString().trim();
            if (!url.isEmpty()) {
                MangaReaderApp.getInstance().setBaseUrl(url);
                Toast.makeText(getContext(), "Backend endpoint updated to: " + MangaReaderApp.getInstance().getBaseUrl(), Toast.LENGTH_LONG).show();
            }
        });
    }

    private void handleLogin() {
        String username = binding.etLoginUsername.getText().toString().trim();
        String password = binding.etLoginPassword.getText().toString().trim();

        if (username.isEmpty() || password.isEmpty()) {
            Toast.makeText(getContext(), "Please fill in all fields", Toast.LENGTH_SHORT).show();
            return;
        }

        binding.btnLoginSubmit.setEnabled(false);
        RetrofitClient.getApi().login(new LoginRequest(username, password)).enqueue(new Callback<TokenResponse>() {
            @Override
            public void onResponse(@NonNull Call<TokenResponse> call, @NonNull Response<TokenResponse> response) {
                binding.btnLoginSubmit.setEnabled(true);
                if (response.isSuccessful() && response.body() != null) {
                    TokenResponse tokenRes = response.body();
                    MangaReaderApp.getInstance().saveAuth(
                            tokenRes.accessToken,
                            tokenRes.user.user_id,
                            tokenRes.user.username,
                            tokenRes.user.role
                    );
                    Toast.makeText(getContext(), "Welcome back, " + tokenRes.user.display_name, Toast.LENGTH_SHORT).show();
                    updateViewState();
                } else {
                    Toast.makeText(getContext(), "Invalid credentials", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(@NonNull Call<TokenResponse> call, @NonNull Throwable t) {
                binding.btnLoginSubmit.setEnabled(true);
                Toast.makeText(getContext(), "Connection failed: " + t.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void handleRegister() {
        String email = binding.etRegEmail.getText().toString().trim();
        String username = binding.etRegUsername.getText().toString().trim();
        String displayName = binding.etRegDisplayName.getText().toString().trim();
        String password = binding.etRegPassword.getText().toString().trim();

        if (email.isEmpty() || username.isEmpty() || password.isEmpty()) {
            Toast.makeText(getContext(), "Please fill in required fields", Toast.LENGTH_SHORT).show();
            return;
        }

        binding.btnRegSubmit.setEnabled(false);
        RetrofitClient.getApi().register(new RegisterRequest(email, username, displayName.isEmpty() ? username : displayName, password))
                .enqueue(new Callback<RegisterResponse>() {
                    @Override
                    public void onResponse(@NonNull Call<RegisterResponse> call, @NonNull Response<RegisterResponse> response) {
                        binding.btnRegSubmit.setEnabled(true);
                        if (response.isSuccessful()) {
                            showOtpDialog(email);
                        } else {
                            Toast.makeText(getContext(), "Registration error", Toast.LENGTH_SHORT).show();
                        }
                    }

                    @Override
                    public void onFailure(@NonNull Call<RegisterResponse> call, @NonNull Throwable t) {
                        binding.btnRegSubmit.setEnabled(true);
                        Toast.makeText(getContext(), "Network error", Toast.LENGTH_SHORT).show();
                    }
                });
    }

    private void showOtpDialog(String email) {
        AlertDialog.Builder builder = new AlertDialog.Builder(requireContext());
        builder.setTitle("Verify Email with OTP");

        LinearLayout layout = new LinearLayout(requireContext());
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(40, 20, 40, 20);

        final TextView tvTimer = new TextView(requireContext());
        tvTimer.setText("Expires in: 120s");
        tvTimer.setTextColor(ContextCompat.getColor(requireContext(), R.color.accent_amber));
        layout.addView(tvTimer);

        final EditText etOtp = new EditText(requireContext());
        etOtp.setHint("6-digit code");
        layout.addView(etOtp);

        builder.setView(layout);

        otpTimer = new CountDownTimer(120000, 1000) {
            @Override
            public void onTick(long millisUntilFinished) {
                tvTimer.setText(String.format(Locale.US, "Expires in: %ds", millisUntilFinished / 1000));
            }

            @Override
            public void onFinish() {
                tvTimer.setText("Code expired. Please request a new code.");
            }
        }.start();

        builder.setPositiveButton("Verify", (dialog, which) -> {
            if (otpTimer != null) otpTimer.cancel();
            String code = etOtp.getText().toString().trim();
            RetrofitClient.getApi().verifyEmail(new VerifyEmailRequest(email, code))
                    .enqueue(new Callback<Map<String, Object>>() {
                        @Override
                        public void onResponse(@NonNull Call<Map<String, Object>> call, @NonNull Response<Map<String, Object>> response) {
                            if (response.isSuccessful()) {
                                Toast.makeText(getContext(), "Email verified! You can now sign in.", Toast.LENGTH_LONG).show();
                                binding.btnTabSignIn.performClick();
                            } else {
                                Toast.makeText(getContext(), "Verification failed", Toast.LENGTH_SHORT).show();
                            }
                        }

                        @Override
                        public void onFailure(@NonNull Call<Map<String, Object>> call, @NonNull Throwable t) {
                            Toast.makeText(getContext(), "Verification error", Toast.LENGTH_SHORT).show();
                        }
                    });
        });
        builder.setNegativeButton("Cancel", (dialog, which) -> {
            if (otpTimer != null) otpTimer.cancel();
        });
        builder.show();
    }

    private void loadUserProfile() {
        RetrofitClient.getApi().getMyProfile().enqueue(new Callback<UserProfile>() {
            @Override
            public void onResponse(@NonNull Call<UserProfile> call, @NonNull Response<UserProfile> response) {
                if (response.isSuccessful() && response.body() != null) {
                    UserProfile profile = response.body();
                    binding.tvProfileDisplayName.setText(profile.display_name != null ? profile.display_name : profile.username);
                    binding.tvProfileUsername.setText("@" + profile.username);
                    binding.tvProfileRoleBadge.setText(profile.role != null ? profile.role.toUpperCase() : "READER");

                    binding.etEditDisplayName.setText(profile.display_name != null ? profile.display_name : "");
                    binding.etEditBio.setText(profile.bio != null ? profile.bio : "");
                }
            }

            @Override
            public void onFailure(@NonNull Call<UserProfile> call, @NonNull Throwable t) {
                // ignore
            }
        });
    }

    private void handleUpdateProfile() {
        String newName = binding.etEditDisplayName.getText().toString().trim();
        String newBio = binding.etEditBio.getText().toString().trim();

        RetrofitClient.getApi().updateProfile(new UpdateProfileRequest(newName, newBio))
                .enqueue(new Callback<UserProfile>() {
                    @Override
                    public void onResponse(@NonNull Call<UserProfile> call, @NonNull Response<UserProfile> response) {
                        if (response.isSuccessful()) {
                            Toast.makeText(getContext(), "Profile updated", Toast.LENGTH_SHORT).show();
                            loadUserProfile();
                        }
                    }

                    @Override
                    public void onFailure(@NonNull Call<UserProfile> call, @NonNull Throwable t) {
                        Toast.makeText(getContext(), "Error updating profile", Toast.LENGTH_SHORT).show();
                    }
                });
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        if (otpTimer != null) otpTimer.cancel();
        binding = null;
    }
}

