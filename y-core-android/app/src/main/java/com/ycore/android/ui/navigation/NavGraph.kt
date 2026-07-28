package com.ycore.android.ui.navigation

import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.ycore.android.controls.InputSender
import com.ycore.android.data.local.TokenManager
import com.ycore.android.data.remote.websocket.CloudWebSocket
import com.ycore.android.ui.screens.*
import com.ycore.android.viewmodel.AuthViewModel
import com.ycore.android.viewmodel.HostListViewModel
import dagger.hilt.android.EntryPointAccessors
import javax.inject.Inject

object Routes {
    const val LOGIN = "login"
    const val HOSTS = "hosts"
    const val LIBRARY = "library/{hostId}/{hostName}"
    const val STREAMING = "streaming/{hostId}/{hostName}"
    const val SETTINGS = "settings"

    fun library(hostId: String, hostName: String) = "library/$hostId/$hostName"
    fun streaming(hostId: String, hostName: String) = "streaming/$hostId/$hostName"
}

@Composable
fun YCoreNavGraph() {
    val navController = rememberNavController()
    val context = LocalContext.current
    val tokenManager = remember {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            HiltEntryPoint::class.java
        ).provideTokenManager()
    }
    val cloudWs = remember {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            HiltEntryPoint::class.java
        ).provideCloudWebSocket()
    }

    NavHost(
        navController = navController,
        startDestination = Routes.LOGIN
    ) {
        composable(Routes.LOGIN) {
            LoginScreen(
                onLoginSuccess = {
                    navController.navigate(Routes.HOSTS) {
                        popUpTo(Routes.LOGIN) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.HOSTS) {
            val viewModel: HostListViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsState()

            // Connect WebSocket when entering hosts screen
            LaunchedEffect(Unit) {
                val token = tokenManager.accessToken.firstOrNull()
                val deviceId = tokenManager.deviceId.firstOrNull() ?: ""
                if (token != null) {
                    viewModel.connectWebSocket(token, deviceId)
                }
            }

            HostListScreen(
                onHostSelected = { hostId, hostName ->
                    navController.navigate(Routes.library(hostId, hostName))
                },
                viewModel = viewModel
            )

            LaunchedEffect(uiState.pairingStatus, uiState.libraryGames) {
                if (uiState.pairingStatus == "accepted" && uiState.libraryGames.isNotEmpty()) {
                    val hostId = uiState.selectedHost?.id ?: return@LaunchedEffect
                    val hostName = uiState.selectedHost?.name ?: return@LaunchedEffect
                }
            }
        }

        composable(
            route = Routes.LIBRARY,
            arguments = listOf(
                navArgument("hostId") { type = NavType.StringType },
                navArgument("hostName") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val hostId = backStackEntry.arguments?.getString("hostId") ?: ""
            val hostName = backStackEntry.arguments?.getString("hostName") ?: ""
            val viewModel: HostListViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsState()

            LibraryScreen(
                hostName = hostName,
                hostId = hostId,
                games = uiState.libraryGames,
                isLoading = uiState.libraryLoading,
                launchStatus = uiState.launchStatus,
                onLaunchGame = { gameId, gameName ->
                    viewModel.launchGame(gameId, gameName)
                },
                onBack = { navController.popBackStack() }
            )

            LaunchedEffect(uiState.launchStatus) {
                if (uiState.launchStatus == "launching") {
                    kotlinx.coroutines.delay(2000)
                    navController.navigate(Routes.streaming(hostId, hostName))
                }
            }
        }

        composable(
            route = Routes.STREAMING,
            arguments = listOf(
                navArgument("hostId") { type = NavType.StringType },
                navArgument("hostName") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val hostId = backStackEntry.arguments?.getString("hostId") ?: ""
            val hostName = backStackEntry.arguments?.getString("hostName") ?: ""

            val webrtc = remember {
                EntryPointAccessors.fromApplication(
                    context.applicationContext,
                    HiltEntryPoint::class.java
                ).provideWebRTCManager()
            }

            val inputSender = remember(hostId) {
                InputSender(cloudWs, hostId)
            }

            LaunchedEffect(hostId) {
                webrtc.initialize(hostId)
                webrtc.startConnection()
            }

            StreamingScreen(
                hostId = hostId,
                hostName = hostName,
                webrtc = webrtc,
                inputSender = inputSender,
                onDisconnect = {
                    webrtc.disconnect()
                    navController.popBackStack(Routes.HOSTS, inclusive = false)
                }
            )

            DisposableEffect(Unit) {
                onDispose {
                    webrtc.destroy()
                }
            }
        }

        composable(Routes.SETTINGS) {
            SettingsScreen(
                tokenManager = tokenManager,
                onLogout = {
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }
    }
}

@dagger.hilt.EntryPoint
@dagger.hilt.InstallIn(dagger.hilt.components.SingletonComponent::class)
interface HiltEntryPoint {
    fun provideTokenManager(): TokenManager
    fun provideCloudWebSocket(): CloudWebSocket
    fun provideWebRTCManager(): com.ycore.android.webrtc.WebRTCManager
}
