package com.mangareader.app

import android.app.Application
import android.content.Context
import android.content.SharedPreferences
import java.net.URI

class MangaReaderApplication : Application() {

    companion object {
        lateinit var instance: MangaReaderApplication
            private set

        const val PREFS_NAME = "manga_reader_prefs"
        const val KEY_ACCESS_TOKEN = "access_token"
        const val KEY_USER_ID = "user_id"
        const val KEY_USERNAME = "username"
        const val KEY_USER_ROLE = "user_role"
        const val KEY_BASE_URL = "base_url"

        // Default: 10.0.2.2 is Android Emulator alias for Host Machine localhost
        const val DEFAULT_BASE_URL = "http://10.0.2.2:18000/"

        private val LOCAL_API_PREFIX = Regex("^https?://(127\\.0\\.0\\.1|localhost)(?::18000)(/.*)?$")
        private val LOCAL_HOST_URL = Regex("^(https?://)(127\\.0\\.0\\.1|localhost)(:\\d+)?(/.*)?$")

        fun resolveMediaUrl(url: String?, baseUrl: String): String? {
            if (url.isNullOrBlank()) return null
            val trimmed = url.trim()
            val cleanBase = baseUrl.trim().trimEnd('/')

            if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                val apiMatch = LOCAL_API_PREFIX.matchEntire(trimmed)
                if (apiMatch != null) {
                    val path = apiMatch.groupValues[2].ifEmpty { "" }
                    return "$cleanBase$path"
                }
                val hostMatch = LOCAL_HOST_URL.matchEntire(trimmed)
                if (hostMatch != null) {
                    val baseHost = try {
                        URI(cleanBase).host
                    } catch (_: Exception) {
                        null
                    }
                    if (!baseHost.isNullOrBlank()) {
                        val scheme = hostMatch.groupValues[1]
                        val port = hostMatch.groupValues[3]
                        val path = hostMatch.groupValues[4]
                        return "$scheme$baseHost$port$path"
                    }
                }
                return trimmed
            }

            return if (trimmed.startsWith("/")) "$cleanBase$trimmed" else "$cleanBase/$trimmed"
        }

        fun resolveMediaUrl(url: String?): String? {
            val base = if (::instance.isInitialized) instance.getBaseUrl() else DEFAULT_BASE_URL
            return resolveMediaUrl(url, base)
        }
    }

    lateinit var prefs: SharedPreferences
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getBaseUrl(): String {
        return prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL
    }

    fun setBaseUrl(url: String) {
        val sanitized = if (url.endsWith("/")) url else "$url/"
        prefs.edit().putString(KEY_BASE_URL, sanitized).apply()
    }

    fun getAccessToken(): String? = prefs.getString(KEY_ACCESS_TOKEN, null)

    fun saveAuth(token: String, userId: String, username: String, role: String) {
        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, token)
            .putString(KEY_USER_ID, userId)
            .putString(KEY_USERNAME, username)
            .putString(KEY_USER_ROLE, role)
            .apply()
    }

    fun clearAuth() {
        prefs.edit()
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_USER_ID)
            .remove(KEY_USERNAME)
            .remove(KEY_USER_ROLE)
            .apply()
    }
}

