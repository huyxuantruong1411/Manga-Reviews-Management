package com.example.mangareader_android.data.api;

import com.example.mangareader_android.MangaReaderApp;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.logging.HttpLoggingInterceptor;
import retrofit2.Retrofit;
import retrofit2.converter.gson.GsonConverterFactory;

public class RetrofitClient {

    private static MangaReaderApi apiInstance;
    private static String cachedBaseUrl;

    public static synchronized MangaReaderApi getApi() {
        String currentBaseUrl = MangaReaderApp.getInstance().getBaseUrl();
        if (apiInstance == null || !currentBaseUrl.equals(cachedBaseUrl)) {
            cachedBaseUrl = currentBaseUrl;
            apiInstance = createRetrofit(currentBaseUrl).create(MangaReaderApi.class);
        }
        return apiInstance;
    }

    private static Retrofit createRetrofit(String baseUrl) {
        HttpLoggingInterceptor logging = new HttpLoggingInterceptor();
        logging.setLevel(HttpLoggingInterceptor.Level.BODY);

        OkHttpClient client = new OkHttpClient.Builder()
                .addInterceptor(new AuthInterceptor())
                .addInterceptor(logging)
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .build();

        return new Retrofit.Builder()
                .baseUrl(baseUrl)
                .client(client)
                .addConverterFactory(GsonConverterFactory.create())
                .build();
    }
}

