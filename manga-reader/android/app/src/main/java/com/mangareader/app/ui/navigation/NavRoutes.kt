package com.mangareader.app.ui.navigation

sealed class Screen(val route: String) {
    object Catalog : Screen("catalog")
    object Search : Screen("search")
    object MangaDetail : Screen("manga/{idOrSlug}") {
        fun createRoute(idOrSlug: String) = "manga/$idOrSlug"
    }
    object Reader : Screen("reader/{chapterId}") {
        fun createRoute(chapterId: String) = "reader/$chapterId"
    }
    object ReadingLists : Screen("lists")
    object History : Screen("history")
    object Stats : Screen("stats")
    object Profile : Screen("profile")
    object Auth : Screen("auth")
}

