package com.bejohnself.passwordmanager.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.bejohnself.passwordmanager.R
import com.bejohnself.passwordmanager.ui.addedit.AddEditScreen
import com.bejohnself.passwordmanager.ui.common.appContainer
import com.bejohnself.passwordmanager.ui.export.ExportScreen
import com.bejohnself.passwordmanager.ui.home.HomeScreen
import com.bejohnself.passwordmanager.ui.login.LoginScreen
import com.bejohnself.passwordmanager.ui.query.QueryScreen
import com.bejohnself.passwordmanager.ui.settings.ChangeMasterPasswordScreen
import com.bejohnself.passwordmanager.ui.settings.SettingsScreen
import com.bejohnself.passwordmanager.ui.sync.SyncScreen

object Routes {
    const val LOGIN = "login"
    const val MAIN = "main"
    const val EXPORT = "export"
    const val SYNC = "sync"
    const val SETTINGS = "settings"
    const val CHANGE_MASTER_PASSWORD = "changeMasterPassword"
    const val ADD = "add"
    const val EDIT = "edit/{id}"

    fun edit(id: String) = "edit/$id"
}

enum class MainTab(val label: String, val icon: Int) {
    QUERY("查询", R.drawable.ic_search),
    ADD("添加", R.drawable.ic_plus),
    ME("我的", R.drawable.ic_home),
}

@Composable
fun PasswordManagerApp() {
    val navController = rememberNavController()

    NavHost(navController, startDestination = Routes.LOGIN) {
        composable(Routes.LOGIN) {
            LoginScreen(
                onLoginSuccess = {
                    navController.navigate(Routes.MAIN) {
                        popUpTo(Routes.LOGIN) { inclusive = true }
                    }
                }
            )
        }
        composable(Routes.MAIN) {
            MainTabs(
                navController = navController,
                onLoggedOut = {
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
        composable(Routes.EXPORT) {
            ExportScreen(navController)
        }
        composable(Routes.SYNC) {
            SyncScreen(
                navController = navController,
                onLoggedOut = {
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(navController = navController)
        }
        composable(Routes.CHANGE_MASTER_PASSWORD) {
            ChangeMasterPasswordScreen(
                navController = navController,
                onPasswordChanged = {
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
        composable(Routes.ADD) {
            AddEditScreen(
                editId = null,
                onBack = { navController.popBackStack() },
                onSaved = { navController.popBackStack() }
            )
        }
        composable(
            Routes.EDIT,
            arguments = listOf(navArgument("id") { type = NavType.StringType })
        ) { entry ->
            AddEditScreen(
                editId = entry.arguments?.getString("id"),
                onBack = { navController.popBackStack() },
                onSaved = { navController.popBackStack() }
            )
        }
    }
}

@Composable
fun MainTabs(
    navController: NavHostController,
    onLoggedOut: () -> Unit,
) {
    val repo = appContainer().passwordRepository
    var currentTab by rememberSaveable { mutableStateOf(MainTab.QUERY) }

    NavigationSuiteScaffold(
        navigationSuiteItems = {
            MainTab.entries.forEach { tab ->
                item(
                    icon = {
                        Icon(
                            painterResource(tab.icon),
                            contentDescription = tab.label,
                            modifier = Modifier.size(20.dp)
                        )
                    },
                    label = { Text(tab.label) },
                    selected = currentTab == tab,
                    onClick = { currentTab = tab }
                )
            }
        }
    ) {
        Scaffold { padding ->
            when (currentTab) {
                MainTab.QUERY -> QueryScreen(
                    repo = repo,
                    navController = navController,
                    modifier = Modifier.padding(padding)
                )

                MainTab.ADD -> AddEditScreen(
                    repo = repo,
                    editId = null,
                    onBack = null,
                    onSaved = {},
                    showTopBar = false,
                    modifier = Modifier.padding(padding)
                )

                MainTab.ME -> HomeScreen(
                    repo = repo,
                    navController = navController,
                    onLoggedOut = onLoggedOut,
                    modifier = Modifier.padding(padding)
                )
            }
        }
    }
}