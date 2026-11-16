package com.example.mangareader_android;

import android.app.Application;
import android.content.Context;
import android.content.SharedPreferences;
import java.net.URI;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MangaReaderApp extends Application {

    private static MangaReaderApp instance;
    private SharedPreferences prefs;

    private static final String PREFS_NAME = "manga_reader_java_prefs";
    private static final String KEY_TOKEN = "access_token";
    private static final String KEY_USER_ID = "user_id";
    private static final String KEY_USERNAME = "username";
    private static final String KEY_ROLE = "user_role";
    private static final String KEY_BASE_URL = "base_url";

    public static final String DEFAULT_BASE_URL = "http://10.0.2.2:18000/";

    private static final Pattern LOCAL_API_PREFIX =
            Pattern.compile("^https?://(?:127\\.0\\.0\\.1|localhost):18000(/.*)?$");
    private static final Pattern LOCAL_HOST_URL =
            Pattern.compile("^(https?://)(?:127\\.0\\.0\\.1|localhost)(:\\d+)?(/.*)?$");

    public static String resolveMediaUrl(String url, String baseUrl) {
        if (url == null || url.trim().isEmpty()) {
            return null;
        }
        String trimmed = url.trim();
        String safeBase = (baseUrl == null || baseUrl.trim().isEmpty()) ? DEFAULT_BASE_URL : baseUrl.trim();
        String cleanBase = safeBase.endsWith("/") ? safeBase.substring(0, safeBase.length() - 1) : safeBase;

        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            Matcher apiMatch = LOCAL_API_PREFIX.matcher(trimmed);
            if (apiMatch.matches()) {
                String path = apiMatch.group(1);
                return cleanBase + (path != null ? path : "");
            }
            Matcher hostMatch = LOCAL_HOST_URL.matcher(trimmed);
            if (hostMatch.matches()) {
                String baseHost = null;
                try {
                    baseHost = URI.create(cleanBase).getHost();
                } catch (Exception ignored) {
                }
                if (baseHost != null && !baseHost.isEmpty()) {
                    String scheme = hostMatch.group(1);
                    String port = hostMatch.group(2) != null ? hostMatch.group(2) : "";
                    String path = hostMatch.group(3) != null ? hostMatch.group(3) : "";
                    return scheme + baseHost + port + path;
                }
            }
            return trimmed;
        }

        return trimmed.startsWith("/") ? cleanBase + trimmed : cleanBase + "/" + trimmed;
    }

    public static String resolveMediaUrl(String url) {
        String base = instance != null ? instance.getBaseUrl() : DEFAULT_BASE_URL;
        return resolveMediaUrl(url, base);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static synchronized MangaReaderApp getInstance() {
        return instance;
    }

    public String getBaseUrl() {
        return prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL);
    }

    public void setBaseUrl(String url) {
        if (url == null || url.trim().isEmpty()) {
            url = DEFAULT_BASE_URL;
        }
        String sanitized = url.endsWith("/") ? url : url + "/";
        prefs.edit().putString(KEY_BASE_URL, sanitized).apply();
    }

    public String getToken() {
        return prefs.getString(KEY_TOKEN, null);
    }

    public String getUserId() {
        return prefs.getString(KEY_USER_ID, null);
    }

    public String getUsername() {
        return prefs.getString(KEY_USERNAME, null);
    }

    public String getUserRole() {
        return prefs.getString(KEY_ROLE, null);
    }

    public void saveAuth(String token, String userId, String username, String role) {
        prefs.edit()
                .putString(KEY_TOKEN, token)
                .putString(KEY_USER_ID, userId)
                .putString(KEY_USERNAME, username)
                .putString(KEY_ROLE, role)
                .apply();
    }

    public void clearAuth() {
        prefs.edit()
                .remove(KEY_TOKEN)
                .remove(KEY_USER_ID)
                .remove(KEY_USERNAME)
                .remove(KEY_ROLE)
                .apply();
    }

    public boolean isAuthenticated() {
        return getToken() != null && !getToken().isEmpty();
    }
}

