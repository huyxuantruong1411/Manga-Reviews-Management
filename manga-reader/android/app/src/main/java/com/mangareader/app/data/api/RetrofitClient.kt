package com.mangareader.app.data.api

import com.mangareader.app.MangaReaderApplication
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {

    private var cachedApi: MangaReaderApi? = null
    private var lastBaseUrl: String? = null

    val api: MangaReaderApi
        get() {
            val currentBaseUrl = MangaReaderApplication.instance.getBaseUrl()
            if (cachedApi == null || lastBaseUrl != currentBaseUrl) {
                lastBaseUrl = currentBaseUrl
                cachedApi = createApi(currentBaseUrl)
            }
            return cachedApi!!
        }

    private fun createApi(baseUrl: String): MangaReaderApi {
        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        val okHttpClient = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor())
            .addInterceptor(loggingInterceptor)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(MangaReaderApi::class.java)
    }
}

