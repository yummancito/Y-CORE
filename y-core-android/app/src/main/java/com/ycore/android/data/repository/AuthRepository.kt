package com.ycore.android.data.repository

import com.ycore.android.data.local.TokenManager
import com.ycore.android.data.remote.api.YCoreApi
import com.ycore.android.data.remote.dto.*
import kotlinx.coroutines.flow.first
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

data class AuthResult(
    val success: Boolean,
    val error: String? = null
)

@Singleton
class AuthRepository @Inject constructor(
    private val api: YCoreApi,
    private val tokenManager: TokenManager
) {
    suspend fun login(email: String, password: String): AuthResult {
        return try {
            val response = api.login(LoginRequest(email, password))
            tokenManager.saveTokens(response.accessToken, response.refreshToken)
            tokenManager.saveUser(email)

            // Register device if not already registered
            val deviceId = tokenManager.deviceId.first()
            if (deviceId == null) {
                val newId = UUID.randomUUID().toString()
                try {
                    api.registerDevice(RegisterDeviceRequest(
                        name = android.os.Build.MODEL,
                        platform = "ANDROID"
                    ))
                } catch (_: Exception) {}
                tokenManager.saveDeviceId(newId)
            }

            AuthResult(success = true)
        } catch (e: Exception) {
            AuthResult(success = false, error = e.message ?: "Login failed")
        }
    }

    suspend fun register(email: String, password: String): AuthResult {
        return try {
            val response = api.register(RegisterRequest(email, password))
            AuthResult(success = true)
        } catch (e: Exception) {
            AuthResult(success = false, error = e.message ?: "Registration failed")
        }
    }

    suspend fun refreshToken(): Boolean {
        return try {
            val refreshToken = tokenManager.refreshToken.first() ?: return false
            val response = api.refresh(RefreshRequest(refreshToken))
            tokenManager.saveTokens(response.accessToken, response.refreshToken)
            true
        } catch (e: Exception) {
            false
        }
    }

    suspend fun logout() {
        try {
            val refreshToken = tokenManager.refreshToken.first()
            if (refreshToken != null) {
                api.logout(LogoutRequest(refreshToken))
            }
        } catch (_: Exception) {}
        tokenManager.clear()
    }

    suspend fun isLoggedIn(): Boolean {
        val token = tokenManager.accessToken.first()
        return token != null
    }
}
