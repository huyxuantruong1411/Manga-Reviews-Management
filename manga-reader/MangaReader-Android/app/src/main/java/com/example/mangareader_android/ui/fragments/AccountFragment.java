package com.example.mangareader_android.ui.fragments;

import android.content.res.ColorStateList;
import android.os.Bundle;
import android.os.CountDownTimer;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import com.example.mangareader_android.MangaReaderApp;
import com.example.mangareader_android.R;
import com.example.mangareader_android.data.api.RetrofitClient;
import com.example.mangareader_android.data.model.AuthModels.*;
import com.example.mangareader_android.databinding.FragmentAccountBinding;
import com.example.mangareader_android.util.UiMotionUtils;
import java.util.Locale;
import java.util.Map;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class AccountFragment extends Fragment implements UiMotionUtils.OnTabReselectedListener {

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

    @Override
    public void onTabReselected() {
        if (binding != null) {
            binding.scrollAccount.smoothScrollTo(0, 0);
        }
    }

    private void updateViewState() {
        if (binding == null) return;
        boolean loggedIn = MangaReaderApp.getInstance().isAuthenticated();
        UiMotionUtils.transitionLayout(binding.layoutAccountRoot);
        binding.layoutLoggedOut.setVisibility(loggedIn ? View.GONE : View.VISIBLE);
        binding.layoutLoggedIn.setVisibility(loggedIn ? View.VISIBLE : View.GONE);

        if (loggedIn) {
            loadUserProfile();
        }
    }

    private void styleAuthTabs(boolean isSignInActive) {
        int bgActive = ContextCompat.getColor(requireContext(), R.color.surface_dark);
        int bgInactive = ContextCompat.getColor(requireContext(), R.color.surface_elevated);
        int textActive = ContextCompat.getColor(requireContext(), R.color.accent_amber);
        int textInactive = ContextCompat.getColor(requireContext(), R.color.text_secondary);

        binding.btnTabSignIn.setBackgroundTintList(
                ColorStateList.valueOf(isSignInActive ? bgActive : bgInactive));
        binding.btnTabSignIn.setTextColor(isSignInActive ? textActive : textInactive);

        binding.btnTabRegister.setBackgroundTintList(
                ColorStateList.valueOf(!isSignInActive ? bgActive : bgInactive));
        binding.btnTabRegister.setTextColor(!isSignInActive ? textActive : textInactive);
    }

    private void setupAuthUI() {
        binding.btnTabSignIn.setOnClickListener(v -> {
            UiMotionUtils.transitionLayout(binding.layoutAccountRoot);
            binding.formSignIn.setVisibility(View.VISIBLE);
            binding.formRegister.setVisibility(View.GONE);
            styleAuthTabs(true);
        });

        binding.btnTabRegister.setOnClickListener(v -> {
            UiMotionUtils.transitionLayout(binding.layoutAccountRoot);
            binding.formSignIn.setVisibility(View.GONE);
            binding.formRegister.setVisibility(View.VISIBLE);
            styleAuthTabs(false);
        });

        binding.btnLoginSubmit.setOnClickListener(v -> handleLogin());
        binding.btnRegSubmit.setOnClickListener(v -> handleRegister());

        binding.btnSaveProfile.setOnClickListener(v -> handleUpdateProfile());
        binding.btnSignOut.setOnClickListener(v ->
                UiMotionUtils.dialogBuilder(requireContext())
                        .setTitle("Sign Out")
                        .setMessage("Sign out of your MangaReader account on this device?")
                        .setPositiveButton("Sign Out", (dialog, which) -> {
                            MangaReaderApp.getInstance().clearAuth();
                            updateViewState();
                            UiMotionUtils.showInfo(binding.getRoot(), "Signed out");
                        })
                        .setNegativeButton("Cancel", null)
                        .show());
    }

    private void setupServerUrlUI() {
        binding.etServerBaseUrl.setText(MangaReaderApp.getInstance().getBaseUrl());
        binding.btnSaveServerUrl.setOnClickListener(v -> {
            String url = binding.etServerBaseUrl.getText().toString().trim();
            if (!url.isEmpty()) {
                MangaReaderApp.getInstance().setBaseUrl(url);
                UiMotionUtils.showInfo(
                        binding.getRoot(),
                        "Backend endpoint updated: " + MangaReaderApp.getInstance().getBaseUrl());
            }
        });
    }

    private void handleLogin() {
        String username = binding.etLoginUsername.getText().toString().trim();
        String password = binding.etLoginPassword.getText().toString().trim();

        if (username.isEmpty() || password.isEmpty()) {
            UiMotionUtils.showInfo(binding.getRoot(), "Please fill in all fields");
            return;
        }

        binding.btnLoginSubmit.setEnabled(false);
        RetrofitClient.getApi().login(new LoginRequest(username, password)).enqueue(new Callback<TokenResponse>() {
            @Override
            public void onResponse(@NonNull Call<TokenResponse> call, @NonNull Response<TokenResponse> response) {
                if (!isAdded() || binding == null) return;
                binding.btnLoginSubmit.setEnabled(true);
                if (response.isSuccessful() && response.body() != null) {
                    TokenResponse tokenRes = response.body();
                    MangaReaderApp.getInstance().saveAuth(
                            tokenRes.accessToken,
                            tokenRes.user.user_id,
                            tokenRes.user.username,
                            tokenRes.user.role);
                    UiMotionUtils.showInfo(binding.getRoot(), "Welcome back, " + tokenRes.user.display_name);
                    updateViewState();
                } else {
                    UiMotionUtils.showError(binding.getRoot(), "Invalid credentials", null, null);
                }
            }

            @Override
            public void onFailure(@NonNull Call<TokenResponse> call, @NonNull Throwable t) {
                if (!isAdded() || binding == null) return;
                binding.btnLoginSubmit.setEnabled(true);
                UiMotionUtils.showError(binding.getRoot(), "Connection failed: " + t.getMessage(), null, null);
            }
        });
    }

    private void handleRegister() {
        String email = binding.etRegEmail.getText().toString().trim();
        String username = binding.etRegUsername.getText().toString().trim();
        String displayName = binding.etRegDisplayName.getText().toString().trim();
        String password = binding.etRegPassword.getText().toString().trim();

        if (email.isEmpty() || username.isEmpty() || password.isEmpty()) {
            UiMotionUtils.showInfo(binding.getRoot(), "Please fill in required fields");
            return;
        }

        binding.btnRegSubmit.setEnabled(false);
        RetrofitClient.getApi().register(new RegisterRequest(
                        email, username, displayName.isEmpty() ? username : displayName, password))
                .enqueue(new Callback<RegisterResponse>() {
                    @Override
                    public void onResponse(@NonNull Call<RegisterResponse> call, @NonNull Response<RegisterResponse> response) {
                        if (!isAdded() || binding == null) return;
                        binding.btnRegSubmit.setEnabled(true);
                        if (response.isSuccessful()) {
                            showOtpDialog(email);
                        } else {
                            UiMotionUtils.showError(binding.getRoot(), "Registration error (" + response.code() + ")", null, null);
                        }
                    }

                    @Override
                    public void onFailure(@NonNull Call<RegisterResponse> call, @NonNull Throwable t) {
                        if (!isAdded() || binding == null) return;
                        binding.btnRegSubmit.setEnabled(true);
                        UiMotionUtils.showError(binding.getRoot(), "Network error", null, null);
                    }
                });
    }

    private void showOtpDialog(String email) {
        LinearLayout layout = new LinearLayout(requireContext());
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(44, 24, 44, 20);

        final TextView tvTimer = new TextView(requireContext());
        tvTimer.setText("Expires in: 120s");
        tvTimer.setTextColor(ContextCompat.getColor(requireContext(), R.color.accent_amber));
        layout.addView(tvTimer);

        final EditText etOtp = new EditText(requireContext());
        etOtp.setHint("6-digit code");
        etOtp.setSingleLine(true);
        etOtp.setTextColor(ContextCompat.getColor(requireContext(), R.color.text_primary));
        layout.addView(etOtp);

        if (otpTimer != null) {
            otpTimer.cancel();
        }
        otpTimer = new CountDownTimer(120000L, 1000L) {
            @Override
            public void onTick(long millisUntilFinished) {
                tvTimer.setText(String.format(Locale.US, "Expires in: %ds", millisUntilFinished / 1000L));
            }

            @Override
            public void onFinish() {
                tvTimer.setText("Code expired. Please request a new code.");
            }
        }.start();

        UiMotionUtils.dialogBuilder(requireContext())
                .setTitle("Verify Email with OTP")
                .setView(layout)
                .setPositiveButton("Verify", (dialog, which) -> {
                    if (otpTimer != null) otpTimer.cancel();
                    String code = etOtp.getText().toString().trim();
                    RetrofitClient.getApi().verifyEmail(new VerifyEmailRequest(email, code))
                            .enqueue(new Callback<Map<String, Object>>() {
                                @Override
                                public void onResponse(@NonNull Call<Map<String, Object>> call, @NonNull Response<Map<String, Object>> response) {
                                    if (!isAdded() || binding == null) return;
                                    if (response.isSuccessful()) {
                                        UiMotionUtils.showInfo(binding.getRoot(), "Email verified! You can now sign in.");
                                        binding.btnTabSignIn.performClick();
                                    } else {
                                        UiMotionUtils.showError(binding.getRoot(), "Verification failed", null, null);
                                    }
                                }

                                @Override
                                public void onFailure(@NonNull Call<Map<String, Object>> call, @NonNull Throwable t) {
                                    if (!isAdded() || binding == null) return;
                                    UiMotionUtils.showError(binding.getRoot(), "Verification error", null, null);
                                }
                            });
                })
                .setNegativeButton("Cancel", (dialog, which) -> {
                    if (otpTimer != null) otpTimer.cancel();
                })
                .show();
    }

    private void loadUserProfile() {
        RetrofitClient.getApi().getMyProfile().enqueue(new Callback<UserProfile>() {
            @Override
            public void onResponse(@NonNull Call<UserProfile> call, @NonNull Response<UserProfile> response) {
                if (!isAdded() || binding == null) return;
                if (response.isSuccessful() && response.body() != null) {
                    UserProfile profile = response.body();
                    binding.tvProfileDisplayName.setText(
                            profile.display_name != null ? profile.display_name : profile.username);
                    binding.tvProfileUsername.setText("@" + profile.username);
                    binding.tvProfileRoleBadge.setText(
                            profile.role != null ? profile.role.toUpperCase(Locale.US) : "READER");

                    binding.etEditDisplayName.setText(profile.display_name != null ? profile.display_name : "");
                    binding.etEditBio.setText(profile.bio != null ? profile.bio : "");
                }
            }

            @Override
            public void onFailure(@NonNull Call<UserProfile> call, @NonNull Throwable t) {
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
                        if (!isAdded() || binding == null) return;
                        if (response.isSuccessful()) {
                            UiMotionUtils.showInfo(binding.getRoot(), "Profile updated");
                            loadUserProfile();
                        } else {
                            UiMotionUtils.showError(binding.getRoot(), "Failed to update profile", null, null);
                        }
                    }

                    @Override
                    public void onFailure(@NonNull Call<UserProfile> call, @NonNull Throwable t) {
                        if (!isAdded() || binding == null) return;
                        UiMotionUtils.showError(binding.getRoot(), "Error updating profile", null, null);
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
