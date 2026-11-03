package com.mangareader.app.data.api

import com.mangareader.app.MangaReaderApplication
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val token = MangaReaderApplication.instance.getAccessToken()

        val requestBuilder = originalRequest.newBuilder()
        if (!token.isNullOrBlank() && originalRequest.header("Authorization") == null) {
            requestBuilder.addHeader("Authorization", "Bearer $token")
        }

        val response = chain.proceed(requestBuilder.build())
        if (response.code == 401) {
            MangaReaderApplication.instance.clearAuth()
        }
        return response
    }
}

