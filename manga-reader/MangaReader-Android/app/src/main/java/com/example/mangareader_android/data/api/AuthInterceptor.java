package com.example.mangareader_android.data.api;

import androidx.annotation.NonNull;
import com.example.mangareader_android.MangaReaderApp;
import java.io.IOException;
import okhttp3.Interceptor;
import okhttp3.Request;
import okhttp3.Response;

public class AuthInterceptor implements Interceptor {

    @NonNull
    @Override
    public Response intercept(@NonNull Chain chain) throws IOException {
        Request original = chain.request();
        String token = MangaReaderApp.getInstance().getToken();

        Request.Builder builder = original.newBuilder();
        if (token != null && !token.trim().isEmpty() && original.header("Authorization") == null) {
            builder.addHeader("Authorization", "Bearer " + token);
        }

        Response response = chain.proceed(builder.build());
        if (response.code() == 401) {
            MangaReaderApp.getInstance().clearAuth();
        }
        return response;
    }
}

