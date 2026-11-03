package com.mangareader.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.mangareader.app.ui.navigation.MangaNavHost
import com.mangareader.app.ui.theme.MangaReaderTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MangaReaderTheme {
                MangaNavHost()
            }
        }
    }
}

