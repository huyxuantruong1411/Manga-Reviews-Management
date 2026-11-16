package com.mangareader.app.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.mangareader.app.MangaReaderApplication
import com.mangareader.app.ui.screens.auth.AuthScreen
import com.mangareader.app.ui.screens.auth.ProfileScreen
import com.mangareader.app.ui.screens.catalog.CatalogScreen
import com.mangareader.app.ui.screens.catalog.SearchScreen
import com.mangareader.app.ui.screens.detail.MangaDetailScreen
import com.mangareader.app.ui.screens.lists.HistoryScreen
import com.mangareader.app.ui.screens.lists.ReadingListsScreen
import com.mangareader.app.ui.screens.lists.StatsScreen
import com.mangareader.app.ui.screens.reader.ReaderScreen
import com.mangareader.app.ui.theme.*

@Composable
fun MangaNavHost() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination?.route

    // Hide bottom bar when in reader or search
    val showBottomBar = currentDestination !in listOf(
        Screen.Reader.route,
        Screen.Search.route,
        Screen.Auth.route
    )

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar(
                    containerColor = DarkBackground,
                    modifier = Modifier.border(width = 1.dp, color = DarkBorder)
                ) {
                    val bottomItems = listOf(
                        Triple(Screen.Catalog.route, "CATALOG", Icons.Default.Home),
                        Triple(Screen.ReadingLists.route, "LISTS", Icons.Default.List),
                        Triple(Screen.History.route, "HISTORY", Icons.Default.History),
                        Triple(Screen.Stats.route, "METRICS", Icons.Default.BarChart),
                        Triple(Screen.Profile.route, "ACCOUNT", Icons.Default.Person)
                    )

                    bottomItems.forEach { (route, label, icon) ->
                        val selected = currentDestination == route
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                if (route == Screen.Profile.route && MangaReaderApplication.instance.getAccessToken() == null) {
                                    navController.navigate(Screen.Auth.route)
                                } else {
                                    navController.navigate(route) {
                                        popUpTo(navController.graph.findStartDestination().id) {
                                            saveState = true
                                        }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                }
                            },
                            icon = { Icon(icon, contentDescription = label) },
                            label = {
                                Text(
                                    text = label,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 9.sp,
                                    fontWeight = if (selected) androidx.compose.ui.text.font.FontWeight.Bold else androidx.compose.ui.text.font.FontWeight.Normal
                                )
                            },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = AccentAmber,
                                selectedTextColor = AccentAmber,
                                unselectedIconColor = TextMuted,
                                unselectedTextColor = TextMuted,
                                indicatorColor = DarkSurfaceElevated
                            )
                        )
                    }
                }
            }
        },
        containerColor = DarkBackground
    ) { paddingValues ->
        NavHost(
            navController = navController,
            startDestination = Screen.Catalog.route,
            modifier = Modifier.padding(paddingValues)
        ) {
            composable(Screen.Catalog.route) {
                CatalogScreen(
                    onMangaClick = { slug -> navController.navigate(Screen.MangaDetail.createRoute(slug)) },
                    onSearchClick = { navController.navigate(Screen.Search.route) }
                )
            }

            composable(Screen.Search.route) {
                SearchScreen(
                    onMangaClick = { slug -> navController.navigate(Screen.MangaDetail.createRoute(slug)) },
                    onBackClick = { navController.popBackStack() }
                )
            }

            composable(
                route = Screen.MangaDetail.route,
                arguments = listOf(navArgument("idOrSlug") { type = NavType.StringType })
            ) { backStackEntry ->
                val idOrSlug = backStackEntry.arguments?.getString("idOrSlug") ?: ""
                MangaDetailScreen(
                    idOrSlug = idOrSlug,
                    onChapterClick = { chId, page -> navController.navigate(Screen.Reader.createRoute(chId, page)) },
                    onMangaClick = { slug -> navController.navigate(Screen.MangaDetail.createRoute(slug)) },
                    onBackClick = { navController.popBackStack() },
                    onAuthRequired = { navController.navigate(Screen.Auth.route) }
                )
            }

            composable(
                route = Screen.Reader.route,
                arguments = listOf(
                    navArgument("chapterId") { type = NavType.StringType },
                    navArgument("page") { type = NavType.IntType; defaultValue = 1 },
                )
            ) { backStackEntry ->
                val chapterId = backStackEntry.arguments?.getString("chapterId") ?: ""
                val initialPage = backStackEntry.arguments?.getInt("page") ?: 1
                ReaderScreen(
                    chapterId = chapterId,
                    initialPage = initialPage,
                    onNavigateChapter = { nextId -> navController.navigate(Screen.Reader.createRoute(nextId, 1)) {
                        popUpTo(Screen.Reader.route) { inclusive = true }
                    } },
                    onBackClick = { navController.popBackStack() }
                )
            }

            composable(Screen.ReadingLists.route) {
                ReadingListsScreen(
                    onBackClick = { navController.popBackStack() }
                )
            }

            composable(Screen.History.route) {
                HistoryScreen(
                    onChapterClick = { chId, page -> navController.navigate(Screen.Reader.createRoute(chId, page)) },
                    onMangaClick = { idOrSlug -> navController.navigate(Screen.MangaDetail.createRoute(idOrSlug)) },
                    onBackClick = { navController.popBackStack() }
                )
            }

            composable(Screen.Stats.route) {
                StatsScreen(
                    onBackClick = { navController.popBackStack() }
                )
            }

            composable(Screen.Profile.route) {
                ProfileScreen(
                    onSignOut = { navController.navigate(Screen.Catalog.route) },
                    onBackClick = { navController.popBackStack() }
                )
            }

            composable(Screen.Auth.route) {
                AuthScreen(
                    onAuthSuccess = { navController.popBackStack() },
                    onBackClick = { navController.popBackStack() }
                )
            }
        }
    }
}

